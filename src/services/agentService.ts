import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  logger,
  generateCorrelationId,
  hashValue,
  summarizeContent,
  isContentLoggingEnabled,
} from "../utils/logger";
import {
  AgentQueryRequest,
  AgentQueryResponse,
  AgentStatus,
  AgentCapabilities,
  AgentHealthCheck,
  AgentTool,
  AgentErrorKind,
  AgentActionStatus
} from '@/types/agent';
import agentConfig from '@/config/agent';

/**
 * Correlation metadata for an agent query. Never contains the prompt text itself (#273).
 */
export function summarizeAgentQuery(request: AgentQueryRequest, correlationId: string) {
  const { length, hash } = summarizeContent(request.query ?? '');
  return {
    correlationId,
    userHash: hashValue(request.userId ?? ''),
    queryLength: length,
    queryHash: hash,
  };
}

/**
 * Correlation metadata for an agent response. Never contains the response payload itself (#273).
 */
export function summarizeAgentResponse(
  correlationId: string,
  status: number | undefined,
  data: unknown,
  startedAt: number
) {
  const { length, hash } = summarizeContent(data);
  const result = (data as { result?: { success?: boolean } } | undefined)?.result;
  return {
    correlationId,
    status,
    success: result?.success,
    durationMs: Date.now() - startedAt,
    responseLength: length,
    responseHash: hash,
  };
}

/**
 * Mask user identifiers embedded in agent URL paths (e.g. `/memory/:userId`).
 */
export function redactAgentUrl(url: string | undefined): string | undefined {
  return url?.replace(/(\/memory\/)[^/?#]+/, (_m, prefix: string) => `${prefix}[user]`);
}

/**
 * Reduce an error to safe fields. Axios errors carry `config.data` (the request body,
 * including the prompt) and `response.data`, so they must not be logged whole.
 */
export function describeAgentError(error: unknown) {
  const e = error as {
    message?: string;
    code?: string;
    config?: { method?: string; url?: string };
    response?: { status?: number };
  } | undefined;
  return {
    message: e?.message,
    code: e?.code,
    status: e?.response?.status,
    method: e?.config?.method?.toUpperCase(),
    url: redactAgentUrl(e?.config?.url),
  };
}

// Queries that can move funds or change on-chain state. A timeout on these must not be
// blindly retried, because the first attempt may still complete (#274).
const STATE_CHANGING_PATTERN =
  /\b(send|transfer|swap|trade|buy|sell|lend|borrow|withdraw|repay|deposit|stake|unstake|liquidate|claim|harvest|deploy|pay)\b|\b(add|remove)\s+(liquidity|collateral)\b/i;

/**
 * Whether a query looks like a state-changing action rather than a read (balance, APY, ...).
 */
export function isStateChangingQuery(query: string): boolean {
  return STATE_CHANGING_PATTERN.test(query ?? '');
}

/**
 * Categorize an agent request failure so a timeout is never reported as a connectivity error.
 * Axios sets `code: 'ECONNABORTED'` (or `ETIMEDOUT`) and a "timeout of Nms exceeded" message on timeouts.
 */
export function classifyAgentError(error: unknown): AgentErrorKind {
  const e = error as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { message?: string } };
  } | undefined;
  const message = (e?.response?.data?.message || e?.message || '').toLowerCase();

  if (message.includes('invalid query')) return 'invalid_query';
  if (e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT' || message.includes('timeout')) return 'timeout';
  if (e?.response?.status === 504 || e?.response?.status === 408) return 'timeout';
  if (e?.response?.status) return 'server';
  if (e?.code === 'ERR_NETWORK' || message.includes('network')) return 'network';
  return 'unknown';
}

/**
 * User-facing copy per failure kind. Timeouts on state-changing actions tell the user the
 * action may still be running and to check status instead of resending.
 */
export function agentErrorMessage(kind: AgentErrorKind, stateChanging: boolean): string {
  switch (kind) {
    case 'timeout':
      return stateChanging
        ? "This action is taking longer than expected and may still be running. Check its status before trying again so it isn't submitted twice."
        : 'The request is taking longer than expected. Please try again.';
    case 'invalid_query':
      return "I didn't understand that. Could you please rephrase your question?";
    case 'network':
      return "I'm having trouble connecting. Please check your internet connection and try again.";
    default:
      return 'Agent service is currently unavailable. Please try again later.';
  }
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
          logger.debug(`[AgentService] Making request to: ${config.method?.toUpperCase()} ${redactAgentUrl(config.url)}`);
          return config;
        },
        (error) => {
          logger.error('[AgentService] Request error:', describeAgentError(error));
          return Promise.reject(error);
        }
      );

      // Response interceptor for error handling
      this.api.interceptors.response.use(
        (response) => {
          logger.debug(`[AgentService] Response received: ${response.status} ${redactAgentUrl(response.config.url)}`);
          return response;
        },
        (error) => {
          logger.error('[AgentService] Response error:', describeAgentError(error));
          this.isConnected = false;
          return Promise.reject(error);
        }
      );
    }
  }

  /**
   * Check if the agent service is available and healthy using a HEAD probe request.
   * Catches errors internally and returns an unhealthy status object without throwing.
   *
   * @returns Promise resolving to `AgentHealthCheck` object indicating health status ('healthy' | 'unhealthy') and metrics.
   */
  async healthCheck(): Promise<AgentHealthCheck> {
    try {
      // Since the experimental backend doesn't have a /health endpoint,
      // we'll try to make a simple request to test connectivity
      // We'll use a HEAD request to avoid authentication issues
      const response = await this.api.request({
        method: 'HEAD',
        url: '/',
        timeout: 5000
      });
      
      this.isConnected = true;
      this.lastHealthCheck = new Date();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          agent: {
            status: 'up',
            responseTime: 0
          }
        },
        system: {
          memory: { used: 0, total: 0, percentage: 0 },
          cpu: { usage: 0 },
          uptime: 0
        }
      };
    } catch (error) {
      this.isConnected = false;
      logger.error('[AgentService] Health check failed:', describeAgentError(error));
      // Don't throw error, return unhealthy status instead
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          agent: {
            status: 'down',
            responseTime: 0
          }
        },
        system: {
          memory: { used: 0, total: 0, percentage: 0 },
          cpu: { usage: 0 },
          uptime: 0
        }
      };
    }
  }

  /**
   * Get current agent status and connected protocol services status.
   *
   * @returns Promise resolving to `AgentStatus` envelope.
   */
  async getStatus(): Promise<AgentStatus> {
    // Since the experimental backend doesn't have a /status endpoint,
    // we'll return a basic status based on connectivity
    return {
      isOnline: this.isConnected,
      version: '1.0.0',
      uptime: 0,
      lastActivity: new Date().toISOString(),
      activeConnections: 1,
      services: {
        soroswap: { isActive: true, isHealthy: true, lastCheck: new Date().toISOString() },
        blend: { isActive: true, isHealthy: true, lastCheck: new Date().toISOString() },
        aquarius: { isActive: true, isHealthy: true, lastCheck: new Date().toISOString() },
        phoenix: { isActive: true, isHealthy: true, lastCheck: new Date().toISOString() },
        database: { isActive: true, isHealthy: true, lastCheck: new Date().toISOString() }
      }
    };
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
  async queryAgent(request: AgentQueryRequest): Promise<AgentQueryResponse> {
    // The correlation id doubles as the client request id the backend can report status for (#274).
    const correlationId = request.clientRequestId ?? generateCorrelationId('agent_query');
    const stateChanging = isStateChangingQuery(request.query);
    const startedAt = Date.now();
    try {
      // Prompt/response content is never logged by default; only correlation metadata (#273).
      logger.debug('[AgentService] Sending query:', summarizeAgentQuery(request, correlationId));
      if (isContentLoggingEnabled()) {
        logger.debug('[AgentService] Query content:', { correlationId, query: request.query });
      }

      const response = await this.api.post('/query', { ...request, clientRequestId: correlationId });

      logger.debug(
        '[AgentService] Query response:',
        summarizeAgentResponse(correlationId, response.status, response.data, startedAt)
      );
      if (isContentLoggingEnabled()) {
        logger.debug('[AgentService] Response content:', { correlationId, data: response.data });
      }
      
      // The experimental backend returns { result: ... } format
      // Ensure we return the proper AgentQueryResponse format
      if (response.data && response.data.result) {
        return {
          result: { ...response.data.result, requestId: correlationId, stateChanging }
        };
      }

      // Fallback if response format is unexpected
      return {
        result: {
          success: true,
          data: response.data || 'Query processed successfully',
          error: null,
          requestId: correlationId,
          stateChanging
        }
      };
    } catch (error: unknown) {
      logger.error('[AgentService] Query failed:', {
        correlationId,
        durationMs: Date.now() - startedAt,
        ...describeAgentError(error),
      });

      // Convert technical errors to user-friendly messages, keeping timeouts distinct (#274)
      const axiosError = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMsg = axiosError.response?.data?.message || axiosError.message || 'Unknown error';
      const errorKind = classifyAgentError(error);

      // Return a structured error response
      return {
        result: {
          success: false,
          data: agentErrorMessage(errorKind, stateChanging),
          error: errorMsg,
          errorKind,
          requestId: correlationId,
          stateChanging
        }
      };
    }
  }

  /**
   * Check whether a query that timed out on the client is still running or has finished (#274).
   * Calls `GET /query/:requestId/status`. Never throws: if the backend does not support the
   * endpoint (404/501) or cannot be reached, resolves with `status: 'unknown'`.
   *
   * Expected backend response: `{ status: 'pending' | 'completed' | 'failed', result?: AgentQueryResponse['result'] }`.
   *
   * @param requestId - `result.requestId` from the timed-out `queryAgent` response.
   */
  async getActionStatus(requestId: string): Promise<AgentActionStatus> {
    const checkedAt = () => new Date().toISOString();
    try {
      const response = await this.api.get(`/query/${encodeURIComponent(requestId)}/status`, {
        timeout: 10000
      });
      const body = response.data as { status?: string; result?: AgentQueryResponse['result'] } | undefined;
      const status = body?.status;

      if (status === 'pending' || status === 'completed' || status === 'failed') {
        return {
          requestId,
          status,
          result: body?.result ? { ...body.result, requestId } : undefined,
          checkedAt: checkedAt()
        };
      }
      return { requestId, status: 'unknown', checkedAt: checkedAt() };
    } catch (error) {
      logger.error('[AgentService] Status check failed:', { correlationId: requestId, ...describeAgentError(error) });
      return { requestId, status: 'unknown', checkedAt: checkedAt() };
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
      logger.error('[AgentService] Failed to get memory:', describeAgentError(error));
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
      logger.error('[AgentService] Failed to clear memory:', describeAgentError(error));
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
      logger.error('[AgentService] Failed to get tools:', describeAgentError(error));
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
      logger.error(`[AgentService] Failed to execute tool ${toolName}:`, describeAgentError(error));
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
