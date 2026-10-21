import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from "../utils/logger";
import {
  AgentQueryRequest,
  AgentQueryResponse,
  AgentStatus,
  AgentCapabilities,
  AgentHealthCheck,
  AgentTool
} from '@/types/agent';
import agentConfig from '@/config/agent';
import { parseAgentEnvelope, protocolErrorResult } from './agentEnvelope';

interface TimedResult {
  ok: boolean;
  httpStatus?: number;
  data?: unknown;
  elapsedMs: number | null;
  errorCode?: string;
  errorMessage?: string;
}

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

/** Map the `/health` body status to client health; a 2xx without a status counts as healthy. */
function mapHealthStatus(
  status: string | undefined,
  fallback: AgentHealthCheck['status'] = 'healthy'
): AgentHealthCheck['status'] {
  switch ((status ?? '').toLowerCase()) {
    case 'ok':
    case 'healthy':
    case 'up':
      return 'healthy';
    case 'degraded':
      return 'degraded';
    case 'down':
    case 'unhealthy':
    case 'error':
      return 'unhealthy';
    default:
      return fallback;
  }
}

function outage(
  timestamp: string,
  probe: AgentHealthCheck['probe'],
  healthEndpointSupported: boolean,
  result: TimedResult
): AgentHealthCheck {
  const timedOut = result.errorCode === 'ECONNABORTED' || result.errorCode === 'ETIMEDOUT' || /timeout/i.test(result.errorMessage ?? '');
  const reason: AgentHealthCheck['reason'] =
    result.httpStatus !== undefined ? 'server_error' : timedOut ? 'timeout' : 'network';
  return {
    status: 'unhealthy',
    timestamp,
    probe,
    healthEndpointSupported,
    responseTimeMs: result.elapsedMs,
    reason,
    services: { agent: { status: 'down', responseTime: result.elapsedMs ?? undefined, error: reason } },
  };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** Parse a `GET /status` body (#271). Returns null when the body is not an object. */
export function parseStatusMetrics(body: unknown): Omit<AgentStatus, 'isOnline' | 'health'> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const services: AgentStatus['services'] = {};
  if (typeof b.services === 'object' && b.services !== null && !Array.isArray(b.services)) {
    for (const [name, raw] of Object.entries(b.services as Record<string, unknown>)) {
      if (typeof raw !== 'object' || raw === null) continue;
      const svc = raw as Record<string, unknown>;
      services[name] = {
        isActive: bool(svc.isActive),
        isHealthy: bool(svc.isHealthy),
        lastCheck: str(svc.lastCheck),
        ...(str(svc.error) ? { error: str(svc.error)! } : {}),
      };
    }
  }
  return {
    source: 'backend',
    version: str(b.version),
    uptime: num(b.uptimeSeconds ?? b.uptime),
    lastActivity: str(b.lastActivity),
    activeConnections: num(b.activeConnections),
    services,
  };
}

/**
 * Direct client service for communicating with the AI Agent backend.
 */
class AgentService {
  private api: AxiosInstance;
  private baseURL: string;
  private isConnected: boolean = false;
  private lastHealthCheck: Date | null = null;

  constructor() {
    this.baseURL = agentConfig.baseURL;
    
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: agentConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    if (agentConfig.enableLogging) {
      this.api.interceptors.request.use(
        (config) => {
          logger.debug(`[AgentService] Making request to: ${config.method?.toUpperCase()} ${config.url}`);
          return config;
        },
        (error) => {
          console.error('[AgentService] Request error:', error);
          return Promise.reject(error);
        }
      );

      // Response interceptor for error handling
      this.api.interceptors.response.use(
        (response) => {
          logger.debug(`[AgentService] Response received: ${response.status} ${response.config.url}`);
          return response;
        },
        (error) => {
          console.error('[AgentService] Response error:', error);
          this.isConnected = false;
          return Promise.reject(error);
        }
      );
    }
  }

  /**
   * Probe agent health and measure response time (#272).
   *
   * 1. `GET /health` (documented in docs/API_CONTRACT.md). Its `status` field decides health.
   * 2. If that endpoint is unsupported (404/405/501), fall back to `HEAD /` and report a
   *    connectivity-only result (`probe: 'connectivity'`, `healthEndpointSupported: false`):
   *    any HTTP answer means "reachable", not "healthy".
   * 3. Network errors, timeouts and 5xx answers are outages (`unhealthy` with a `reason`).
   *
   * Never throws. `responseTimeMs` is the measured round trip of the probe that answered,
   * or null when nothing answered.
   */
  async healthCheck(): Promise<AgentHealthCheck> {
    const timestamp = () => new Date().toISOString();
    const finish = (result: AgentHealthCheck): AgentHealthCheck => {
      this.isConnected = result.status !== 'unhealthy';
      this.lastHealthCheck = new Date();
      return result;
    };

    const health = await this.timedRequest({ method: 'GET', url: '/health', timeout: 5000 });

    if (health.ok) {
      const body = health.data as { status?: string; services?: unknown } | undefined;
      const status = mapHealthStatus(body?.status);
      return finish({
        status,
        timestamp: timestamp(),
        probe: 'health_endpoint',
        healthEndpointSupported: true,
        responseTimeMs: health.elapsedMs,
        services: {
          agent: { status: status === 'healthy' ? 'up' : status === 'degraded' ? 'degraded' : 'down', responseTime: health.elapsedMs },
        },
      });
    }

    if (health.httpStatus !== undefined && [404, 405, 501].includes(health.httpStatus)) {
      // No health endpoint: only connectivity can be reported
      const probe = await this.timedRequest({ method: 'HEAD', url: '/', timeout: 5000 });
      if (probe.httpStatus !== undefined && probe.httpStatus < 500) {
        return finish({
          status: 'healthy',
          timestamp: timestamp(),
          probe: 'connectivity',
          healthEndpointSupported: false,
          responseTimeMs: probe.elapsedMs,
          services: { agent: { status: 'up', responseTime: probe.elapsedMs } },
        });
      }
      return finish(outage(timestamp(), 'connectivity', false, probe));
    }

    // 503 with a health body (e.g. {status: "degraded"}) still describes the service
    const body = health.data as { status?: string } | undefined;
    if (health.httpStatus === 503 && body?.status) {
      const status = mapHealthStatus(body.status, 'unhealthy');
      return finish({
        status,
        timestamp: timestamp(),
        probe: 'health_endpoint',
        healthEndpointSupported: true,
        responseTimeMs: health.elapsedMs,
        reason: status === 'unhealthy' ? 'server_error' : undefined,
        services: { agent: { status: status === 'degraded' ? 'degraded' : 'down', responseTime: health.elapsedMs } },
      });
    }

    console.error('[AgentService] Health check failed:', health.errorMessage ?? health.httpStatus);
    return finish(outage(timestamp(), 'health_endpoint', true, health));
  }

  /** Run a request and measure its round trip; never throws. */
  private async timedRequest(config: AxiosRequestConfig): Promise<TimedResult> {
    const start = now();
    try {
      const response = await this.api.request(config);
      return { ok: true, httpStatus: response.status, data: response.data, elapsedMs: Math.round(now() - start) };
    } catch (error) {
      const e = error as { code?: string; message?: string; response?: { status?: number; data?: unknown } };
      const answered = e?.response?.status !== undefined;
      return {
        ok: false,
        httpStatus: e?.response?.status,
        data: e?.response?.data,
        // Only a real HTTP answer has a meaningful round trip
        elapsedMs: answered ? Math.round(now() - start) : null,
        errorCode: e?.code,
        errorMessage: e?.message,
      };
    }
  }

  /**
   * Agent status from real sources only (#271).
   * - `isOnline` comes from `healthCheck()` (#272).
   * - Metrics come from `GET /status` when the backend supports it; otherwise every metric is
   *   `null`, `services` is empty and `source` is `'unavailable'`.
   * Never throws.
   */
  async getStatus(): Promise<AgentStatus> {
    const [health, metrics] = await Promise.all([
      this.healthCheck().catch(() => null),
      this.fetchStatusMetrics(),
    ]);
    return {
      isOnline: health ? health.status !== 'unhealthy' : false,
      health,
      ...metrics,
    };
  }

  /** `GET /status`, validated field by field; unknown or invalid fields stay null. */
  private async fetchStatusMetrics(): Promise<Omit<AgentStatus, 'isOnline' | 'health'>> {
    const unavailable: Omit<AgentStatus, 'isOnline' | 'health'> = {
      source: 'unavailable',
      version: null,
      uptime: null,
      lastActivity: null,
      activeConnections: null,
      services: {},
    };
    try {
      const response = await this.api.get('/status', { timeout: 5000 });
      return parseStatusMetrics(response.data) ?? unavailable;
    } catch {
      // 404/501 (no endpoint) and outages both mean "no metrics", never fabricated ones
      return unavailable;
    }
  }

  /**
   * Get available agent capabilities, supported actions, assets, and protocols.
   *
   * @returns Promise resolving to `AgentCapabilities` configuration.
   */
  async getCapabilities(): Promise<AgentCapabilities> {
    // Since the experimental backend doesn't have a /capabilities endpoint,
    // we'll return the capabilities based on the intent agent
    return {
      supportedActions: [
        'transfer_xlm', 'swap', 'lend', 'borrow', 'withdraw', 'repay', 'check_balance', 'get_apy',
        'health_check', 'liquidate', 'claim_rewards', 'add_collateral',
        'remove_collateral', 'deposit_vault', 'withdraw_vault', 'get_vaults',
        'get_vault_positions', 'harvest_vault', 'get_strategies', 'swap_stellar_dex',
        'add_liquidity', 'remove_liquidity'
      ],
      supportedAssets: ['XLM', 'USDC', 'USDT', 'BTC', 'ETH', 'AQUA'],
      supportedProtocols: ['Soroswap', 'Blend', 'Aquarius', 'Phoenix'],
      features: {
        defi: true,
        crossChain: true,
        voiceCommands: false,
        smartContracts: true,
        yieldFarming: true,
        lending: true,
        borrowing: true,
        swapping: true
      },
      limits: {
        maxQueryLength: 1000,
        maxConcurrentQueries: 10,
        rateLimitPerMinute: 60
      }
    };
  }

  /**
   * Send an intent query to the AI Agent service endpoint (`/query`).
   * Never throws directly on HTTP error; catches exceptions and returns a resolved `AgentQueryResponse` object with `success: false` and a user-friendly error message.
   *
   * @param request - Query request envelope containing user prompt string.
   * @returns Promise resolving to `AgentQueryResponse` (`{ result: { success, data, error, executionTrace } }`).
   *
   * @example
   * ```ts
   * import { agentService } from '@/services/agentService';
   * 
   * const response = await agentService.queryAgent({ query: 'What is my current XLM balance?' });
   * if (response.result.success) {
   *   console.log('Response:', response.result.data);
   * } else {
   *   console.error('Error:', response.result.error);
   * }
   * ```
   */
  async queryAgent(request: AgentQueryRequest, options: { signal?: AbortSignal } = {}): Promise<AgentQueryResponse> {
    try {
      logger.debug('[AgentService] Sending query:', request.query);
      
      const response = await this.api.post('/query', request, { signal: options.signal });
      
      logger.debug('[AgentService] Query response:', response.data);
      
      // Only documented envelopes are accepted; anything else is a protocol error rather than
      // a misleading success (#275)
      const parsed = parseAgentEnvelope(response.data);
      if (!parsed.ok) {
        console.error('[AgentService] Malformed /query response:', parsed.reason);
        return { result: protocolErrorResult(parsed.reason) };
      }
      return { result: parsed.result };
    } catch (error: unknown) {
      console.error('[AgentService] Query failed:', error);

      // Convert technical errors to user-friendly messages
      let friendlyMessage = 'Agent service is currently unavailable. Please try again later.';
      const axiosError = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMsg = axiosError.response?.data?.message || axiosError.message || 'Unknown error';
      
      if (errorMsg.includes('invalid query')) {
        friendlyMessage = "I didn't understand that. Could you please rephrase your question?";
      } else if (errorMsg.includes('timeout')) {
        friendlyMessage = "The request is taking longer than expected. Please try again.";
      } else if (errorMsg.includes('network')) {
        friendlyMessage = "I'm having trouble connecting. Please check your internet connection and try again.";
      }
      
      // Return a structured error response
      return {
        result: {
          success: false,
          data: friendlyMessage,
          error: errorMsg
        }
      };
    }
  }

  /**
   * Get conversation memory entries for a specific user ID.
   * Does NOT throw on HTTP failure; logs warning and returns an empty array.
   *
   * @param userId - Target user identifier string.
   * @returns Promise resolving to array of string memory entries.
   */
  async getMemory(userId: string): Promise<string[]> {
    try {
      const response = await this.api.get<string[]>(`/memory/${userId}`);
      return response.data;
    } catch (error) {
      console.error('[AgentService] Failed to get memory:', error);
      return [];
    }
  }

  /**
   * Clear agent memory entries for a specific user ID.
   *
   * @param userId - Target user identifier string.
   * @returns Promise resolving to void when memory deletion completes.
   * @throws {Error} Throws Error with message 'Failed to clear agent memory' if API call fails.
   */
  async clearMemory(userId: string): Promise<void> {
    try {
      await this.api.delete(`/memory/${userId}`);
    } catch (error) {
      console.error('[AgentService] Failed to clear memory:', error);
      throw new Error('Failed to clear agent memory');
    }
  }

  /**
   * Fetch list of available tools and their operational status.
   * Does NOT throw on HTTP error; logs warning and returns an empty array.
   *
   * @returns Promise resolving to array of tool definitions.
   */
  async getTools(): Promise<AgentTool[]> {
    try {
      const response = await this.api.get<AgentTool[]>('/tools');
      return response.data;
    } catch (error) {
      console.error('[AgentService] Failed to get tools:', error);
      return [];
    }
  }

  /**
   * Execute a specific agent tool by name with parameters.
   *
   * @param toolName - Identifier name of the tool to execute.
   * @param params - Parameters payload object for tool execution.
   * @returns Promise resolving to tool execution response output.
   * @throws {Error} Throws Error if tool execution fails.
   */
  async executeTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await this.api.post(`/tools/${toolName}/execute`, params);
      return response.data;
    } catch (error) {
      console.error(`[AgentService] Failed to execute tool ${toolName}:`, error);
      throw new Error(`Failed to execute tool: ${toolName}`);
    }
  }

  /**
   * Check if agent is currently marked as connected based on recent health checks or network requests.
   *
   * @returns Synchronous boolean flag (`true` if connected, `false` otherwise).
   */
  isAgentConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Retrieve timestamp of the most recent health check execution.
   *
   * @returns `Date` instance of last health check, or `null` if health check has not been run.
   */
  getLastHealthCheck(): Date | null {
    return this.lastHealthCheck;
  }

  /**
   * Initialize the agent service by executing an initial health check.
   * Catches errors internally and logs a warning without throwing.
   *
   * @returns Promise resolving to void.
   */
  async initialize(): Promise<void> {
    try {
      await this.healthCheck();
      logger.debug('[AgentService] Successfully initialized');
    } catch (error) {
      console.warn('[AgentService] Failed to initialize, will retry on first use');
    }
  }

  /**
   * Generic low-level request method for agent endpoints.
   *
   * @template T - Expected response payload type.
   * @param config - Axios request configuration object.
   * @returns Promise resolving to response data of type T.
   * @throws {AxiosError} Throws on HTTP request error.
   */
  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.api.request<T>(config);
    return response.data;
  }
}

// Create and export a singleton instance
export const agentService = new AgentService();
export default agentService;
