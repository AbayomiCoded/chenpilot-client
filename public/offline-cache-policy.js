const STATIC_ASSET_PATHS = new Set([
  '/atomiq.jpg',
  '/chenpilot.png',
  '/favicon.ico',
  '/file.svg',
  '/globe.svg',
  '/manifest.webmanifest',
  '/next.svg',
  '/starknet.jpg',
  '/troves.jpg',
  '/vercel.svg',
  '/vesu.jpg',
  '/window.svg',
  '/xverse.jpg',
]);

const SENSITIVE_PATH = /\/(?:auth|protected|account|wallet|balance|contacts?|transactions?)(?:\/|$)/i;

export function isCacheablePublicResource(requestUrl, method, appOrigin) {
  if (method.toUpperCase() !== 'GET') return false;

  let url;
  try {
    url = new URL(requestUrl, appOrigin);
  } catch {
    return false;
  }

  if (url.origin !== appOrigin || SENSITIVE_PATH.test(url.pathname)) {
    return false;
  }

  return (
    url.pathname.startsWith('/_next/static/') ||
    STATIC_ASSET_PATHS.has(url.pathname)
  );
}
