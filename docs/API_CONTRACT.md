# Backend API Contract

This document records the HTTP requests made by [`src/services/api.ts`](../src/services/api.ts) and [`src/services/agentService.ts`](../src/services/agentService.ts). Types and examples below describe the frontend's declared/consumed shapes; they are not evidence that every experimental backend route currently implements them. Confirm the backend before treating an example as a server guarantee. Fields shown with `...` are explanatory omissions, not literal JSON.

## Signing And Authorization Boundary (#260)

The browser never holds private keys and never signs. Every endpoint below that changes on-chain state (`POST /query` for agent actions, `POST /auth/starknet/deploy`, `POST /auth/funding/*`, `POST /api/fund`) is signed and submitted by the backend, which must authorize each call against the bearer token's user. Client-side checks (validation, guards, confirmation UI) are not authorization. See `SECURITY.md` → "Wallet Key Ownership & Signing Boundary".

## Base URLs And Authentication

- `ApiService` uses `NEXT_PUBLIC_API_BASE_URL`, defaulting to `http://localhost:2333`.
- `AgentService` uses `NEXT_PUBLIC_AGENT_API_URL`, also defaulting to `http://localhost:2333`. These clients are separate even when configured to the same host.
- `ApiService` attaches `Authorization: Bearer <access-token>` when a token is present. Its explicit refresh call and the 401 interceptor send `POST /auth/refresh` with cookies (`withCredentials: true`).
- Next.js rewrites `/horizon/:path*` to `${NEXT_PUBLIC_API_BASE_URL || 'http://localhost:2333'}/proxy/:path*`. `horizonFetch` calls the local `/horizon` path; keep the backend `/proxy/:path*` handler available. Stellar Horizon reads made through `horizonFetch` are in `src/store/slices/accountSlice.ts`, not these service endpoint lists.
- `NEXT_PUBLIC_STELLAR_NETWORK` must be explicitly set to `mainnet` or `testnet` for the UI to identify the active network. Missing or unsupported values display `Network unknown`; do not infer it from `NODE_ENV`. The backend Horizon proxy and payment execution service must be configured for the same network. This frontend configuration does not itself switch backend networks.
- `ApiResponse<T>` is the declared envelope for many methods:

	```ts
	type ApiSuccess<T> = { success: true; data: T; message?: string };
	type ApiError = { success: false; status: number; message: string };
	type ApiResponse<T> = ApiSuccess<T> | ApiError;
	```

	Not all methods use this envelope: login/register have dedicated response types, balance has its own shape, and agent responses use `result`.

## Error Handling And User Messages

- Axios HTTP failures normally reject with an Axios error; the client does not normalize every backend error body into `ApiError`. `ApiError.status` is a number, not a closed set of application error codes. The backend error envelope beyond that type is not specified here.
- A 401 on an `ApiService` request triggers one queued refresh attempt and then retries the original request once. If refresh fails, local auth is cleared and the browser is sent to `/auth/login`. The auth UI may show the rejected thunk/error message.
- The retry interceptor retries eligible network failures and the configured 408, 429, and 5xx statuses, subject to method safety; 503 is retried for any method. It exposes retry state to the UI. This is transport retry behavior, not an application error envelope.
- Contact wrappers specially handle 404: `GET /contacts` becomes `{ success: true, data: [], message: ... }`; contact create/update/delete become `{ success: false, status: 404, message: ... }`. Other failures reject.
- Agent query wrappers catch failures and return `result.success: false` with a `result.errorKind` of `timeout`, `network`, `invalid_query`, `server` or `unknown` (#274). Timeouts (Axios `ECONNABORTED`/`ETIMEDOUT`, a "timeout" message, or HTTP 408/504) are kept separate from connectivity failures (`ERR_NETWORK`, no response). Each kind maps to its own friendly text, and chat displays it to the user. See [Agent Timeouts And Status Checks](#agent-timeouts-and-status-checks).
- The Google sign-in surface displays the caught error text. The liquidity widget displays generic inline errors (`Failed to fetch liquidity data` or `Error loading liquidity statistics`) rather than the backend message.
- Login/register forms dispatch auth thunks; the backend response contract is documented in the Authentication Endpoints table below.

## Privacy-Safe Authentication Errors (Account-Enumeration Resistance)

Login and registration errors are normalized on the client before reaching the user.  `AuthService.normalizeLoginError` and `AuthService.normalizeRegisterError` collapse **all** backend failure reasons — including wrong password, user-not-found, email-already-taken, 401, and 409 responses — into a single generic message.  The raw backend message is written only to `console.error` (a redacted log) and is never surfaced in a toast, inline error, or any other UI element.

This means:

- **Login**: any failure → "Invalid email or password. Please check your credentials and try again."
- **Registration**: any failure → "Unable to create account. Please check your details and try again."

Client-side Zod field validation (format, length, strength) is unaffected and continues to show targeted field-level messages because those checks fire before a network call is made — they reveal nothing about account state.

The backend SHOULD return the same HTTP status (401 for login failures, 409 for duplicate email) and MAY include a descriptive `message` in the response body.  That body message is intentionally discarded by the client.  Do not add UI code that reads `error.response.data.message` for login or registration errors.

## Agent Endpoints

These routes use `NEXT_PUBLIC_AGENT_API_URL` through `AgentService`, except `apiService.queryAgent`, which may use this agent service first and otherwise posts to the API base URL's `/query`.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /health` | No body; unauthenticated; 5s timeout. | `{"status":"ok"}`. `status` is `ok`/`healthy`/`up`, `degraded`, or `down`/`unhealthy`. A `503` may carry the same body. | **Proposed; backend support not yet confirmed.** The primary probe in `agentService.healthCheck()` (#272); the measured round trip is reported as `responseTimeMs`. |
| `HEAD /` | No body; fallback probe. | Any HTTP status below 500; the body is ignored. | Used only when `GET /health` answers `404`/`405`/`501`. The result is connectivity-only: `probe: "connectivity"`, `healthEndpointSupported: false`. |
| `POST /query` | `{"userId":"user-1","query":"What is my XLM balance?","clientRequestId":"agent_query_1767225600_k3j9xz"}` | `{"result":{"success":true,"data":"Your balance is ...","error":null}}` (`executionTrace` is optional). | Chat query; failures become friendly `result` messages shown in chat. The client adds `requestId`, `stateChanging` and, on failure, `errorKind` to the returned `result`. |
| `GET /query/{clientRequestId}/status` | `GET /query/agent_query_1767225600_k3j9xz/status` | `{"status":"completed","result":{"success":true,"data":"Sent 50 XLM","transactionHash":"..."}}`; `status` is `pending`, `completed` or `failed`. | **Proposed; backend support not yet confirmed.** The "Check status" action shown after a state-changing query times out. A 404/501, network error or unrecognized body resolves as `unknown`. Also checked before retrying a state-changing prompt (#262), where `not_found` means the id was never seen. |
| `GET /memory/{userId}` | `GET /memory/user-1` | `[]` (declared `string[]`). | Service method only; failures are logged and return an empty list. |
| `DELETE /memory/{userId}` | `DELETE /memory/user-1` | `204 No Content`; the response body is ignored. | Service method only; failures reject as `Failed to clear agent memory`. |
| `GET /tools` | No body. | `[]` (the service currently does not declare tool item fields). | Service method only; failure returns an empty list. |
| `POST /tools/{toolName}/execute` | `POST /tools/swap/execute` with `{"from":"XLM","to":"USDC","amount":"10"}` | Example pass-through: `{"result":"..."}`. The service does not define or validate this response shape. | Service method only; errors are rethrown as a tool failure. |

**Health result (#272).** `AgentHealthCheck` reports:
- `probe`: `health_endpoint` or `connectivity`.
- `healthEndpointSupported`: whether `GET /health` exists.
- `responseTimeMs`: the measured round trip of the probe that answered, or `null` if nothing answered.
- `reason` when unhealthy: `network` and `timeout` mean no answer; `server_error` means a 5xx answer.

An unsupported `/health` is not an outage: the client falls back to `HEAD /` and reports connectivity only. `system` metrics are included only if the backend provides them; the client no longer sends zeroed placeholders.

### Agent Response Envelope (#275)

`POST /query` must answer with one of these bodies. Both `AgentService.queryAgent` and the `apiService.queryAgent` backend fallback validate them with `parseAgentEnvelope` (`src/services/agentEnvelope.ts`).

**Success:**
```json
{ "result": { "success": true, "data": "Your balance is 100 XLM", "error": null } }
{ "result": { "success": true, "data": { "vaults": [] } } }
{ "result": { "success": true, "data": "Sent 10 XLM", "transactionHash": "abc123",
              "executionTrace": { "steps": [] },
              "metadata": { "type": "wallet", "action": "transfer_xlm", "amount": "10", "asset": "XLM" } } }
```
`data` is a non-empty string, an object or an array. `error` must be absent, `null` or `""`.

**Failure** (HTTP 200 with a failed result):
```json
{ "result": { "success": false, "data": "Not enough XLM", "error": "insufficient_funds" } }
{ "result": { "success": false, "error": "insufficient_funds" } }
```
At least one of `error` or a string `data` is required. When `data` is missing, `error` is shown as the message.

Optional fields, when present, must be: `executionTrace` an object, `transactionHash` a string, `metadata` an object.

**Protocol errors.** Any other body is reported as a failure, never as a success. This includes:
- plain text
- a bare object without `result`
- `success` missing or not a boolean
- a success with no or empty `data`, or with an `error`
- a failure with neither `error` nor `data`
- optional fields of the wrong type

The client returns:
```json
{ "result": { "success": false, "data": "The agent sent a response this app could not understand. Please try again.",
              "error": "protocol_error: <reason>" } }
```
Earlier versions defaulted `success` to `true` and wrapped unknown bodies as successful replies; that is no longer the case. HTTP errors (4xx/5xx, network) are unchanged and still become friendly failure results.

### Agent Status (#271)

**Proposed; backend support not yet confirmed.**

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /status` | No body; 5s timeout. | `{"version":"2.3.0","uptimeSeconds":5400,"activeConnections":12,"lastActivity":"2026-10-21T10:00:00Z","services":{"soroswap":{"isActive":true,"isHealthy":true,"lastCheck":"2026-10-21T09:59:00Z"},"blend":{"isActive":true,"isHealthy":false,"lastCheck":"2026-10-21T09:59:00Z","error":"RPC timeout"}}}` | `AgentStatus` dashboard. Each field is validated on its own; missing or invalid fields stay `null`. |

`agentService.getStatus()` no longer invents values:
- `isOnline` comes only from `healthCheck()`.
- Metrics (`version`, `uptime`, `activeConnections`, `lastActivity`) come only from `GET /status`. If the endpoint is missing or fails, they are `null` and `source` is `"unavailable"`.
- `services` holds only the protocols the backend reports. It is empty, not "all healthy", when nothing was reported.

The dashboard shows "Unavailable" for `null` metrics and "Protocol health is unavailable" for empty `services`. A service whose health is `null` gets an "Unknown" marker. The probe's measured response time is shown, labelled "connectivity check only" when `/health` is unsupported.

`getCapabilities()` still returns a local object and makes no HTTP request. Its success no longer counts as the agent being online.

### Agent Timeouts And Status Checks

`AgentService` gives up waiting after `NEXT_PUBLIC_AGENT_TIMEOUT` (default 30000 ms). A client timeout does not mean the backend stopped: a transfer or swap may still complete.

- **While waiting:** after 10s the chat typing indicator changes to "Still working on it (Ns)" and names the timeout.
- **Read-only queries** (balance, APY, ...): the timed-out reply shows a **Retry** button that resends the previous user message.
- **State-changing queries** (send, transfer, swap, lend, borrow, withdraw, repay, deposit, stake, claim, harvest, liquidate, deploy, add/remove liquidity or collateral): no retry is offered, so the action can't be submitted twice. The reply says the action may still be running and shows **Check status**, which calls `agentService.getActionStatus(requestId)`:
  - `completed` / `failed`: the message is replaced with the late result, including `transactionHash` when present.
  - `pending`: "Still running. Check again in a moment."
  - `unknown`: the user is asked to check their wallet's transaction history before trying again.

**Backend requirements (unconfirmed):**
1. Accept the extra `clientRequestId` field on `POST /query`. Backends that ignore unknown fields are unaffected.
2. Implement `GET /query/{clientRequestId}/status` and keep status for at least as long as the slowest action plus a few minutes.
3. Ideally, dedupe `POST /query` by `clientRequestId` so a resend cannot run an action twice.

Until (2) ships, status checks resolve as `unknown` and users are pointed to their transaction history. The backend fallback in `apiService.queryAgent` sets `errorKind` but sends no `clientRequestId`, so its timeouts can't be status-checked.

### Retrying Failed Agent Queries (#262)

Uses the same `clientRequestId` and `GET /query/{clientRequestId}/status` endpoint as the timeout flow above. For the retry flow, the status endpoint may also answer `not_found` (a `200` with `{"status":"not_found"}`) for an id it has never seen. Timed-out replies are handled by `AgentTimeoutNotice` above; `AgentRetryAction` covers the other retryable failures.

**Idempotency.** Every `POST /query` carries a `clientRequestId`. A retry sends the **same** id. The backend should treat it as an idempotency key: if that id already completed, return the stored result instead of executing again.

**Which failures offer a retry** (`isRetryableErrorKind`):

| `errorKind` | Source | Retry shown |
| --- | --- | --- |
| `timeout` | Axios `ECONNABORTED`/`ETIMEDOUT`, a "timeout" message, HTTP 408/504 | Yes |
| `network` | `ERR_NETWORK`, no response | Yes |
| `server` | HTTP 5xx, 429 | Yes |
| `unknown` | Anything else | Yes |
| `invalid_query` | "invalid query", other HTTP 4xx | No: the same prompt would fail again |
| `unauthenticated` | HTTP 401/403, "User not authenticated" | No: the user must sign in |

**Retry flow** (`AgentRetryAction`, `agentService.checkBeforeRetry`):
- **Preserved prompt:** the failed reply stores the original prompt (`retryPrompt`), the optimistic user-message id (`retryTempId`) and the `requestId`. A retry resends the prompt exactly as typed, reuses the original user bubble (no duplicate) and removes the failed reply.
- **Read-only prompts** retry immediately.
- **State-changing prompts** (send, transfer, swap, lend, borrow, withdraw, repay, deposit, stake, claim, harvest, liquidate, deploy, add/remove liquidity or collateral) query the status endpoint first:
  - `completed`: nothing is resent; the failed reply is replaced with the stored result.
  - `pending`: nothing is resent; the user is asked to check again shortly.
  - `failed` / `not_found`: the query is resent with the same `clientRequestId`.
  - `unknown`: nothing is resent until the user clicks "Retry anyway", after being told to check their transaction history.

### Chat Event Resync (#277)

**Proposed; backend support not yet confirmed.** The client sends these requests to the API base URL through `apiService.getMissedChatEvents`.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /chat/events` | `GET /chat/events?after=c_1042&limit=100` | `{"events":[{"event":"chat:message","cursor":"c_1043","data":{"cursor":"c_1043","message":{"id":"srv_88","type":"agent","content":"...","timestamp":"2026-01-01T00:00:00Z","metadata":{"requestId":"agent_query_..."}}}}],"hasMore":false,"nextCursor":"c_1043"}` | Called after each socket reconnect to replay events missed during downtime, oldest first. Failures are recorded as a resync error; live events keep working. |

The live socket event `chat:message` must carry the same `{ cursor, message }` payload. See `src/docs/MESSAGE_ORDERING.md` §6 for cursor and dedupe rules.

### Agent Response Streaming (#261)

**Proposed; backend support not yet confirmed.** Streaming is off unless `NEXT_PUBLIC_ENABLE_AGENT_STREAMING=true`. When it is enabled and the agent service is connected, `apiService.queryAgent` calls `agentService.queryAgentStreaming`.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /query/stream` | `{"userId":"user-1","query":"Swap 10 XLM for USDC"}` with `Accept: text/event-stream` | `200`, `Content-Type: text/event-stream`, and a stream of the events below | Chat shows partial text as it arrives, then replaces it with the final message. |

**Transport.** Server-Sent Events over a `fetch` POST; `EventSource` can't send a body. Blank-line-terminated messages, `event:` and `data:` fields, and `:` comment lines as keep-alives are supported.

**Event schema.** Each `data` is JSON:

| `event` | `data` | Client behavior |
| --- | --- | --- |
| `delta` | `{"requestId":"...","seq":0,"text":"Checking "}` | Appends `text` in `seq` order; `seq` starts at 0 and increases by 1. A repeated or older `seq` is ignored. |
| `final` | `{"requestId":"...","result":{"success":true,"data":"Your balance is 100 XLM","error":null}}` | Same `result` shape as `POST /query`. **Authoritative:** it replaces the streamed text, so content is never shown twice. Ends the request. |
| `error` | `{"requestId":"...","message":"tool crashed"}` | Ends the request with a failed `result` (`error` = `message`). |

Unknown events and malformed JSON are ignored.

**Rules:**
- **Fallback:** a `404`, `405` or `501` response, or a success response that is not `text/event-stream`, means streaming is unsupported. The client sends the same request to `POST /query` and stops trying streaming for the session. The fallback happens only before any event has been received, so a query is never executed twice.
- **Interrupted stream:** a stream that ends without `final` is reported as `{"success":false,"error":"stream_incomplete"}`. Partial text is never treated as the answer.
- **Cancellation:** `ChatEngine` aborts the in-flight `sendMessage` thunk when the route changes or the chat unmounts. The `AbortSignal` cancels the fetch and stops the body reader. The partial preview is cleared without an error bubble, the user message is marked `failed`/`cancelled`, and late deltas are dropped because they no longer match the in-flight request id. The backend should stop work when the client disconnects.
- **Rendering:** partial text is rendered with `AgentMarkdown`, under the same safety policy as final messages (`docs/MARKDOWN_SAFETY.md`).

## Chat History Endpoint

**Proposed; backend support not yet confirmed.** This route uses the API base URL through `apiService.getChatHistory`.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /chat/history` | Newest page: `GET /chat/history?limit=50`. Older page: `GET /chat/history?before=<nextCursor>&limit=50`. Bearer token when available. `limit` is clamped to 1–100. | `{"messages":[{"id":"msg_1","type":"user","content":"What is my XLM balance?","timestamp":"2026-01-01T00:00:00Z"}],"nextCursor":"c_0041","hasMore":true}` | Chat history page: `fetchChatHistory` loads the newest page, and `loadOlderHistory` loads the next older page. Server messages are merged into locally cached messages by `id`. |

Load states on `/chat/history` (#265):
- **Loading, nothing cached:** a loading indicator, not the empty state.
- **Loaded and empty:** "No chat history yet" with a "Start new chat" action.
- **Failed, nothing cached:** a dedicated error state (`EmptyState tone="error"`, `role="alert"`) with "Try again" and "Start new chat".
- **Failed with cached messages:** the cached conversations stay visible under an inline alert with "Try again". A failed request never clears cached messages.
- **404 or 501:** treated as "this backend has no server history". The page shows the local cache, or the empty state, without an error.

Pagination (#264):
- **Cursor:** `nextCursor` is opaque and must stay valid for the same position even when new messages arrive. For example, encode the oldest returned message's `(timestamp, id)` rather than an offset. `hasMore: false` or `nextCursor: null` ends paging.
- **Order:** messages in a page may come in any order. The client merges them by `id`, so overlapping or repeated pages never create duplicate rows, and re-sorts chronologically.
- **Stale or stuck cursors:** the client only advances the cursor if the response belongs to the cursor it currently holds, so a late response cannot move it backwards. A page that returns the same cursor it was requested with is treated as the end.
- **One request at a time:** a page request is skipped while another is in flight or when there is nothing older. A failed page keeps the cursor and shows "Retry loading older messages".
- **Scroll position:** the history view records `scrollTop`/`scrollHeight` before requesting an older page and shifts `scrollTop` by the added height after it is prepended (`usePrependScrollAnchor`), so the view does not jump.

## Authentication Endpoints

### Auth Validation Errors (#258)

When `POST /auth/login` or `POST /auth/register` rejects input, the backend should respond with `400` or `422` and one of these bodies. Each is normalized by `normalizeAuthError` (`src/services/auth.service.ts`):

```json
{ "success": false, "status": 422, "message": "Validation failed",
  "errors": { "email": "Email is already registered", "password": ["Too short", "Needs a number"] } }
```
```json
{ "success": false, "status": 400, "message": "Validation failed",
  "errors": [{ "field": "email", "message": "Invalid email" }] }
```

Also accepted:
- `param` / `msg` instead of `field` / `message` (express-validator style)
- `path` as a string (`"user.email"`) or an array (`["body","email"]`, zod style)
- `details` instead of `errors`

Field names map onto form inputs `email`, `password` and `name`. The aliases `username` and `emailAddress` map to `email`, and `fullName` and `displayName` map to `name`.

**What the forms show.** "Privacy-Safe Authentication Errors" above takes precedence:
- **Login:** every failure shows only the generic message (`authService.normalizeLoginError`). No server field errors are attached, because any of them could reveal whether an account exists.
- **Registration:** the toast is always the generic message (`authService.normalizeRegisterError`). Server field errors are attached to inputs (`aria-invalid`, first errored field focused) only when they cannot reveal account existence (`applyAuthErrors` with `hideAccountExistence`): every server error on `email` is dropped, as is any message matching `ACCOUNT_EXISTENCE_PATTERNS`. A password-policy or name-format message is still shown on its field.

**Rules:**
- Email and name stay in the form after a failure. The password input is cleared.
- The submitted password is masked as `••••••` in every displayed message, and echoed `value` fields are ignored. Servers must not echo passwords at all.
- Failures with no structured body show a generic message rather than raw HTML or stack text.
- The login/register thunks reject with this normalized payload (`rejectWithValue`). They still return mock users today (see the note below), so the mapping takes effect once they call `apiService.login` / `apiService.register`.

`User` response fields are `id`, `email`, `name`, `address`, `publicKey`, `isDeployed`, `isFunded`, `tokenType`, `authProvider`, `isEmailVerified`, `createdAt`, and `updatedAt`. `RegisterResponse` additionally declares `stellarAccount`, the backward-compatible `starknetAccount` alias, and `setupStatus` with funding/deployment results.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /auth/register` | `{"email":"ada@example.test","password":"Example123!","name":"Ada"}` | `{"success":true,"message":"Registered","data":{"user":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":false,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"},"token":"<jwt>","stellarAccount":{"address":"G...","publicKey":"G...","isDeployed":true},"starknetAccount":{"address":"G...","publicKey":"G...","isDeployed":true},"setupStatus":{"funding":{"success":true,"amount":"10"},"deployment":{"success":true},"fullyReady":true}}}` | Registration form; API wrapper available. |
| `POST /auth/login` | `{"email":"ada@example.test","password":"Example123!"}` | `{"success":true,"message":"Signed in","data":{"user":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"},"token":"<jwt>","stellarAccount":{"address":"G...","publicKey":"G...","isDeployed":true},"starknetAccount":{"address":"G...","publicKey":"G...","isDeployed":true}}}` | Login form; API wrapper available. |
| `POST /auth/google-auth` | `{"token":"<google-id-token>"}` | Same declared shape as `LoginResponse` above. | Google sign-in flow; errors are shown in a toast. |
| `GET /auth/verify-email/{token}` | `GET /auth/verify-email/<verification-token>` | `{"success":true,"data":{"message":"Email verified"}}` | Service method only; no direct screen caller found. |
| `POST /auth/resend-verification` | `{"email":"ada@example.test"}` | `{"success":true,"data":{"message":"Verification email sent"}}` | Service method only; no direct screen caller found. |
| `POST /auth/forgot-password` | `{"email":"ada@example.test"}` | `{"success":true,"data":{"message":"Reset email sent"}}` | Service method only; no direct screen caller found. |
| `POST /auth/reset-password/{token}` | `POST /auth/reset-password/<reset-token>` with `{"password":"NewExample123!"}` | `{"success":true,"data":{"message":"Password reset"}}` | Service method only; no direct screen caller found. |
| `POST /auth/logout` | `{}`; cookies are included. | `204 No Content`; body is ignored. | Logout action from the chat layout/auth service; local credentials are cleared even if the request fails. |
| `POST /auth/refresh` | `{}`; cookies are included. | `{"token":"<new-jwt>"}` | Auth refresh thunk and automatic 401 refresh interceptor. |
| `GET /auth/me` | No body; bearer token when available. | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | `fetchProfile` auth thunk; the thunk consumes the `User` on success. |
| `GET /auth/profile` | No body; bearer token when available. | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | Service method only; no direct screen caller found. |
| `PUT /auth/profile` | `{"name":"Ada Lovelace"}` (any `Partial<User>` fields). | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada Lovelace","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}}` | Service method; profile update route available. |
| `POST /auth/change-password` | `{"currentPassword":"Example123!","newPassword":"NewExample123!"}` | `{"success":true,"data":{"message":"Password changed"}}` | Service method only; no direct screen caller found. |
| `DELETE /auth/account` | No body; bearer token when available. | `{"success":true,"data":{"message":"Account deleted"}}` | Service method only; clears the in-memory/local token after the request resolves. |

Protected settings actions include password changes, MFA changes, and device management. Password and MFA changes require re-verifying the current email/password with `POST /auth/login`; the response token is discarded and the in-memory verification grant expires after five minutes or when leaving settings. Password changes still send `currentPassword` to `POST /auth/change-password` as required by its existing contract. The settings UI validates password and confirmation with the shared `changePasswordSchema` (at least eight characters, uppercase, lowercase, and a number) and shows the shared strength meter. Google-only accounts cannot use the password-change flow, and provider re-authentication for MFA is not available for Google-only accounts. MFA enrollment and verification are described below. Device-management routes are not defined in this client. The backend must enforce recent authentication itself for protected operations (a client-side gate is not an authorization boundary).

### Multi-Factor Authentication (MFA) Specification & Contract Notes

**Current Implementation Status:**
- Authoritative backend MFA endpoints are currently **NOT implemented or deployed** on the backend.
- The client provides typed service integration (`ApiService.getMfaStatus`, `ApiService.initiateMfaEnrollment`, `ApiService.verifyMfaEnrollment` and `AuthService`) that safely detects unsupported/missing backend routes (HTTP 404/501) and presents clear states without fabricating backend enrollment or falsely marking MFA as enabled.
- The settings UI exposes explicit states: `Disabled`, `Enrollment in progress`, `Awaiting verification`, `Enabled`, `Recovery in progress` (when recovery codes are returned), and `Error / Unsupported`.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /auth/mfa/status` | No body; bearer token required. | `{"success":true,"data":{"enabled":false,"method":"totp"}}` | Settings security panel; checks authoritative MFA status. 404 is treated as unsupported (disabled). |
| `POST /auth/mfa/enroll` | `{}`; bearer token required. | `{"success":true,"data":{"secret":"JBSWY3DPEHPK3PXP","qrCodeUrl":"https://...","otpAuthUri":"otpauth://totp/ChenPilot:user?secret=...","recoveryCodes":["REC-1111","REC-2222"]}}` | Settings security panel; initiates enrollment. Returns secret key and TOTP URI. 404 displays unsupported capability error. |
| `POST /auth/mfa/verify` | `{"code":"123456"}`; bearer token required. | `{"success":true,"data":{"enabled":true,"message":"MFA enabled successfully","recoveryCodes":["REC-1111","REC-2222"]}}` | Settings security panel; verifies 6-digit TOTP code. Authoritative confirmation is required before enabling MFA. |

**MFA Challenge During Login:**
- `POST /auth/login` currently returns full tokens immediately and does not issue an intermediate MFA challenge.
- When MFA login enforcement is implemented on the backend, `POST /auth/login` must return a challenge state (e.g., `{ success: true, data: { mfaRequired: true, challengeToken: "<temp-token>", method: "totp" } }`) and a corresponding `POST /auth/mfa/challenge` endpoint must be established.

**MFA Recovery and Cancellation:**
- Recovery: The backend does not currently provide an endpoint for regenerating recovery codes or authenticating via recovery code. When recovery codes are provided during initial enrollment, the client displays them once and instructs the user to store them securely.
- Cancellation: The user can cancel setup at any time prior to verification. Cancellation immediately purges all transient enrollment secrets and one-time codes from memory.
- Storage & Security: The client **never** persists MFA secrets, temporary OTP codes, or recovery codes in `localStorage` or `sessionStorage`. All sensitive values reside in volatile React state and are cleared on component unmount, cancellation, or flow completion.
- Blockers: Production MFA cannot be marked enabled for accounts until the backend implements and confirms the `/auth/mfa/enroll` and `/auth/mfa/verify` routes.

### Data Export Fallbacks

`exportUserData()` tries these paths in order, moving to the next only on HTTP 404. Each successful response is consumed as a binary `Blob`, not JSON.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /data-export` | No body; bearer token when available. | `200` with `Content-Type: application/octet-stream` and downloadable bytes. | Service method only. |
| `GET /data/export` | Same request; tried only if the preceding path returns 404. | `200` with downloadable bytes (`Blob`). | Service fallback candidate only. |
| `GET /api/data-export` | Same request; tried only if both preceding paths return 404. | `200` with downloadable bytes (`Blob`). | Service fallback candidate only. |

## Account Endpoints

The service includes methods for Stellar/Starknet account and funding paths. `getAccountTransactions` is used by the account transaction flow.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /auth/starknet/deploy` | `{}` | `{"success":true,"data":{"transactionHash":"0xabc","contractAddress":"0xdef"}}` | Service method; Starknet deploy route. |
| `GET /auth/starknet/balance` | No body; bearer token when available. | `{"success":true,"data":{"hasBalance":true,"balance":"12.5","required":"1","nativeBalance":"12.5"}}` | Service method; Starknet balance route. |
| `GET /auth/starknet/status` | No body; bearer token when available. | `{"success":true,"data":{"isDeployed":true,"isFunded":true,"address":"G...","publicKey":"G..."}}` | Service method; Starknet status route. |
| `POST /auth/funding/fund-account` | `{}` | `{"success":true,"data":{"transactionHash":"0xabc","amount":"10"}}` | Service method; funding route. |
| `GET /auth/funding/auto-funding-stats` | No body. | `{"success":true,"data":{"totalFunded":10,"totalAccounts":8,"averageAmount":"5.25"}}` | Service method; funding statistics route. |
| `GET /auth/funding/funded-account-balance` | No body. | `{"success":true,"data":{"balance":"10","hasBalance":true}}` | Service method only; no direct screen caller found. |
| `POST /auth/funding/batch-fund` | `{"amounts":["1","2.5"]}` | `{"success":true,"data":{"transactionHashes":["0xabc","0xdef"],"totalAmount":"3.5"}}` | Service method only; no direct screen caller found. |
| `GET /account/{userId}/transactions?page={page}&limit={limit}` | `GET /account/u1/transactions?page=1&limit=10` | `{"success":true,"data":{"transactions":[],"total":0,"page":1,"limit":10}}` | Account transaction thunk/dashboard; errors are stored in account state. |

### Transaction Schema & Direction Contract

`StellarTransaction` records returned by `GET /account/{userId}/transactions` contain `id`, `hash`, `ledger`, `created_at`, `source_account`, `fee_charged`, `operation_count`, `successful`, `operations: StellarOperation[]`, and optional `direction`. Each `StellarOperation` contains `id`, `type`, `source_account`, optional `amount`, optional `asset` (or `asset_code`, `asset_issuer`, `asset_type`), optional `from`, optional `to`, and optional `direction`.

Direction classification (`incoming | outgoing | self | unknown`) is resolved dynamically for transaction rows against the signed-in user's active account address:
- **`incoming`**: Destination account (`to`) matches active account address, and source account does not. Formatted with a `+` prefix and emerald styling.
- **`outgoing`**: Source account (`from`, `source_account`, or transaction `source_account`) matches active account address, and destination account is specified and does not match active account. Formatted with a `-` prefix and rose styling.
- **`self`**: Both source and destination accounts match active account address (self-transfers). Formatted neutrally without directional signs.
- **`unknown`**: Missing active address, missing operation accounts (neither source nor destination present), non-transfer operations, or third-party operations. Formatted neutrally with `-` for missing amounts.

### Asset Canonical Identification & Issuer Handling

Asset codes alone do not globally identify issued assets on Stellar (multiple distinct issuers may issue tokens with identical tickers, e.g., `USDC`). The client prevents ambiguous ticker presentation through the following contract:
- **Canonical Asset Identifier**: Issued assets are uniquely identified by `<CODE>:<ISSUER>` (e.g., `USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`). Native currency resolves canonically to `XLM` without an issuer.
- **Same-Code Distinct Issuers**: Transactions involving the same asset code (e.g., `USDC`) from distinct issuers display the formatted issuer address alongside the ticker and expose the full canonical identifier on title/hover, ensuring distinct assets cannot be conflated.
- **Incomplete Metadata Fallback**: When an operation specifies an issued asset code without an issuer or canonical pair, the client applies a safe fallback: the ticker is rendered with an explicit `unverified issuer` badge to alert the user of incomplete metadata, while native fallbacks default safely to `XLM`.

## Payment Submission And Status (Backend Support Required)

The send-payment UI now requires explicit confirmation before calling the payment service. The frontend declares the following backend contract, but no existing payment route was present in this repository; verify and implement these routes on the backend before enabling real payments.

| Endpoint | Request example | Expected success response | Client behavior |
| --- | --- | --- | --- |
| `POST /payments` | `{"recipientAddress":"G...","amount":"1.25","tokenType":"XLM","memoType":"none"}` with `Idempotency-Key: <uuid>` | `{"success":true,"data":{"status":"submitted","transactionHash":"<hash>"}}` (transaction reference optional while pending) | Payment operations are excluded from automatic retries. The backend must atomically deduplicate a key and return the original result for repeated submissions with that key. |
| `GET /payments/status?idempotencyKey=<uuid>` | Same idempotency key from the original submit | `{"success":true,"data":{"status":"pending|submitted|confirmed|failed","transactionHash":"<hash>"}}` | A transport failure, timeout, or 5xx leaves the UI in an outcome-unknown state with a status-check action; it must not resubmit automatically. A definitive 4xx is shown as a failed submission. |

The backend should return an explicit `confirmed` result only after it has authoritative confirmation. A `not_found` or unavailable status is not permission to resubmit: the client retains the original key and asks the user to check again. Ensure `/payments/status` is scoped to the authenticated user and does not disclose another user's payment status.

## Contacts Endpoints

`Contact` is `{ id, name, address, tokenType, createdAt, updatedAt, avatar?, isFavorite?, lastUsed? }`. Create requires `name`, `address`, and a `tokenType` from `XLM | USDC | USDT | BTC | ETH`; update accepts those fields optionally.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /contacts` | No body; bearer token when available. | `{"success":true,"data":[{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}]}` | Contacts page/send flow; wrappers handle 404 specially. |
| `POST /contacts` | `{"name":"Ada","address":"G...","tokenType":"XLM"}` | `{"success":true,"data":{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. |
| `PUT /contacts/{id}` | `PUT /contacts/c1` with `{"name":"Ada Lovelace"}` | `{"success":true,"data":{"id":"c1","name":"Ada Lovelace","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. Also used to toggle `isFavorite`; the client sends `{"isFavorite":true}` or `{"isFavorite":false}`. The flip is applied optimistically in Redux and reverted if the request fails. |
| `DELETE /contacts/{id}` | `DELETE /contacts/c1` | `{"success":true,"data":{"message":"Contact deleted"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. The client uses a soft-delete / undo pattern: the contact is removed from the UI immediately (`softDeleteContact`) and the backend call (`commitDeleteContact`) is deferred by 5 s to allow undo. If the backend call fails the contact is automatically restored in Redux state and an error toast is shown. |

The contacts screen searches the complete loaded contact list and renders 24 matches per page. This is client-side pagination; the current contacts contract does not define page/limit parameters, so no paginated backend response is assumed.

The payment screen may use `data.nativeBalance` as the total native balance and `data.required` as the minimum required reserve. It displays spendable XLM as `max(0, nativeBalance - required)` only when both values are finite numbers; this is a display estimate, not a payment authorization guarantee. Reserve-related payment failures are translated when the backend message mentions a reserve or minimum/insufficient native balance. No stable backend error code is currently declared.

## Liquidity Endpoint

`LiquidityRequest` fields are optional: `includeInactive`, `limit`, `sortBy` (`liquidity | volume | apr`), and `sortOrder` (`asc | desc`). The UI polls this endpoint every 30 seconds and requests the ten highest-liquidity pools.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /liquidity` | `{"sortBy":"liquidity","sortOrder":"desc","limit":10}` | `{"success":true,"data":{"totalPools":1,"totalLiquidity":"100000","totalVolume24h":"5000","averageAPR":0.12,"activePools":1,"topPools":[],"networkMetrics":{"gasPrice":"1","blockNumber":123,"timestamp":"2026-01-01T00:00:00Z"}}}` | `LiquidityPoolStats` widget; errors show a generic inline message. |

`topPools` items use `LiquidityPool`: pool id/name, token1/token2 metadata, reserve and liquidity strings, APR, 24-hour volume, fee, active flag, and `created_at`.

## Browser Security And CSP Reports

Next.js applies the security headers defined in [`src/security/securityHeaders.ts`](../src/security/securityHeaders.ts) to every route. The content security policy allows Google OAuth and font endpoints, Stellar Horizon, and API/socket origins configured by `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SOCKET_URL`.

Browsers can submit CSP violation reports to `POST /api/csp-report`. The endpoint accepts legacy `csp-report` and Reporting API `body` JSON, caps input at 16 KiB, and logs only the document URL, blocked URL, and violated directive. It does not require authentication because browsers send reports automatically. Production responses include HSTS; development responses omit HSTS and allow `unsafe-eval` for the development bundler. Review CSP reports when adding a browser integration, then add only its required origin to the policy.

- `POST /auth/refresh` | `{}`; cookies are included. | `{"token":"<new-jwt>"}` | Auth refresh thunk and automatic 401 refresh interceptor. Socket connections safely update authentication and reconnect once without leaking listeners or opening duplicate connections.
