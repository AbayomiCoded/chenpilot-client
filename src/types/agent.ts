// Agent-specific types for Chenpilot experimental integration

export interface AgentQueryRequest {
  userId: string;
  query: string;
  /**
   * Client-generated id for this query (#274). Lets the backend dedupe retries and
   * answer `GET /query/:clientRequestId/status` after a client-side timeout.
   */
  clientRequestId?: string;
}

/**
 * Why an agent query failed (#274). `timeout` means the client stopped waiting; the
 * action may still be running or may have completed on the backend.
 */
export type AgentErrorKind = 'timeout' | 'network' | 'invalid_query' | 'server' | 'unknown';

/** Result of checking a query's status after a timeout (#274). */
export interface AgentActionStatus {
  requestId: string;
  /** `unknown` when the backend cannot report status (endpoint missing or unreachable). */
  status: 'pending' | 'completed' | 'failed' | 'unknown';
  result?: AgentQueryResponse['result'];
  checkedAt: string;
}

export interface AgentQueryResponse {
  result: {
    success: boolean;
    data: string;
    error?: string;
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

export interface AgentStatus {
  isOnline: boolean;
  version: string;
  uptime: number;
  lastActivity: string;
  activeConnections: number;
  services: {
    soroswap: ServiceStatus;
    blend: ServiceStatus;
    aquarius: ServiceStatus;
    phoenix: ServiceStatus;
    database: ServiceStatus;
  };
}

export interface ServiceStatus {
  isActive: boolean;
  isHealthy: boolean;
  lastCheck: string;
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
  services: {
    [key: string]: {
      status: 'up' | 'down' | 'degraded';
      responseTime?: number;
      error?: string;
    };
  };
  system: {
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
