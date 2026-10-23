// Agent-specific types for Chenpilot experimental integration

export interface AgentQueryRequest {
  userId: string;
  query: string;
  /**
   * Client-generated id for this query (#262, #274). Reused when the query is retried so the
   * backend can deduplicate it (idempotency key) and answer `GET /query/:clientRequestId/status`.
   */
  clientRequestId?: string;
}

/**
 * Why an agent query failed (#274, #262). `timeout` means the client stopped waiting; the
 * action may still be running. `invalid_query` and `unauthenticated` are never retried.
 */
export type AgentErrorKind = 'timeout' | 'network' | 'invalid_query' | 'server' | 'unauthenticated' | 'unknown';

/** Result of checking a query's status after a timeout (#274). */
export interface AgentActionStatus {
  requestId: string;
  /** `unknown` when the backend cannot report status (endpoint missing or unreachable). */
  status: 'pending' | 'completed' | 'failed' | 'unknown';
  result?: AgentQueryResponse['result'];
  checkedAt: string;
}

/** Backend-reported status of a previously sent query (#262). */
export interface AgentOperationStatus {
  requestId: string;
  /** `unknown` when the backend cannot report status (endpoint missing or unreachable). */
  status: 'pending' | 'completed' | 'failed' | 'not_found' | 'unknown';
  result?: AgentQueryResponse['result'];
}

/** What to do when the user asks to retry a failed query (#262). */
export type AgentRetryDecision =
  | { action: 'retry' }
  | { action: 'completed'; result?: AgentQueryResponse['result'] }
  | { action: 'pending' }
  | { action: 'confirm' };

export interface AgentQueryResponse {
  result: {
    success: boolean;
    data: string;
    error?: string;
    /**
     * Whether the request reached the service (#266). False for network failures where no
     * HTTP response came back; the user's message then counts as not sent.
     */
    delivered?: boolean;
    /** Server id for the user's message, used to reconcile the optimistic row (#266). */
    userMessageId?: string;
    /** Set on failures so the UI can tell a timeout apart from a connectivity error (#274). */
    errorKind?: AgentErrorKind;
    /** Echo of `clientRequestId`; use with `agentService.getActionStatus`. */
    requestId?: string;
    /** True when the query looked like a state-changing action (transfer, swap, ...). */
    stateChanging?: boolean;
    transactionHash?: string;
    metadata?: {
      type?: 'defi' | 'wallet' | 'contact' | 'general';
      action?: string;
      amount?: string;
      asset?: string;
      requiresConfirmation?: boolean;
    };
  };
}

/**
 * Agent status (#271). Every metric is `null` when no real source reported it; the client never
 * fills in placeholder values. `isOnline` comes from the health probe (`AgentHealthCheck`).
 */
export interface AgentStatus {
  isOnline: boolean;
  /** Where the metrics came from: `GET /status`, or nothing (`unavailable`). */
  source: 'backend' | 'unavailable';
  version: string | null;
  /** Seconds. */
  uptime: number | null;
  lastActivity: string | null;
  activeConnections: number | null;
  /** Per-protocol health as reported by the backend; empty when unknown. */
  services: Record<string, ServiceStatus>;
  /** The health probe that determined `isOnline`. */
  health: AgentHealthCheck | null;
}

export interface ServiceStatus {
  isActive: boolean | null;
  isHealthy: boolean | null;
  lastCheck: string | null;
  error?: string;
}

export interface AgentCapabilities {
  supportedActions: string[];
  supportedAssets: string[];
  supportedProtocols: string[];
  features: {
    defi: boolean;
    crossChain: boolean;
    voiceCommands: boolean;
    smartContracts: boolean;
    yieldFarming: boolean;
    lending: boolean;
    borrowing: boolean;
    swapping: boolean;
  };
  limits: {
    maxQueryLength: number;
    maxConcurrentQueries: number;
    rateLimitPerMinute: number;
  };
}

export interface AgentHealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  /**
   * Which probe produced this result (#272): `health_endpoint` = `GET /health`;
   * `connectivity` = `HEAD /` fallback, which only proves the server is reachable.
   */
  probe: 'health_endpoint' | 'connectivity';
  /** False when `GET /health` is missing (404/405/501). */
  healthEndpointSupported: boolean;
  /** Measured round trip of the answering probe in ms; null when nothing answered. */
  responseTimeMs: number | null;
  /** Why the agent is unhealthy: no answer (`network`/`timeout`) vs an error answer (`server_error`). */
  reason?: 'network' | 'timeout' | 'server_error';
  services: {
    [key: string]: {
      status: 'up' | 'down' | 'degraded';
      responseTime?: number;
      error?: string;
    };
  };
  /** Only present when the backend reports it; never synthesized. */
  system?: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
    uptime: number;
  };
}

export interface AgentTool {
  name: string;
  description: string;
  category: 'defi' | 'wallet' | 'contact' | 'utility';
  isActive: boolean;
  parameters?: {
    [key: string]: {
      type: string;
      required: boolean;
      description: string;
    };
  };
}

export interface AgentMemory {
  userId: string;
  messages: string[];
  context: {
    [key: string]: any;
  };
  lastUpdated: string;
}

export interface AgentWorkflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  isActive: boolean;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'action' | 'condition' | 'loop' | 'parallel';
  parameters: {
    [key: string]: any;
  };
  dependencies?: string[];
}

export interface AgentExecutionResult {
  success: boolean;
  workflowId?: string;
  steps: {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
    duration?: number;
  }[];
  totalDuration: number;
  finalResult?: any;
}

export interface AgentConfiguration {
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  retryAttempts: number;
  enableMemory: boolean;
  enableTools: boolean;
  enableWorkflows: boolean;
}

export interface AgentMetrics {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageResponseTime: number;
  mostUsedTools: {
    name: string;
    count: number;
  }[];
  queryTypes: {
    [key: string]: number;
  };
  last24Hours: {
    queries: number;
    errors: number;
    averageResponseTime: number;
  };
}

// Error types
export interface AgentError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
  userId?: string;
}

export interface AgentValidationError extends AgentError {
  field: string;
  value: any;
  constraint: string;
}

// Event types for real-time updates
export interface AgentEvent {
  type: 'query_started' | 'query_completed' | 'query_failed' | 'tool_executed' | 'workflow_started' | 'workflow_completed' | 'service_status_changed';
  timestamp: string;
  userId?: string;
  data: any;
}

export interface AgentNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: string;
  userId?: string;
  read: boolean;
}

/** Why agent memory could not be read (#267). Never confused with an empty memory. */
export type AgentMemoryErrorKind = 'unavailable' | 'unauthorized' | 'not_found' | 'invalid_response';

/**
 * Result of reading agent memory (#267): `ok: true` with a possibly empty list is a real answer;
 * `ok: false` means the memory could not be read.
 */
export type AgentMemoryResult =
  | { ok: true; entries: string[] }
  | { ok: false; error: { kind: AgentMemoryErrorKind; message: string; status?: number } };

/**
 * Capability lookup result (#270).
 * - `available`: the backend reported its capabilities (`source: 'backend'`).
 * - `unsupported`: the backend has no capabilities endpoint; `capabilities` is the client's
 *   built-in list (`source: 'local_fallback'`) and is not confirmed for this deployment.
 * - `unavailable`: the backend could not be asked (outage or invalid answer); nothing is known.
 */
export interface AgentCapabilitiesResult {
  availability: 'available' | 'unsupported' | 'unavailable';
  source: 'backend' | 'local_fallback' | 'none';
  capabilities: AgentCapabilities | null;
  /** When the client obtained this result (ISO 8601). */
  fetchedAt: string;
  /** When the backend last updated its capability data, if it says so. */
  updatedAt?: string;
  error?: string;
}
