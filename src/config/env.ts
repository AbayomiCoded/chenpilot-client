// Environment configuration for ChenPilot client

/**
 * Every NEXT_PUBLIC_* value is included in browser bundles and must be
 * considered public. Secrets, credentials, private keys and tokens belong
 * in server/CI variables without the NEXT_PUBLIC_ prefix.
 */
export const PUBLIC_ENV_KEYS = [
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_AGENT_API_URL',
  'NEXT_PUBLIC_AGENT_TIMEOUT',
  'NEXT_PUBLIC_AGENT_RETRY_ATTEMPTS',
  'NEXT_PUBLIC_AGENT_HEALTH_CHECK_INTERVAL',
  'NEXT_PUBLIC_ENABLE_VOICE_COMMANDS',
  'NEXT_PUBLIC_ENABLE_AGENT_TOOLS',
  'NEXT_PUBLIC_ENABLE_REAL_TIME_UPDATES',
  'NEXT_PUBLIC_ENABLE_AGENT_STREAMING',
  'NEXT_PUBLIC_LOG_LEVEL',
  'NEXT_PUBLIC_ENABLE_AGENT_LOGGING',
  'NEXT_PUBLIC_LOG_AGENT_CONTENT',
  'NEXT_PUBLIC_SOCKET_URL',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
  'NEXT_PUBLIC_APP_NAME',
  'NEXT_PUBLIC_APP_VERSION',
  'NEXT_PUBLIC_STELLAR_NETWORK',
  'NEXT_PUBLIC_USE_MOCK_AUTH',
] as const;

export const SERVER_ONLY_ENV_KEYS = [
  'GITHUB_TOKEN',
  'VERCEL_TOKEN',
  'VERCEL_ORG_ID',
  'VERCEL_PROJECT_ID',
  'LHCI_GITHUB_APP_TOKEN',
] as const;

export const RUNTIME_ENV_KEYS = [
  'NODE_ENV',
  'CI',
  'E2E_SKIP_WEBSERVER',
  'PLAYWRIGHT_TEST_BASE_URL',
] as const;

export const ENV_KEY_CLASSIFICATION = {
  public: PUBLIC_ENV_KEYS,
  serverOnly: SERVER_ONLY_ENV_KEYS,
  runtime: RUNTIME_ENV_KEYS,
} as const;

const SECRET_ENV_NAME_PATTERN =
  /(SECRET|PRIVATE.?KEY|PASSWORD|PASSWD|TOKEN|CREDENTIAL|API.?KEY|AUTHORIZATION|COOKIE|MNEMONIC|SEED|DATABASE.?URL|REDIS.?URL|CONNECTION.?STRING)/;

/**
 * Reject known credential-bearing names when they use the browser-public prefix.
 *
 * This is a guard, not a substitute for never placing a real secret in a
 * Next.js environment variable whose name begins with NEXT_PUBLIC_.
 */
export const validatePublicEnvConfiguration = (
  environment: Record<string, string | undefined> = process.env,
) => {
  const offenders = Object.keys(environment)
    .filter(key => key.startsWith('NEXT_PUBLIC_') && SECRET_ENV_NAME_PATTERN.test(key))
    .sort();

  if (offenders.length > 0) {
    throw new Error(
      `[Env Config Error] Known secret environment variable name(s) must not use NEXT_PUBLIC_: ${offenders.join(', ')}. ` +
      'Move credentials to an unprefixed server-only variable and never ship them to the browser.',
    );
  }
};

/**
 * Parse and validate a browser-visible origin URL.
 *
 * Production permits only HTTPS origins. HTTP is allowed only for explicitly
 * local development/test hosts.
 */
export const validateConfiguredUrl = (
  key: string,
  value: string | undefined,
  nodeEnv = process.env.NODE_ENV,
  options: { required?: boolean } = {},
) => {
  if (!value) {
    if (options.required) {
      throw new Error(
        `[Env Config Error] ${key} is not set.\n` +
        `Set ${key} to the backend origin in your deployment environment.\n` +
        `For help, see docs/TROUBLESHOOTING.md.`,
      );
    }
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `[Env Config Error] ${key} is not a valid absolute URL: "${value}".\n` +
      `Expected a value such as https://api.example.com or http://localhost:2333.\n` +
      `For help, see docs/TROUBLESHOOTING.md.`,
    );
  }

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw new Error(
      `[Env Config Error] ${key} must use HTTP or HTTPS: "${value}".\n` +
      `For help, see docs/TROUBLESHOOTING.md.`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      `[Env Config Error] ${key} must not contain credentials: "${value}".\n` +
      `Use a public origin without usernames or passwords. For help, see docs/TROUBLESHOOTING.md.`,
    );
  }

  if (parsed.hash) {
    throw new Error(
      `[Env Config Error] ${key} must not contain a URL fragment: "${value}".\n` +
      `For help, see docs/TROUBLESHOOTING.md.`,
    );
  }

  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new Error(
      `[Env Config Error] ${key} must use HTTPS in production: "${value}".\n` +
      `Use https://api.example.com. HTTP is allowed only for local development.\n` +
      `For help, see docs/TROUBLESHOOTING.md.`,
    );
  }

  return parsed;
};

const _isDev  = process.env.NODE_ENV === 'development';
const _isTest = process.env.NODE_ENV === 'test';

/**
 * Resolve the API base URL with environment-aware fallback semantics.
 *
 * - Development / test: silently fall back to http://localhost:2333 so the
 *   dev server starts without a .env.local file.
 * - Production: return the raw env var value (possibly undefined/empty) so
 *   callers — and validateApiBaseUrl() — can detect misconfiguration
 *   rather than silently sending production traffic to localhost.
 */
function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured;
  if (_isDev || _isTest) return 'http://localhost:2333';
  // Production with no URL set: return empty string so validateApiBaseUrl
  // throws a clear error instead of silently hitting localhost.
  return '';
}

export const env = {
  // API Configuration
  API_BASE_URL: resolveApiBaseUrl(),

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',

  // Application Configuration
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'ChenPilot',
  APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK || '',

  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_TEST: process.env.NODE_ENV === 'test',
} as const;

/**
 * Validate that required environment variables are present.
 *
 * In development and test the check is skipped — the localhost fallback in
 * resolveApiBaseUrl() is intentional and keeps the dev server startable
 * without a .env.local file. In production every variable in the required
 * list must be explicitly set.
 *
 * @param nodeEnv - Override NODE_ENV for testing. Defaults to process.env.NODE_ENV.
 */
export const validateEnv = (nodeEnv = process.env.NODE_ENV) => {
  if (nodeEnv !== 'production') return;

  const required = [
    'NEXT_PUBLIC_API_BASE_URL',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    const missingKeys = missing.join(', ');
    throw new Error(
      `[Env Config Error] Missing required environment variable(s): ${missingKeys}.\n` +
      `Please create or update your '.env.local' file in the project root with valid settings (e.g. NEXT_PUBLIC_API_BASE_URL=http://localhost:2333).\n` +
      `For help troubleshooting environment configuration, see docs/TROUBLESHOOTING.md.`
    );
  }
};

/**
 * Validate that API_BASE_URL is a well-formed HTTP or HTTPS URL.
 *
 * Called automatically at server startup (see bottom of this file).
 * May also be called from the API client to surface misconfiguration early.
 *
 * In development and test the check is skipped when the value equals the
 * localhost fallback, so a missing .env.local never blocks the dev server.
 * In production any missing or non-HTTP(S) value is a fatal startup error.
 *
 * An explicitly configured URL that uses a non-HTTP(S) protocol is rejected
 * in every environment, including development and test.
 *
 * @param url     - URL to validate. Defaults to env.API_BASE_URL.
 * @param nodeEnv - Override NODE_ENV for testing. Defaults to process.env.NODE_ENV.
 *
 * @throws {Error} When the URL is absent in production, or not a valid
 *   HTTP/HTTPS URL in any environment where an explicit value was configured.
 */
export const validateApiBaseUrl = (
  url    = env.API_BASE_URL,
  nodeEnv = process.env.NODE_ENV,
) => {
  const isProd = nodeEnv === 'production';
  const isDevOrTest = !isProd;

  // Dev/test with the automatic localhost fallback — skip validation entirely.
  if (isDevOrTest && url === 'http://localhost:2333' && !process.env.NEXT_PUBLIC_API_BASE_URL) {
    return;
  }

  if (!url) {
    throw new Error(
      `[Env Config Error] NEXT_PUBLIC_API_BASE_URL is not set.\n` +
      `In production every deployment must set this variable to the backend API origin.\n` +
      `For help troubleshooting environment configuration, see docs/TROUBLESHOOTING.md.`
    );
  }

  validateConfiguredUrl('NEXT_PUBLIC_API_BASE_URL', url, nodeEnv, { required: true });
};

export const validatePublicUrlEnvironment = (
  nodeEnv = process.env.NODE_ENV,
  environment: Record<string, string | undefined> = process.env,
) => {
  validateConfiguredUrl(
    'NEXT_PUBLIC_API_BASE_URL',
    environment.NEXT_PUBLIC_API_BASE_URL,
    nodeEnv,
    { required: nodeEnv === 'production' },
  );
  validateConfiguredUrl('NEXT_PUBLIC_AGENT_API_URL', environment.NEXT_PUBLIC_AGENT_API_URL, nodeEnv);
  validateConfiguredUrl('NEXT_PUBLIC_SOCKET_URL', environment.NEXT_PUBLIC_SOCKET_URL, nodeEnv);
};

// Initialize environment validation at server startup.
// Both checks run only on the server (typeof window === 'undefined') so they
// never fire in the browser bundle.
if (typeof window === 'undefined') {
  validatePublicEnvConfiguration();
  validateEnv();
  validateApiBaseUrl();
  validatePublicUrlEnvironment();
}

/**
 * Returns the Horizon proxy base URL.
 *
 * `window.location.origin` is only available in the browser, so it cannot be
 * read at module-initialisation time (the `env` object is frozen once the
 * module is imported). This function defers the read to the call site so it
 * always reflects the real origin in the browser and safely falls back to the
 * relative path `/horizon` during server-side rendering or in restricted
 * environments (e.g. WebViews that expose no `window`).
 *
 * @returns Absolute Horizon proxy URL in the browser; relative path on the server.
 */
export function getHorizonProxyUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/horizon`;
  }
  return '/horizon';
}
