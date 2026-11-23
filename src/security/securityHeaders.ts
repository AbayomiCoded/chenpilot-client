type SecurityHeader = { key: string; value: string };

function originFrom(value: string | undefined, environment: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.username || url.password || url.hash) return undefined;
    if (environment === 'production' && url.protocol !== 'https:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function buildSecurityHeaders(
  environment: string,
  apiUrl?: string,
  socketUrl?: string,
): SecurityHeader[] {
  const connectSources = new Set([
    "'self'",
    'https://accounts.google.com',
    'https://oauth2.googleapis.com',
    'https://www.googleapis.com',
    'https://horizon.stellar.org',
    originFrom(apiUrl, environment),
    originFrom(socketUrl, environment),
  ]);
  connectSources.delete(undefined);

  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    'https://accounts.google.com',
    'https://apis.google.com',
  ];
  if (environment !== 'production') scriptSources.push("'unsafe-eval'");

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${Array.from(connectSources).join(' ')}`,
    "frame-src 'self' https://accounts.google.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "report-uri /api/csp-report",
    'report-to csp-endpoint',
  ].join('; ');

  const headers: SecurityHeader[] = [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
    { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
  ];

  if (environment === 'production') {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains; preload',
    });
  }

  return headers;
}
