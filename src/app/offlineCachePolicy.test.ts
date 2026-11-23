import { describe, expect, it } from 'vitest';
import { isCacheablePublicResource } from '../../public/offline-cache-policy.js';

const APP_ORIGIN = 'https://chenpilot.example';

describe('offline cache allowlist', () => {
  it('allows only same-origin GET requests for build assets and named public files', () => {
    expect(isCacheablePublicResource(`${APP_ORIGIN}/_next/static/chunks/app.js`, 'GET', APP_ORIGIN)).toBe(true);
    expect(isCacheablePublicResource(`${APP_ORIGIN}/manifest.webmanifest`, 'GET', APP_ORIGIN)).toBe(true);
    expect(isCacheablePublicResource(`${APP_ORIGIN}/chenpilot.png`, 'GET', APP_ORIGIN)).toBe(true);

    expect(isCacheablePublicResource(`${APP_ORIGIN}/_next/image?url=%2Fchenpilot.png`, 'GET', APP_ORIGIN)).toBe(false);
    expect(isCacheablePublicResource(`${APP_ORIGIN}/dashboard`, 'GET', APP_ORIGIN)).toBe(false);
    expect(isCacheablePublicResource(`${APP_ORIGIN}/manifest.webmanifest`, 'POST', APP_ORIGIN)).toBe(false);
    expect(isCacheablePublicResource('https://cdn.example/chenpilot.png', 'GET', APP_ORIGIN)).toBe(false);
  });

  it.each([
    '/api/auth/login',
    '/api/v1/auth/login',
    '/auth/session',
    '/api/protected/profile',
    '/api/v1/balance',
    '/account/user-1/balance',
    '/auth/starknet/balance',
    '/contacts',
    '/contacts/user-1',
    '/api/transactions',
    '/account/user-1/transactions',
  ])('never caches sensitive endpoint %s', (path) => {
    expect(isCacheablePublicResource(`${APP_ORIGIN}${path}`, 'GET', APP_ORIGIN)).toBe(false);
  });
});
