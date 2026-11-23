import { describe, it, expect, vi, beforeEach } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { getSignInActivity: vi.fn(), revokeSession: vi.fn(), reportSignInEvent: vi.fn() },
}));
vi.mock('../api', () => ({ default: api }));

import {
  describeDevice,
  describeLocation,
  loadSignInActivity,
  maskIpAddress,
  normalizeActivityPage,
} from '../sessionService';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('sign-in activity model (#257)', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  it('keeps valid events newest first and defaults capabilities to off', () => {
    const page = normalizeActivityPage({
      events: [
        { id: 'a', type: 'sign_in', outcome: 'success', occurredAt: '2026-10-01T10:00:00Z' },
        { id: 'b', type: 'sign_in', outcome: 'failure', occurredAt: '2026-10-02T10:00:00Z' },
        { id: 'c', type: 'hacked', outcome: 'success', occurredAt: '2026-10-03T10:00:00Z' },
        { id: 'd', type: 'sign_in', outcome: 'maybe', occurredAt: '2026-10-03T10:00:00Z' },
        { id: 'e', type: 'sign_in', outcome: 'success', occurredAt: 'not a date' },
        null,
      ],
    });

    expect(page.events.map((e) => e.id)).toEqual(['b', 'a']);
    expect(page.capabilities).toEqual({ revokeSession: false, reportEvent: false });
  });

  it('describes devices approximately without versions', () => {
    expect(describeDevice({ device: { browser: 'Firefox', os: 'Linux' } })).toBe('Firefox on Linux');
    expect(describeDevice({ userAgent: CHROME_MAC })).toBe('Chrome on macOS');
    expect(describeDevice({ userAgent: SAFARI_IPHONE })).toBe('Safari on iOS');
    expect(describeDevice({ userAgent: CHROME_MAC })).not.toMatch(/129|10_15/);
    expect(describeDevice({})).toBe('Unknown device');
  });

  it('describes location at region/country level only', () => {
    expect(describeLocation({ approxLocation: { region: 'Lagos', country: 'NG' } })).toBe('Lagos, NG');
    expect(describeLocation({})).toBeNull();
  });

  it('coarsens IP addresses', () => {
    expect(maskIpAddress('203.0.113.42')).toBe('203.0.113.x');
    expect(maskIpAddress('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3:…');
    expect(maskIpAddress(undefined)).toBeNull();
    expect(maskIpAddress('garbage')).toBeNull();
  });

  it('reports unsupported when the backend has no activity endpoint', async () => {
    api.getSignInActivity.mockRejectedValue({ response: { status: 404 } });
    await expect(loadSignInActivity()).resolves.toEqual({ status: 'unsupported' });
  });

  it('reports a friendly error for other failures', async () => {
    api.getSignInActivity.mockRejectedValue({ response: { status: 500 } });
    await expect(loadSignInActivity()).resolves.toMatchObject({ status: 'error' });
  });
});
