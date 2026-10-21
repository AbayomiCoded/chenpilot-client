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
2. **Issue-Publishing & Release Tokens**:
   - The automated release and publishing script reads `GITHUB_TOKEN` locally from your un-tracked `.env` or `.env.local`.
   - Never hardcode personal access tokens or API keys into source files or commit histories.
3. **Log Redaction**:
   - Ensure that logging utilities never output sensitive data such as authentication headers, bearer tokens, private keys, session cookies, or user PII.

---

## Client Browser Storage & Security Implications

Because Chenpilot Client operates as a web-based client workspace and wallet application:
- **Storage Profile**: Sensitive authentication tokens and session states are stored in browser storage mechanisms (`localStorage` / encrypted cookies).
- **Security Implications**: Stored tokens are susceptible to theft if the client environment is compromised via Cross-Site Scripting (XSS). Contributors must maintain rigorous Content Security Policies (CSP), sanitize all user inputs, and keep third-party dependencies updated.
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
