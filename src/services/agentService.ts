import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from "../utils/logger";
import {
  AgentQueryRequest,
  AgentQueryResponse,
  AgentStatus,
  AgentCapabilities,
  AgentHealthCheck,
  AgentTool,
  AgentErrorKind,
  AgentOperationStatus,
  AgentRetryDecision
} from '@/types/agent';
import agentConfig from '@/config/agent';

// Queries that can move funds or change on-chain state. Retrying these blindly could repeat an
// action that already succeeded, so they require a status check first (#262).
const STATE_CHANGING_PATTERN =
  /\b(send|transfer|swap|trade|buy|sell|lend|borrow|withdraw|repay|deposit|stake|unstake|liquidate|claim|harvest|deploy|pay)\b|\b(add|remove)\s+(liquidity|collateral)\b/i;

/** Whether a query looks like a state-changing action rather than a read (balance, APY, ...). */
export function isStateChangingQuery(query: string): boolean {
  return STATE_CHANGING_PATTERN.test(query ?? '');
}

/** Categorize an agent request failure (#262). */
export function classifyAgentError(error: unknown): AgentErrorKind {
  const e = error as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { message?: string } };
  } | undefined;
  const message = (e?.response?.data?.message || e?.message || '').toLowerCase();
  const status = e?.response?.status;

  if (message.includes('invalid query')) return 'invalid_query';
  if (status === 401 || status === 403 || message.includes('not authenticated')) return 'unauthenticated';
  if (e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT' || message.includes('timeout') || status === 408 || status === 504) {
    return 'timeout';
  }
  if (status && (status >= 500 || status === 429)) return 'server';
  if (status) return 'invalid_query';
  if (e?.code === 'ERR_NETWORK' || message.includes('network')) return 'network';
  return 'unknown';
}

/**
 * Whether a failure of this kind may be retried as-is (#262). Rejected input and missing
 * auth will fail the same way again, so they are not retryable.
 */
export function isRetryableErrorKind(kind: AgentErrorKind | undefined): boolean {
  return kind === 'timeout' || kind === 'network' || kind === 'server' || kind === 'unknown';
}

/**
 * Decide how to retry a failed query (#262). Read-only queries retry directly. State-changing
 * queries first ask the backend what happened to the original request:
 * - completed → don't resend; show the result
 * - pending → don't resend yet
 * - failed / not_found → safe to resend (with the same request id as idempotency key)
 * - unknown (no status endpoint / unreachable) → ask the user to confirm
 */
export function decideRetry(stateChanging: boolean, status: AgentOperationStatus | null): AgentRetryDecision {
  if (!stateChanging) return { action: 'retry' };
  switch (status?.status) {
    case 'completed':
      return { action: 'completed', result: status.result };
    case 'pending':
      return { action: 'pending' };
    case 'failed':
    case 'not_found':
      return { action: 'retry' };
    default:
      return { action: 'confirm' };
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
      console.error('[AgentService] Health check failed:', error);
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
    try {
      logger.debug('[AgentService] Sending query:', request.query);
      
      // clientRequestId doubles as the idempotency key; retries reuse it (#262)
      const response = await this.api.post('/query', request);
      
      logger.debug('[AgentService] Query response:', response.data);
      
      // The experimental backend returns { result: ... } format
      // Ensure we return the proper AgentQueryResponse format
      if (response.data && response.data.result) {
        return {
          result: { ...response.data.result, requestId: request.clientRequestId }
        };
      }
      
      // Fallback if response format is unexpected
      return {
        result: {
          success: true,
          data: response.data || 'Query processed successfully',
          error: null
        }
      };
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
          error: errorMsg,
          errorKind: classifyAgentError(error),
          requestId: request.clientRequestId
        }
      };
    }
  }

  /**
   * Ask the backend what happened to a previously sent query (#262), via
   * `GET /query/:requestId/status` → `{ status: 'pending' | 'completed' | 'failed' | 'not_found', result? }`.
   * Never throws: a missing endpoint, an unreachable backend or an unrecognized body resolves
   * as `unknown`. An HTTP 404 means the endpoint is missing, so it also resolves as `unknown`;
   * the backend reports an unseen id with a 200 body `{ status: 'not_found' }`.
   */
  async getOperationStatus(requestId: string): Promise<AgentOperationStatus> {
    try {
      const response = await this.api.get(`/query/${encodeURIComponent(requestId)}/status`, { timeout: 10000 });
      const body = response.data as { status?: string; result?: AgentQueryResponse['result'] } | undefined;
      const status = body?.status;
      if (status === 'pending' || status === 'completed' || status === 'failed' || status === 'not_found') {
        return { requestId, status, result: body?.result };
      }
      return { requestId, status: 'unknown' };
    } catch (error) {
      console.error('[AgentService] Operation status check failed:', (error as Error)?.message);
      return { requestId, status: 'unknown' };
    }
  }

  /**
   * Status check plus decision for retrying a failed query (#262).
   * Read-only queries skip the network call.
   */
  async checkBeforeRetry(requestId: string | undefined, stateChanging: boolean): Promise<AgentRetryDecision> {
    if (!stateChanging) return { action: 'retry' };
    const status = requestId ? await this.getOperationStatus(requestId) : null;
    return decideRetry(stateChanging, status);
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
