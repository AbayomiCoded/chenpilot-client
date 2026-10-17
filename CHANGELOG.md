# Changelog

All notable changes to **Chenpilot Client (`gear5labs/chenpilot-client`)** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to Semantic Versioning.

---

## [1.0.0] - 2026-10-17

### Added
- Added focus trapping, ARIA dialog semantics (`role="dialog"`, `aria-modal`), and focus restoration to the Modal primitive (Issue 105 / #150).
- Added web app manifest, 192px/512px icons, maskable variants, iOS PWA meta tags, and offline caching strategy (Issue 113 / #158).
- Added `.env.example` template and updated `.gitignore` rules (Issue 118 / #163).
- Added `CONTRIBUTING.md` documenting `pnpm` workflows, branch naming conventions, conventional commits, and issue labelling (Issue 116 / #161).
- Added `ARCHITECTURE.md` describing the App Router route tree, Redux state slices, Axios interceptor flow, and Socket.io lifecycle (Issue 117 / #162).
- Added `SECURITY.md` covering private vulnerability reporting, secret handling, and browser storage security (Issue 126 / #171).
- Added `CHANGELOG.md` and versioning policy (Issue 128 / #173).

### Changed
- Standardized application version to `1.0.0` across `package.json`, environment config, and documentation (Issue 128 / #173).

### Fixed
- Polished mobile chat layout including virtual viewport keyboard adjustments for the composer, body scroll locking for the sidebar drawer, and safe-area padding for notched devices (Issue 112 / #157).