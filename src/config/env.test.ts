/**
 * Tests for API base URL validation and fallback semantics (#335)
 *
 * Verifies that:
 *   - development and test environments silently fall back to localhost:2333
 *     when NEXT_PUBLIC_API_BASE_URL is not set.
 *   - production throws a clear, actionable error when the URL is absent or
 *     not a valid HTTP/HTTPS URL.
 *   - an explicitly configured URL is used as-is in every environment.
 *   - env.API_BASE_URL is the single source of truth (no independent fallback
 *     duplicate in api.ts).
 *
 * NODE_ENV is frozen to 'test' by Vitest and cannot be changed at runtime.
 * validateEnv() and validateApiBaseUrl() therefore accept an optional nodeEnv
 * parameter that the tests use to exercise each environment path without
 * mutating the process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers — manage NEXT_PUBLIC_API_BASE_URL across tests
// ---------------------------------------------------------------------------

const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

function setApiUrl(url: string | undefined) {
  if (url !== undefined) {
    process.env.NEXT_PUBLIC_API_BASE_URL = url;
  } else {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  }
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  setApiUrl(ORIGINAL_API_URL);
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// validateEnv — environment-aware required-var check
// ---------------------------------------------------------------------------

describe('validateEnv — environment-aware required-var check', () => {
  it('does not throw in development when NEXT_PUBLIC_API_BASE_URL is absent', async () => {
    setApiUrl(undefined);
    const { validateEnv } = await import('./env');
    expect(() => validateEnv('development')).not.toThrow();
  });

  it('does not throw in test when NEXT_PUBLIC_API_BASE_URL is absent', async () => {
    setApiUrl(undefined);
    const { validateEnv } = await import('./env');
    expect(() => validateEnv('test')).not.toThrow();
  });

  it('throws in production when NEXT_PUBLIC_API_BASE_URL is absent', async () => {
    setApiUrl(undefined);
    const { validateEnv } = await import('./env');
    expect(() => validateEnv('production')).toThrow(/NEXT_PUBLIC_API_BASE_URL/);
  });

  it('error message references .env.local', async () => {
    setApiUrl(undefined);
    const { validateEnv } = await import('./env');
    expect(() => validateEnv('production')).toThrow(/\.env\.local/);
  });

  it('does not throw in production when NEXT_PUBLIC_API_BASE_URL is set', async () => {
    setApiUrl('https://api.example.com');
    const { validateEnv } = await import('./env');
    expect(() => validateEnv('production')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateApiBaseUrl — URL format and presence validation
// ---------------------------------------------------------------------------

describe('validateApiBaseUrl — development/test: localhost fallback is silent', () => {
  it('does not throw in development when env var is absent (localhost fallback)', async () => {
    setApiUrl(undefined);
    const { validateApiBaseUrl } = await import('./env');
    // Pass the fallback URL and development nodeEnv directly
    expect(() => validateApiBaseUrl('http://localhost:2333', 'development')).not.toThrow();
  });

  it('does not throw in test when env var is absent (localhost fallback)', async () => {
    setApiUrl(undefined);
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('http://localhost:2333', 'test')).not.toThrow();
  });

  it('does not throw in development when a valid http URL is explicitly configured', async () => {
    setApiUrl('http://localhost:4000');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('http://localhost:4000', 'development')).not.toThrow();
  });
});

describe('validateApiBaseUrl — production: missing URL is fatal', () => {
  it('throws when URL is empty string', async () => {
    setApiUrl(undefined);
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('', 'production')).toThrow(/NEXT_PUBLIC_API_BASE_URL is not set/);
  });

  it('error message references docs/TROUBLESHOOTING.md', async () => {
    setApiUrl(undefined);
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('', 'production')).toThrow(/docs\/TROUBLESHOOTING\.md/);
  });

  it('does not throw when a valid https URL is configured', async () => {
    setApiUrl('https://api.example.com');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('https://api.example.com', 'production')).not.toThrow();
  });

  it('throws for an insecure http URL in production', async () => {
    setApiUrl('http://internal-api.corp.example');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('http://internal-api.corp.example', 'production'))
      .toThrow(/must use HTTPS in production/);
  });
});

describe('validateConfiguredUrl — parsed URL safety', () => {
  it('rejects malformed URLs with an actionable error', async () => {
    const { validateConfiguredUrl } = await import('./env');
    expect(() => validateConfiguredUrl('NEXT_PUBLIC_SOCKET_URL', 'not-a-url', 'development'))
      .toThrow(/NEXT_PUBLIC_SOCKET_URL.*not a valid absolute URL/);
  });

  it('rejects unsupported schemes', async () => {
    const { validateConfiguredUrl } = await import('./env');
    expect(() => validateConfiguredUrl('NEXT_PUBLIC_SOCKET_URL', 'ftp://socket.example.com', 'development'))
      .toThrow(/must use HTTP or HTTPS/);
  });

  it('rejects URLs containing credentials', async () => {
    const { validateConfiguredUrl } = await import('./env');
    expect(() => validateConfiguredUrl('NEXT_PUBLIC_API_BASE_URL', 'https://user:pass@api.example.com', 'production'))
      .toThrow(/must not contain credentials/);
  });

  it('rejects fragments', async () => {
    const { validateConfiguredUrl } = await import('./env');
    expect(() => validateConfiguredUrl('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.com/#fragment', 'production'))
      .toThrow(/must not contain a URL fragment/);
  });

  it('allows localhost HTTP in development and test', async () => {
    const { validateConfiguredUrl } = await import('./env');
    expect(() => validateConfiguredUrl('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:2333', 'development')).not.toThrow();
    expect(() => validateConfiguredUrl('NEXT_PUBLIC_SOCKET_URL', 'http://127.0.0.1:3001', 'test')).not.toThrow();
  });

  it('rejects localhost HTTP in production', async () => {
    const { validateConfiguredUrl } = await import('./env');
    expect(() => validateConfiguredUrl('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:2333', 'production'))
      .toThrow(/must use HTTPS in production/);
  });
});

describe('validateApiBaseUrl — invalid URL format rejected in any environment', () => {
  it('throws for a non-http/https protocol (ftp) in development', async () => {
    setApiUrl('ftp://bad-protocol.example.com');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('ftp://bad-protocol.example.com', 'development'))
      .toThrow(/must use HTTP or HTTPS/);
  });

  it('throws for a non-http/https protocol (ftp) in production', async () => {
    setApiUrl('ftp://bad-protocol.example.com');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('ftp://bad-protocol.example.com', 'production'))
      .toThrow(/must use HTTP or HTTPS/);
  });

  it('throws for a totally malformed URL in test', async () => {
    setApiUrl('not-a-url-at-all');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('not-a-url-at-all', 'test'))
      .toThrow(/not a valid absolute URL/);
  });

  it('throws for a ws:// URL in development', async () => {
    setApiUrl('ws://bad');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('ws://bad', 'development'))
      .toThrow(/must use HTTP or HTTPS/);
  });

  it('error message includes the offending URL value', async () => {
    setApiUrl('ftp://bad.example.com');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('ftp://bad.example.com', 'development'))
      .toThrow(/ftp:\/\/bad\.example\.com/);
  });

  it('error message references docs/TROUBLESHOOTING.md', async () => {
    setApiUrl('ws://bad');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('ws://bad', 'development'))
      .toThrow(/docs\/TROUBLESHOOTING\.md/);
  });
});

// ---------------------------------------------------------------------------
// env.API_BASE_URL — resolveApiBaseUrl fallback semantics
// (NODE_ENV is frozen to 'test' in Vitest; only the test-mode fallback path
//  can be verified via module re-import. The production path is covered by
//  validateApiBaseUrl tests above which pass '' for the production scenario.)
// ---------------------------------------------------------------------------

describe('env.API_BASE_URL — fallback in test environment', () => {
  it('uses the configured URL when NEXT_PUBLIC_API_BASE_URL is set', async () => {
    setApiUrl('http://my-backend:4000');
    const { env } = await import('./env');
    expect(env.API_BASE_URL).toBe('http://my-backend:4000');
  });

  it('falls back to localhost:2333 in test when env var is absent', async () => {
    setApiUrl(undefined);
    const { env } = await import('./env');
    expect(env.API_BASE_URL).toBe('http://localhost:2333');
  });
});

// ---------------------------------------------------------------------------
// env object — shape invariants (frozen to test environment in Vitest)
// ---------------------------------------------------------------------------

describe('env object — shape invariants', () => {
  it('IS_TEST is true since Vitest always runs with NODE_ENV=test', async () => {
    setApiUrl(undefined);
    const { env } = await import('./env');
    expect(env.IS_TEST).toBe(true);
    expect(env.IS_PRODUCTION).toBe(false);
    expect(env.IS_DEVELOPMENT).toBe(false);
  });

  it('NODE_ENV reflects the actual process.env.NODE_ENV value', async () => {
    setApiUrl(undefined);
    const { env } = await import('./env');
    expect(env.NODE_ENV).toBe(process.env.NODE_ENV);
  });
});

// ---------------------------------------------------------------------------
// Public/server-only classification and secret-name CI guard
// ---------------------------------------------------------------------------

describe('environment variable classification', () => {
  it('exposes the complete public key registry without credential-bearing names', async () => {
    const {
      PUBLIC_ENV_KEYS,
      RUNTIME_ENV_KEYS,
      ENV_KEY_CLASSIFICATION,
      validatePublicEnvConfiguration,
    } = await import('./env');
    expect(PUBLIC_ENV_KEYS).toContain('NEXT_PUBLIC_API_BASE_URL');
    expect(PUBLIC_ENV_KEYS).toContain('NEXT_PUBLIC_GOOGLE_CLIENT_ID');
    expect(RUNTIME_ENV_KEYS).toContain('NODE_ENV');
    expect(ENV_KEY_CLASSIFICATION.public).toBe(PUBLIC_ENV_KEYS);
    expect(() => validatePublicEnvConfiguration(Object.fromEntries(
      PUBLIC_ENV_KEYS.map(key => [key, 'example']),
    ))).not.toThrow();
  });

  it('lists deployment and release credentials as server-only', async () => {
    const { SERVER_ONLY_ENV_KEYS } = await import('./env');
    expect(SERVER_ONLY_ENV_KEYS).toContain('GITHUB_TOKEN');
    expect(SERVER_ONLY_ENV_KEYS).toContain('VERCEL_TOKEN');
    expect(SERVER_ONLY_ENV_KEYS).toContain('LHCI_GITHUB_APP_TOKEN');
  });

  it('has every repository public NEXT_PUBLIC key in the public registry', async () => {
    const { PUBLIC_ENV_KEYS } = await import('./env');
    const root = join(__dirname, '..', '..');
    const scanPaths = [
      join(root, 'src'),
      join(root, 'next.config.ts'),
    ];
    const discovered = new Set<string>();

    const scan = (path: string) => {
      const stat = statSync(path);
      if (stat.isDirectory()) {
        for (const name of readdirSync(path)) {
          if (name === 'node_modules' || name === '.git' || name.endsWith('.test.ts') || name.endsWith('.test.tsx')) continue;
          scan(join(path, name));
        }
        return;
      }
      if (!/\.(ts|tsx|js|jsx|mjs)$/.test(path)) return;
      const text = readFileSync(path, 'utf8');
      for (const name of text.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? []) discovered.add(name);
    };

    for (const path of scanPaths) scan(path);
    expect([...discovered].sort()).toEqual([...PUBLIC_ENV_KEYS].sort());
  });

  it('rejects known secret names that use NEXT_PUBLIC_', async () => {
    const { validatePublicEnvConfiguration } = await import('./env');
    expect(() => validatePublicEnvConfiguration({
      NEXT_PUBLIC_API_TOKEN: 'must-not-be-public',
      NEXT_PUBLIC_CLIENT_SECRET: 'must-not-be-public',
      NEXT_PUBLIC_DATABASE_URL: 'must-not-be-public',
      NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com',
    })).toThrow(/NEXT_PUBLIC_API_TOKEN.*NEXT_PUBLIC_CLIENT_SECRET.*NEXT_PUBLIC_DATABASE_URL/);
  });

  it('accepts ordinary public NEXT_PUBLIC names', async () => {
    const { validatePublicEnvConfiguration } = await import('./env');
    expect(() => validatePublicEnvConfiguration({
      NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com',
      NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
      NEXT_PUBLIC_APP_NAME: 'ChenPilot',
    })).not.toThrow();
  });
});

describe('repository public-environment audit', () => {
  const root = join(__dirname, '..', '..');
  const secretNamePattern =
    /(SECRET|PRIVATE.?KEY|PASSWORD|PASSWD|TOKEN|CREDENTIAL|API.?KEY|AUTHORIZATION|COOKIE|MNEMONIC|SEED|DATABASE.?URL|REDIS.?URL|CONNECTION.?STRING)/;

  function repositoryTextFiles(directory: string): string[] {
    return readdirSync(directory).flatMap(name => {
      const path = join(directory, name);
      if (name === 'node_modules' || name === '.git' || name === 'coverage' || name === '.next') return [];
      const stat = statSync(path);
      if (stat.isDirectory()) return repositoryTextFiles(path);
      if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) return [];
      if (/\.(ts|tsx|js|jsx|mjs|json|yml|yaml|md)$/.test(name) || name.startsWith('.env')) {
        return [path];
      }
      return [];
    });
  }

  it('finds no known secret-bearing NEXT_PUBLIC names in repository text', () => {
    const offenders: string[] = [];

    for (const path of repositoryTextFiles(root)) {
      const text = readFileSync(path, 'utf8');
      const names = text.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? [];
      for (const name of names) {
        if (secretNamePattern.test(name)) {
          offenders.push(`${relative(root, path)}: ${name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('provides an env template with safe placeholders and no credential values', () => {
    const template = readFileSync(join(root, '.env.example'), 'utf8');
    expect(template).toContain('NEXT_PUBLIC_API_BASE_URL=http://localhost:2333');
    expect(template).toContain('NEXT_PUBLIC_STELLAR_NETWORK=testnet');
    expect(template).not.toMatch(/(?:TOKEN|SECRET|PRIVATE_KEY|PASSWORD)=[^<\s][^\n]*/i);
  });
});
