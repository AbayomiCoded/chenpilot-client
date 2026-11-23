// Agent configuration for Chenpilot experimental integration

export const agentConfig = {
  // API endpoints
  baseURL: process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:2333',
  timeout: parseInt(process.env.NEXT_PUBLIC_AGENT_TIMEOUT || '30000'),
  retryAttempts: parseInt(process.env.NEXT_PUBLIC_AGENT_RETRY_ATTEMPTS || '3'),
  
  // Health check settings
  healthCheckInterval: parseInt(process.env.NEXT_PUBLIC_AGENT_HEALTH_CHECK_INTERVAL || '30000'),
  
  // Feature flags
  enableVoiceCommands: process.env.NEXT_PUBLIC_ENABLE_VOICE_COMMANDS === 'true',
  enableAgentTools: process.env.NEXT_PUBLIC_ENABLE_AGENT_TOOLS === 'true',
  enableRealTimeUpdates: process.env.NEXT_PUBLIC_ENABLE_REAL_TIME_UPDATES === 'true',
  // Stream agent responses over POST /query/stream (SSE) when the backend supports it (#261)
  enableStreaming: process.env.NEXT_PUBLIC_ENABLE_AGENT_STREAMING === 'true',
  
  // Logging
  logLevel: process.env.NEXT_PUBLIC_LOG_LEVEL || 'info',
  enableLogging: process.env.NEXT_PUBLIC_ENABLE_AGENT_LOGGING === 'true',
  
  // Agent capabilities
  supportedActions: [
    'transfer_xlm', 'swap', 'lend', 'borrow', 'withdraw', 'repay', 'deploy',
    'check_balance', 'get_apy', 'health_check', 'liquidate',
    'claim_rewards', 'add_collateral', 'remove_collateral',
    'deposit_vault', 'withdraw_vault', 'get_vaults',
    'get_vault_positions', 'harvest_vault', 'get_strategies',
    'swap_stellar_dex', 'add_liquidity', 'remove_liquidity'
  ],

  supportedAssets: ['XLM', 'USDC', 'USDT', 'BTC', 'ETH', 'AQUA'],

  supportedProtocols: ['Soroswap', 'Blend', 'Aquarius', 'Phoenix'],
  
  // Default agent settings
  defaultModel: 'claude-3-5-haiku-20241022',
  defaultTemperature: 0.7,
  defaultMaxTokens: 4096,
  
  // Error messages
  errorMessages: {
    agentUnavailable: 'Agent service is currently unavailable. Please try again later.',
    connectionFailed: 'Failed to connect to agent service.',
    queryTimeout: 'Query timed out. Please try again.',
    invalidQuery: 'Invalid query format. Please rephrase your request.',
    serviceError: 'An error occurred while processing your request.',
  },
  
  // Success messages
  successMessages: {
    agentConnected: 'Agent service connected successfully.',
    queryProcessed: 'Query processed successfully.',
    operationCompleted: 'Operation completed successfully.',
  },
};

export default agentConfig;
