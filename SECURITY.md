# Security Policy

## Supported Versions

Security updates and patches are provided exclusively for the latest stable release on the `main` branch of **Chenpilot Client (`gear5labs/chenpilot-client`)**.

| Version | Supported          |
| :---    | :---               |
| `main`  | :white_check_mark: |
| `< 1.0` | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability within Chenpilot Client, please **do not open a public GitHub issue**. Public disclosures can put users and wallet assets at risk before a patch is available.

- **Private Reporting Channel**: Please report vulnerabilities via [GitHub Security Advisories (Private Vulnerability Reporting)](https://github.com/gear5labs/chenpilot-client/security/advisories/new) or by emailing our security team at `security@gear5labs.example` (replace with official contact).
- **Expected Response Time**: We acknowledge receipt of vulnerability reports within **24 to 48 hours**, and provide an initial remediation assessment within **5 business days**.

---

## Secret-Handling & Development Rules

To maintain the security of credentials, API keys, and user assets, all contributors must adhere to the following rules:

1. **`.env` File Handling**:
   - Never commit `.env`, `.env.local`, or any file containing actual secrets to version control.
   - Always use `.env.example` as the canonical template containing safe placeholder values.
   - All `NEXT_PUBLIC_*` values are compiled into browser JavaScript and are therefore public. Only use this prefix for endpoints, OAuth client IDs, network selection, UI values and feature flags.
   - Keep credentials and tokens unprefixed and server/CI-only (for example `GITHUB_TOKEN`, `VERCEL_TOKEN`, or `LHCI_GITHUB_APP_TOKEN`). A CI test rejects known secret-bearing names that use `NEXT_PUBLIC_`.

   | Classification | Examples | Handling |
   | :--- | :--- | :--- |
   | Public | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_STELLAR_NETWORK`, `NEXT_PUBLIC_APP_NAME` | Safe for browser bundles; must not contain credentials |
   | Server-only | `GITHUB_TOKEN`, `VERCEL_TOKEN`, `LHCI_GITHUB_APP_TOKEN` | Never expose to browser code or public build output |
   | Runtime-only | `NODE_ENV`, `CI`, `E2E_SKIP_WEBSERVER`, `PLAYWRIGHT_TEST_BASE_URL` | Framework/test process configuration; not browser application secrets |

   Public origin variables must be absolute HTTP(S) URLs. Production deployments require HTTPS; local HTTP origins such as `http://localhost:2333` are accepted only outside production. Startup validation rejects credentials, fragments, malformed URLs and unsupported schemes.

2. **Issue-Publishing & Release Tokens**:
   - The automated release and publishing script reads `GITHUB_TOKEN` locally from your un-tracked `.env` or `.env.local`.
   - Never hardcode personal access tokens or API keys into source files or commit histories.
3. **Log Redaction**:
   - Ensure that logging utilities never output sensitive data such as authentication headers, bearer tokens, private keys, session cookies, or user PII.
4. **Testnet-Only Practices & Credential Safeguards**:
   - **Mainnet Prohibited**: Never commit, configure, or use mainnet secret keys (`S...`), seed phrases, or production wallet credentials in this repository.
   - **Testnet-Only Test Data**: All automated tests, fixtures, and mock seeds must target the Stellar Testnet exclusively.
   - **Deterministic Test Mocking**: Network requests in unit and E2E suites must use deterministic mocks (`vi.mock('axios')` or Playwright route interception). Do not rely on live network credentials during automated testing.

---

## Wallet Transaction Security & Precision Handling

Because Chenpilot Client signs and prepares transactions:
1. **Transaction Confirmation UX**:
   - The user must always be presented with an explicit confirmation step before any transaction or smart contract call is submitted.
   - The confirmation UI must clearly state the recipient address, asset code, exact numerical amount, estimated fee, and network type (Testnet).
2. **Precision & Overflow Safeguards**:
   - Stellar amounts must respect 7-decimal precision (1 stroop = `0.0000001` XLM).
   - Floating-point arithmetic must never be used for financial accounting or transaction construction. Amounts must be represented as strings or BigInt integers to prevent truncation and precision exploits.

---

## Client Browser Storage & Security Implications

Because Chenpilot Client operates as a web-based client workspace and wallet application:
- **Storage Profile**: Sensitive authentication tokens and session states are stored in browser storage mechanisms (`localStorage` / encrypted cookies).
- **Security Implications**: Stored tokens are susceptible to theft if the client environment is compromised via Cross-Site Scripting (XSS). Contributors must maintain rigorous Content Security Policies (CSP), sanitize all user inputs, and keep third-party dependencies updated.

---

## Related Documentation

- [Contributing Guidelines & Wallet Flow Checklist (`CONTRIBUTING.md`)](CONTRIBUTING.md)
- [Backend API Contract (`docs/API_CONTRACT.md`)](docs/API_CONTRACT.md)
- [Testing & Quality Guide (`docs/TESTING.md`)](docs/TESTING.md)

### Browser Storage Inventory (#256)

These are all the keys the client reads or writes. The source of truth is `STORAGE_INVENTORY` in `src/services/storageInventory.ts`. `storageInventory.test.ts` fails if code uses a key that isn't listed there, so add new keys to both the inventory and this table.

| Key | Area | Owner | Lifetime | Cleared on logout | Sensitivity | Contents |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| `auth_token` | localStorage | `services/api.ts`, `store/slices/authSlice.ts` | Until logout, refresh failure or token rejection | ✅ | Credential | Bearer JWT |
| `user_data` | localStorage | `store/slices/authSlice.ts` | Until logout or refresh failure | ✅ | Personal | Minimized profile: id, name, email, account flags. **No wallet address or public key** (see below) |
| `session_expiration` | localStorage | `services/sessionService.ts` | Until logout or session end | ✅ | Personal | Expiry timestamp for cross-tab session sync |
| `refresh_token` | localStorage | `services/api.ts` | Legacy: never written, only removed | ✅ | Credential | Refresh tokens are HTTP-only cookies |
| `chat_history` | localStorage | `store/slices/chatSlice.ts` | Until logout or chat deletion | ✅ | Personal | Messages per conversation; prompts can include wallet addresses and amounts |
| `conversations` | localStorage | `store/slices/chatSlice.ts` | Until logout or conversation deletion | ✅ | Personal | Conversation titles and metadata |
| `messageQueue` | localStorage | `store/slices/chatSlice.ts` | Until sent after reconnecting, or logout | ✅ | Personal | Prompts queued while offline |
| `chat_drafts` | localStorage | `lib/accountDeletion.ts` | Until logout or account deletion | ✅ | Personal | Unsent chat drafts |
| `mfa_secret` | localStorage + sessionStorage | `services/auth.service.ts` | Never written; removed defensively when MFA setup is cancelled | ✅ | Credential | Must never hold an MFA secret |
| `mfa_recovery_codes` | localStorage + sessionStorage | `services/auth.service.ts` | Never written; removed defensively when MFA setup is cancelled | ✅ | Credential | Must never hold MFA recovery codes |
| `theme` | localStorage | `store/slices/uiSlice.ts`, `ThemeProvider` | Persistent | ❌ | Preference | `light` / `dark` |
| `language` | localStorage | `store/slices/uiSlice.ts`, `lib/i18n` | Persistent | ❌ | Preference | UI language code |
| *(all keys)* | sessionStorage | none currently | Tab | ✅ (`sessionStorage.clear()`) | — | — |

`STORAGE_KEYS.SIDEBAR_STATE` and `STORAGE_KEYS.USER_PREFERENCES` in `src/constants` are declared but never used.

**Logout cleanup.** `clearUserScopedStorage()` removes every user-scoped key above and clears `sessionStorage`. Both `apiService.logout()` and the `logout` thunk call it, and `chatSlice` resets in-memory chat state on `logout.fulfilled`. Device preferences (`theme`, `language`) are kept. Before this audit, chat history, conversations and the offline queue survived logout, so the next person using a shared browser could read them.

**Reduced persistence.** `user_data` used to store the full `User`, including the wallet `address` and `publicKey`. It now stores only `toPersistedUser(user)`. Wallet identifiers are restored as empty strings and re-fetched from `GET /auth/me` / `fetchProfile` (the settings page fetches them on mount).

**Rules:**
1. Never persist secrets, private keys, seed phrases or passwords (see "Wallet Key Ownership & Signing Boundary").
2. Anything tied to a user must be marked `userScoped: true`, so logout removes it.
3. Store the minimum needed to restore the UI; re-fetch the rest from the API.
---

## Wallet Key Ownership & Signing Boundary

This section describes what the browser client actually does today. Re-check it against the code whenever a flow that touches keys, signing or funds changes. `src/security/signingBoundary.test.ts` fails if signing code or secret-key handling is added to the client without updating this policy.

### What lives where

| Asset / operation | Browser client (this repo) | Backend |
| :--- | :--- | :--- |
| Account secret key / private key / seed | **Never generated, received, stored or logged.** The client has no signing library (`@stellar/stellar-sdk` `Keypair`, `starknet` signers, wallet extensions) as a dependency. | Generates and custodies keys for user accounts created at registration. |
| Public key / account address | Received from `POST /auth/register`, `GET /auth/me` and `GET /auth/starknet/status`; displayed and sent back as an identifier. | Source of truth. |
| Transaction building & signing | None. | Builds, signs and submits every transaction. |
| Agent actions (transfer, swap, lend, borrow, ...) | Sends the natural-language prompt to `POST /query` and renders the result. `result.metadata.requiresConfirmation` is display-only; the client does not sign or co-sign. | Interprets the intent, enforces limits, signs and submits. |
| Account deployment | Calls `POST /auth/starknet/deploy`. | Deploys and signs. |
| Account funding | Calls `POST /auth/funding/*` and `POST /api/fund`. **Testnet only:** when the backend funding call fails, `requestAccountFunding` calls Stellar Friendbot directly with the **public key** (no secret involved). | Funds from its own accounts. |
| Session credential | Bearer JWT in `localStorage` (`auth_token`), plus refresh/logout cookies sent with `withCredentials`. | Issues, validates and revokes tokens. |

### Client-side validation is not authorization

Every check the client makes exists only for UX. None of them is a security control, and the backend must enforce each one itself:

- route guards and `isAuthenticated` checks
- form validation (password strength, email format)
- the agent's supported-actions list
- amount and asset checks
- hiding or disabling buttons
- the retry/status checks in chat

An attacker controls the browser and can call any API directly with a valid token, so the backend must authorize every request on its own: ownership of the account, limits, and that the intent was confirmed.

### Rules for contributors

1. Do not add code that creates, imports, derives, stores or transmits a secret key, private key or seed phrase in the browser. If client-side signing is ever needed (e.g. a wallet extension), it needs a design review and an update to this section first.
2. Treat the bearer token as the user's signing authority: anyone holding it can ask the backend to move funds. Never log it, put it in URLs, or send it to a host other than the configured API (see "Log Redaction" above and `src/utils/logger.ts`).
3. Agent output is untrusted input. Never turn it into a signing request, navigation or script on the client.
4. Any new endpoint that changes on-chain state must be documented in `docs/API_CONTRACT.md` with the backend's authorization rule.

---

## Password Handling in Auth Forms (#253)

- After a **terminal** auth error (an HTTP 4xx other than 408/429, or an unclassified failure), the login and registration forms clear the password field and focus it. Email and name are kept so the user only re-enters the password.
- After a **transient** error (network failure, timeout, 408, 429, 5xx), the password is kept so the user can resubmit.
- The password field is also cleared when the form unmounts (client-side navigation), on `pagehide`, and when the page is restored from the back/forward cache (`pageshow` with `persisted`). A submitted password is therefore never restored into the form.
- `autocomplete` is **not** disabled (`current-password` for login, `new-password` for registration), so password managers keep working.
- Implementation: `src/components/auth/passwordHygiene.ts`; tests in `src/components/auth/passwordHygiene.test.tsx`.
