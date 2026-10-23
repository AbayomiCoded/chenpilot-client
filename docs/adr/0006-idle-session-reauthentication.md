# [ADR-0006] Server-Driven Re-authentication for Sensitive Actions

* **Status:** Proposed (backend support not yet confirmed)
* **Date:** 2026-10-21
* **Authors:** Chenpilot client team (#255)

## Context

A session can stay authenticated while the user is away from the device. The client already has a 30-minute session timer with a warning (`sessionService`), but it is only advisory: it runs in the browser, can be skipped by calling the API directly, and resets per tab. A client-only timer cannot protect sensitive actions, because the attacker controls the client (see SECURITY.md: "Client-side validation is not authorization").

## Decision

**The server decides when authentication is too old.** For a sensitive action whose last authentication is older than the server's limit, the server refuses with a step-up challenge. The client re-authenticates only when it receives that challenge.

### Sensitive actions (agreed list)

| Action id | Endpoint | Why |
| :--- | :--- | :--- |
| `change_password` | `POST /auth/change-password` | Account takeover persistence |
| `delete_account` | `DELETE /account` | Irreversible |
| `export_data` | `GET /data-export` (and fallbacks) | Bulk personal data |

Ordinary reads, chat and settings toggles are **not** gated. State-changing agent actions (transfers and swaps via `POST /query`) are candidates for a later revision. This ADR does not gate them, because `/query` has no structured error envelope yet.

### Backend contract

1. **Challenge.** A sensitive endpoint whose recent-authentication window has passed responds with:
   ```json
   HTTP 403
   { "code": "REAUTH_REQUIRED", "message": "Please confirm your password", "maxAgeSeconds": 300 }
   ```
   `403` is preferred. A `401` carrying the same `code` is also accepted, and the client's 401 interceptor will not refresh the token or log the user out for it.
2. **Re-authenticate.** `POST /auth/reauthenticate` with `{ "password": "..." }` returns `200 { "authenticatedAt": "<ISO>", "expiresAt": "<ISO>" }` and updates the session's authentication time, via a cookie or server session. A wrong password returns `401`/`403`.
3. **Retry.** The client repeats the original request once. A second `REAUTH_REQUIRED` is treated as a failure, and the user is asked to sign in again.
4. The server owns `maxAgeSeconds`; 5 minutes is recommended. The client never caches or enforces it.

### Client behavior (`withRecentAuth` in `src/services/auth.service.ts`)

- Run the action. If no challenge comes back, there is no prompt.
- On a challenge, show `ReauthDialog` asking for the password.
  - **Cancellation:** `ReauthCancelledError`; nothing changes.
  - **Timeout:** the prompt must be answered within 2 minutes (`REAUTH_PROMPT_TIMEOUT_MS`), otherwise `ReauthTimeoutError` and the dialog closes.
  - **Wrong password:** the dialog shows "That password is incorrect" and allows up to 3 attempts, then `ReauthFailedError`.
  - **Success:** the original action is retried once.
- The password is sent only to `/auth/reauthenticate`, never stored, and cleared from component state as soon as it is submitted.

## Consequences

### Positive
- Sensitive actions are protected even if the client is modified, and there are no prompts while authentication is fresh.
- The window can be tuned on the server without a client release.

### Negative / Trade-offs
- The backend needs two additions: the challenge response and `/auth/reauthenticate`. Until then, the actions behave as before: no challenge, no prompt.
- Google-only accounts have no password. The backend must offer another step-up method (e.g. an OAuth re-consent); this is left to a follow-up ADR.

## Implementation Details & Code Links

- [`src/services/auth.service.ts`](../../src/services/auth.service.ts): `withRecentAuth`, `getReauthChallenge`, error types
- [`src/services/api.ts`](../../src/services/api.ts): `stepUpReauthenticate`, the 401-interceptor bypass for `REAUTH_REQUIRED`, and `deleteAccount` rethrowing the challenge before any local cleanup
- [`src/components/auth/ReauthDialog.tsx`](../../src/components/auth/ReauthDialog.tsx): password prompt and `useReauthPrompt`
- [`src/app/settings/page.tsx`](../../src/app/settings/page.tsx): the Security card wraps change password and delete account in `withRecentAuth`
- Tests: `src/services/__tests__/reauth.test.ts`

## Relationship to the settings page's verification grant

The settings page also has a client-side check: before changing the password, the user re-enters it (`authService.reauthenticate(email, password)` via `POST /auth/login`), which opens a 5-minute in-memory grant. That check is UX only. This ADR's server challenge is the actual control, and both apply. When the server answers `REAUTH_REQUIRED`, `ReauthDialog` asks for the password, calls `apiService.stepUpReauthenticate` (`POST /auth/reauthenticate`) and retries the request once.

`apiService.deleteAccount()` normally reports API failures in its result and then clears local data. A `REAUTH_REQUIRED` challenge is the exception: it is rethrown **before** any local data or the token is cleared, so the user isn't signed out locally while the account still exists.

