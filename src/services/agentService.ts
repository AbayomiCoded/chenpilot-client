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
  AgentCapabilitiesResult,
  AgentHealthCheck,
  AgentTool,
  AgentMemoryResult,
  AgentMemoryErrorKind,
  AgentErrorKind,
  AgentOperationStatus,
  AgentRetryDecision,
  AgentActionStatus
} from '@/types/agent';
import agentConfig from '@/config/agent';
import {
  SseParser,
  StreamTextAccumulator,
  StreamingUnsupportedError,
  toStreamEvent,
} from './agentStream';

export interface AgentStreamOptions {
  /** Called with the full text streamed so far (not just the new chunk). */
  onDelta?: (text: string) => void;
  /** Aborting cancels the request and stops further `onDelta` calls. */
  signal?: AbortSignal;
}

const isAbortError = (error: unknown): boolean =>
  (error as { name?: string } | null)?.name === 'AbortError' ||
  (error as { name?: string } | null)?.name === 'CanceledError';

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
 * Categorize an agent request failure (#274, #262) so a timeout is never reported as a
 * connectivity error. Axios sets `code: 'ECONNABORTED'` (or `ETIMEDOUT`) and a
 * "timeout of Nms exceeded" message on timeouts. 401/403 is `unauthenticated`; 429 and 5xx are
 * `server` (transient); any other 4xx is rejected input (`invalid_query`).
 */
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
    case 'unauthenticated':
      return 'Please sign in again to continue.';
    default:
      return 'Agent service is currently unavailable. Please try again later.';
  }
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

/** Normalize a failed memory request into a typed error (#267). */
export function normalizeMemoryError(error: unknown): { kind: AgentMemoryErrorKind; message: string; status?: number } {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403) {
    return { kind: 'unauthorized', message: 'You are not allowed to read this memory.', status };
  }
  if (status === 404) {
    return { kind: 'not_found', message: 'Agent memory is not available for this account.', status };
  }
  return { kind: 'unavailable', message: 'Agent memory is temporarily unavailable.', status };
}

/**
 * Built-in capability list, used only when the backend has no capabilities endpoint (#270).
 * It describes what the client knows how to ask for, not what this deployment enables.
 */
export const LOCAL_CAPABILITIES: AgentCapabilities = {
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

/** Capability data older than this is shown as stale (#270). */
export const CAPABILITIES_MAX_AGE_MS = 5 * 60 * 1000;

export function isCapabilitiesStale(result: Pick<AgentCapabilitiesResult, 'fetchedAt'>, now = Date.now()): boolean {
  return now - Date.parse(result.fetchedAt) > CAPABILITIES_MAX_AGE_MS;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Validate a `GET /capabilities` body; returns null when it does not match the contract. */
export function parseCapabilities(body: unknown): { capabilities: AgentCapabilities; updatedAt?: string } | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!isStringArray(b.supportedActions) || !isStringArray(b.supportedAssets) || !isStringArray(b.supportedProtocols)) {
    return null;
  }
  const features = (typeof b.features === 'object' && b.features !== null ? b.features : {}) as Record<string, unknown>;
  const limits = (typeof b.limits === 'object' && b.limits !== null ? b.limits : {}) as Record<string, unknown>;
  const flag = (k: string) => features[k] === true;
  const limit = (k: string) => (typeof limits[k] === 'number' ? (limits[k] as number) : 0);
  return {
    capabilities: {
      supportedActions: b.supportedActions,
      supportedAssets: b.supportedAssets,
      supportedProtocols: b.supportedProtocols,
      features: {
        defi: flag('defi'),
        crossChain: flag('crossChain'),
        voiceCommands: flag('voiceCommands'),
        smartContracts: flag('smartContracts'),
        yieldFarming: flag('yieldFarming'),
        lending: flag('lending'),
        borrowing: flag('borrowing'),
        swapping: flag('swapping'),
      },
      limits: {
        maxQueryLength: limit('maxQueryLength'),
        maxConcurrentQueries: limit('maxConcurrentQueries'),
        rateLimitPerMinute: limit('rateLimitPerMinute'),
      },
    },
    updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : undefined,
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
  // null = not yet known; false after the backend reports it has no streaming endpoint (#261)
  private streamingSupported: boolean | null = null;

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

    logger.error('[AgentService] Health check failed:', { status: health.httpStatus, code: health.errorCode, message: health.errorMessage });
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
   * Agent capabilities with their source and freshness (#270). Never throws.
   * Asks `GET /capabilities`; a missing endpoint (404/405/501) yields `unsupported` with the
   * local fallback list, and an outage or malformed answer yields `unavailable`.
   */
  async getCapabilities(): Promise<AgentCapabilitiesResult> {
    const fetchedAt = new Date().toISOString();
    try {
      const response = await this.api.get('/capabilities', { timeout: 5000 });
      const parsed = parseCapabilities(response.data);
      if (!parsed) {
        return { availability: 'unavailable', source: 'none', capabilities: null, fetchedAt, error: 'invalid_response' };
      }
      return { availability: 'available', source: 'backend', ...parsed, fetchedAt };
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 405 || status === 501) {
        return { availability: 'unsupported', source: 'local_fallback', capabilities: LOCAL_CAPABILITIES, fetchedAt };
      }
      return {
        availability: 'unavailable',
        source: 'none',
        capabilities: null,
        fetchedAt,
        error: status ? `http_${status}` : 'network',
      };
    }
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
  async queryAgent(request: AgentQueryRequest, options?: { signal?: AbortSignal }): Promise<AgentQueryResponse> {
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

      const response = await this.api.post(
        '/query',
        { ...request, clientRequestId: correlationId },
        { signal: options?.signal }
      );

      logger.debug(
        '[AgentService] Query response:',
        summarizeAgentResponse(correlationId, response.status, response.data, startedAt)
      );
      if (isContentLoggingEnabled()) {
        logger.debug('[AgentService] Response content:', { correlationId, data: response.data });
      }

      // Only documented envelopes are accepted; anything else is a protocol error rather than
      // a misleading success (#275)
      const parsed = parseAgentEnvelope(response.data);
      if (!parsed.ok) {
        logger.error('[AgentService] Malformed /query response:', { correlationId, reason: parsed.reason });
        return { result: { ...protocolErrorResult(parsed.reason), requestId: correlationId, stateChanging } };
      }
      return { result: { ...parsed.result, requestId: correlationId, stateChanging } };
    } catch (error: unknown) {
      const axiosError = error as {
        code?: string;
        name?: string;
        message?: string;
        response?: { data?: { message?: string } };
      };
      // A user-cancelled request (Stop button / navigation) propagates as an abort, not a failure
      if (
        axiosError.code === 'ERR_CANCELED' ||
        axiosError.name === 'CanceledError' ||
        axiosError.name === 'AbortError'
      ) {
        throw error;
      }

      logger.error('[AgentService] Query failed:', {
        correlationId,
        durationMs: Date.now() - startedAt,
        ...describeAgentError(error),
      });

      // Convert technical errors to user-friendly messages, keeping timeouts distinct (#274)
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
          stateChanging,
          // No HTTP response means the message never reached the service (#266)
          delivered: Boolean((error as { response?: unknown })?.response)
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
      logger.error('[AgentService] Operation status check failed:', { correlationId: requestId, ...describeAgentError(error) });
      return { requestId, status: 'unknown' };
    }
  }

  /**
   * Query the agent, streaming partial text through `onDelta` when the backend supports
   * `POST /query/stream` (#261). Falls back to `queryAgent` when streaming is disabled or
   * unsupported; the fallback happens only before any output, so a query never runs twice.
   * Rejects with an AbortError when `signal` is aborted.
   */
  async queryAgentStreaming(
    request: AgentQueryRequest,
    options: AgentStreamOptions = {}
  ): Promise<AgentQueryResponse> {
    if (!agentConfig.enableStreaming || this.streamingSupported === false || typeof fetch !== 'function') {
      return this.queryAgent(request, { signal: options.signal });
    }
    try {
      const response = await this.streamQuery(request, options);
      this.streamingSupported = true;
      return response;
    } catch (error) {
      if (error instanceof StreamingUnsupportedError) {
        this.streamingSupported = false;
        logger.debug('[AgentService] Streaming unsupported, falling back to /query');
        return this.queryAgent(request, { signal: options.signal });
      }
      if (isAbortError(error) || options.signal?.aborted) {
        throw error;
      }
      logger.error('[AgentService] Stream failed:', describeAgentError(error));
      return {
        result: {
          success: false,
          data: 'The response was interrupted. Please try again.',
          error: (error as Error)?.message || 'stream_failed',
        },
      };
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
   * Low-level SSE request for `POST /query/stream`. Resolves with the `final` event's result.
   *
   * @throws {StreamingUnsupportedError} When the endpoint is missing (404/405/501) or does not answer with SSE.
   */
  async streamQuery(request: AgentQueryRequest, options: AgentStreamOptions = {}): Promise<AgentQueryResponse> {
    const { onDelta, signal } = options;
    const response = await fetch(`${this.baseURL.replace(/\/$/, '')}/query/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(request),
      signal,
    });

    const contentType = response.headers.get('content-type') || '';
    if ([404, 405, 501].includes(response.status) || (response.ok && !contentType.includes('text/event-stream'))) {
      throw new StreamingUnsupportedError();
    }
    if (!response.ok || !response.body) {
      throw new Error(`Stream request failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    const text = new StreamTextAccumulator();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (signal?.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
        const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true });
        for (const message of parser.push(done ? `${chunk}\n\n` : chunk)) {
          const event = toStreamEvent(message);
          if (!event) continue;
          if (event.type === 'delta') {
            if (text.apply(event)) onDelta?.(text.value);
          } else if (event.type === 'final') {
            return { result: event.result };
          } else {
            return { result: { success: false, data: 'Agent service is currently unavailable. Please try again later.', error: event.message } };
          }
        }
        if (done) break;
      }
    } finally {
      reader.cancel().catch(() => undefined);
    }

    // The stream ended without a final event: the partial text is not authoritative
    return {
      result: {
        success: false,
        data: 'The response was interrupted. Please try again.',
        error: 'stream_incomplete',
      },
    };
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
   * Get conversation memory entries for a specific user ID (#267).
   * Never throws. Returns `{ ok: true, entries }` for a real answer, including an empty list,
   * and `{ ok: false, error }` when memory could not be read, so an outage is never mistaken
   * for "no saved memory".
   *
   * @param userId - Target user identifier string.
   * @returns Promise resolving to a typed memory result.
   */
  async getMemory(userId: string): Promise<AgentMemoryResult> {
    try {
      const response = await this.api.get<unknown>(`/memory/${encodeURIComponent(userId)}`);
      const body = response.data;
      if (Array.isArray(body) && body.every((entry) => typeof entry === 'string')) {
        return { ok: true, entries: body };
      }
      return {
        ok: false,
        error: { kind: 'invalid_response', message: 'Agent memory returned an unexpected format.', status: response.status },
      };
    } catch (error) {
      logger.error('[AgentService] Failed to get memory:', describeAgentError(error));
      return { ok: false, error: normalizeMemoryError(error) };
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
