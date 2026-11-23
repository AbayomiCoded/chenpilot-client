import { describe, expect, it } from 'vitest';
import { buildSecurityHeaders } from './securityHeaders';

describe('buildSecurityHeaders', () => {
  it('sets a narrow policy for configured API and socket origins and reports violations', () => {
    const headers = buildSecurityHeaders(
      'production',
      'https://api.example.test/v1',
      'https://socket.example.test',
    );
    const values = Object.fromEntries(headers.map(({ key, value }) => [key, value]));

    expect(values['X-Content-Type-Options']).toBe('nosniff');
    expect(values['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(values['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(values['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(values['Content-Security-Policy']).toContain('https://api.example.test');
    expect(values['Content-Security-Policy']).toContain('https://socket.example.test');
    expect(values['Content-Security-Policy']).toContain('report-uri /api/csp-report');
    expect(values['Content-Security-Policy']).toContain("object-src 'none'");
    expect(values['Content-Security-Policy']).not.toContain('https://*');
  });

  it('omits HSTS outside production and rejects invalid configured origins', () => {
    const headers = buildSecurityHeaders('development', 'javascript:alert(1)', 'not a url');
    const values = Object.fromEntries(headers.map(({ key, value }) => [key, value]));

    expect(values['Strict-Transport-Security']).toBeUndefined();
    expect(values['Content-Security-Policy']).not.toContain('javascript:');
    expect(values['Content-Security-Policy']).toContain("'unsafe-eval'");
  });

  it('excludes insecure HTTP origins and credential URLs in production CSP', () => {
    const headers = buildSecurityHeaders(
      'production',
      'http://api.example.test',
      'https://user:pass@socket.example.test',
    );
    const csp = Object.fromEntries(headers.map(({ key, value }) => [key, value]))[
      'Content-Security-Policy'
    ];

    expect(csp).not.toContain('http://api.example.test');
    expect(csp).not.toContain('socket.example.test');
  });

  it('allows local HTTP origins outside production', () => {
    const headers = buildSecurityHeaders(
      'development',
      'http://localhost:2333',
      'http://127.0.0.1:3001',
    );
    const csp = Object.fromEntries(headers.map(({ key, value }) => [key, value]))[
      'Content-Security-Policy'
    ];

    expect(csp).toContain('http://localhost:2333');
    expect(csp).toContain('http://127.0.0.1:3001');
  });
});
