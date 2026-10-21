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
    /**
     * Whether the request reached the service (#266). False for network failures where no
     * HTTP response came back; the user's message then counts as not sent.
     */
    delivered?: boolean;
    /** Server id for the user's message, used to reconcile the optimistic row (#266). */
    userMessageId?: string;
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

/** Why agent memory could not be read (#267). Never confused with an empty memory. */
export type AgentMemoryErrorKind = 'unavailable' | 'unauthorized' | 'not_found' | 'invalid_response';

/**
 * Result of reading agent memory (#267): `ok: true` with a possibly empty list is a real answer;
 * `ok: false` means the memory could not be read.
 */
export type AgentMemoryResult =
  | { ok: true; entries: string[] }
  | { ok: false; error: { kind: AgentMemoryErrorKind; message: string; status?: number } };
