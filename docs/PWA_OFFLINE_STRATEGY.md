# PWA Offline Caching & Installation Strategy

## Overview
This document outlines the Progressive Web App (PWA) configuration and caching behavior for **Chenpilot Client (`gear5labs/chenpilot-client`)**.

---

## 1. Manifest and Install Metadata
- **Manifest File**: Located at `/public/manifest.webmanifest`. Serves correct application name, standalone display mode, theme colors (`#0284c7`), and required icons (192px, 512px, and maskable variant).
- **iOS Support**: Apple-specific meta tags (`apple-mobile-web-app-capable`, status bar styling, and apple-touch-icon) are injected via `src/app/layout.tsx`.

---

## 2. Offline Caching Strategy (Workbox)
- **Static App Shell**: HTML, CSS, JavaScript chunks, and static images are cached via CacheFirst / NetworkFirst strategies to ensure fast load times and basic offline shell availability.
- **Authenticated Route Safety**: 
  - To prevent stale session data or security leaks, all requests matching `/api/auth/*` and `/api/protected/*` are **explicitly excluded** from service worker caching.
  - Network requests for authenticated user data always bypass service worker caches and hit live server endpoints directly.