// Agent-specific types for Chenpilot experimental integration

export interface AgentQueryRequest {
  userId: string;
  query: string;
}

export interface AgentQueryResponse {
  result: {
    success: boolean;
    data: string;
    error?: string;
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
