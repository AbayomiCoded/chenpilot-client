# Backend API Contract

This document records the HTTP requests made by [`src/services/api.ts`](../src/services/api.ts) and [`src/services/agentService.ts`](../src/services/agentService.ts). Types and examples below describe the frontend's declared/consumed shapes; they are not evidence that every experimental backend route currently implements them. Confirm the backend before treating an example as a server guarantee. Fields shown with `...` are explanatory omissions, not literal JSON.

## Signing And Authorization Boundary (#260)

The browser never holds private keys and never signs. Every endpoint below that changes on-chain state (`POST /query` for agent actions, `POST /auth/starknet/deploy`, `POST /auth/funding/*`, `POST /api/fund`) is signed and submitted by the backend, which must authorize each call against the bearer token's user. Client-side checks (validation, guards, confirmation UI) are not authorization. See `SECURITY.md` → "Wallet Key Ownership & Signing Boundary".

## Base URLs And Authentication

Environment variables beginning with `NEXT_PUBLIC_` are browser-visible configuration. They may contain public endpoints and identifiers, but never credentials or tokens. Server/CI secrets must remain unprefixed and must not be read by client code. See `SECURITY.md` → "Secret-Handling & Development Rules".

- `ApiService` uses `NEXT_PUBLIC_API_BASE_URL`, defaulting to `http://localhost:2333`.
- `AgentService` uses `NEXT_PUBLIC_AGENT_API_URL`, also defaulting to `http://localhost:2333`. These clients are separate even when configured to the same host.
- Public API, agent, and socket origins are parsed at startup. Production requires HTTPS; credentials, fragments, malformed URLs, and non-HTTP(S) schemes are rejected. HTTP is permitted only in development/test for local backend origins.
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
- Requests may include `X-Correlation-ID`. This is a safe diagnostic identifier, not authentication or a payload field. The backend MAY echo `X-Correlation-ID` or `X-Request-ID` in the response. The client keeps the value in structured diagnostic details and logs only status, method/code, and correlation metadata; prompts, tokens, private keys, wallet secrets, and response payloads are excluded. Backend log correlation support is not currently guaranteed by this contract.
- The retry interceptor retries eligible network failures and the configured 408, 429, and 5xx statuses, subject to method safety; 503 is retried for any method. It exposes retry state to the UI. This is transport retry behavior, not an application error envelope.
- Contact wrappers specially handle 404: `GET /contacts` becomes `{ success: true, data: [], message: ... }`; contact create/update/delete become `{ success: false, status: 404, message: ... }`. Other failures reject. The contacts page and send flow now use these wrappers; contact requests are blocked while the browser is offline and are not queued.
- Agent query wrappers catch failures and return `result.success: false`. Messages containing `invalid query`, `timeout`, or `network` map to friendly text; other failures use a generic unavailable/query-failed message. Chat displays the returned error/message to the user.
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
| `GET /memory/{userId}` | `GET /memory/user-1` (the id is URL-encoded) | `200` with a JSON array of strings, e.g. `["prefers USDC","risk: low"]`. A user with no memory **must** get `200 []`, not `404`. | `agentService.getMemory` / `apiService.getAgentMemory` return `AgentMemoryResult` (#267): `{ok:true, entries}` for any valid array, including empty; `{ok:false, error:{kind, message, status?}}` otherwise. Kinds: `unavailable` (network, 5xx), `unauthorized` (401/403), `not_found` (404), `invalid_response` (not an array of strings). Failures no longer turn into an empty list. |
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

Capability lookups (see Agent Capabilities below) never count as the agent being online; only the health probe does.

### Agent Capabilities (#270)

**Proposed; backend support not yet confirmed.** `agentService.getCapabilities()` / `apiService.getAgentCapabilities()` call:

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /capabilities` | No body; 5s timeout. | `{"supportedActions":["swap","check_balance"],"supportedAssets":["XLM","USDC"],"supportedProtocols":["Soroswap"],"features":{"swapping":true,"lending":false},"limits":{"maxQueryLength":500},"updatedAt":"2026-10-21T09:00:00Z"}` | `AgentStatus` capability section. `supportedActions`, `supportedAssets` and `supportedProtocols` must be string arrays. Missing feature flags count as `false`, missing limits as `0`. |

The call never throws. It returns an `AgentCapabilitiesResult` with a source and freshness:

| `availability` | When | `source` | `capabilities` | UI |
| --- | --- | --- | --- | --- |
| `available` | `2xx` with a valid body | `backend` | Backend data | "Reported by agent"; features shown as enabled |
| `unsupported` | `404` / `405` / `501` | `local_fallback` | The app's built-in list (`LOCAL_CAPABILITIES`) | "App defaults (not confirmed)"; features shown disabled (`aria-disabled`, struck through), with an explanation |
| `unavailable` | Network error, other HTTP errors, or a malformed body | `none` | `null` | "Couldn't be reached" explanation; no actions shown |

`fetchedAt` records when the client asked, and `updatedAt` echoes the backend's value if sent. Results older than 5 minutes (`CAPABILITIES_MAX_AGE_MS`) show an "out of date" note. An `unavailable` result no longer counts as the agent being connected. Previously a fixed list was returned as if live, and outages became an empty, all-disabled object.

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

## Message Translation (#83)

**Proposed; backend support not yet confirmed.**

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /translate` | `{"text":"¿Cuál es el saldo de mi cartera?","targetLanguage":"en"}` | `{"translatedText":"What is my wallet balance?","detectedLanguage":"es"}` | `MessageTranslation` under chat messages. Failures (including 404/501) show "Translation is unavailable right now." |

- **When the button appears:** a "Translate to <language>" button shows only on messages that `detectLanguage` (`src/lib/translation.ts`) identifies as a different language from the user's preference. Detection is a lightweight client heuristic for en/ar/es/fr.
- **Display:** the translation appears inline below the message, labelled "Translated from <language>". The original text is never replaced, and the button toggles the translation off again.
- **Preference:** set under Settings → Language → "Translate messages into" (`ui.translationLanguage`, stored in `localStorage["translation_language"]`). The default, "Same as app language", follows the UI language.

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
| `POST /auth/sessions/revoke-others` | `{}`; bearer token and cookies are included. | `{"success":true,"data":{"currentSessionRevoked":false}}` (or a direct `{ "currentSessionRevoked": true }` response). | Settings action to revoke all other sessions. The backend must report whether it also revoked the calling session; the client only clears local auth and redirects when this flag is true. This endpoint is a frontend integration contract and must be implemented by the backend. |
| `POST /auth/refresh` | `{}`; cookies are included. | `{"token":"<new-jwt>"}` | Auth refresh thunk and automatic 401 refresh interceptor. |
| `GET /auth/me` | No body; bearer token when available. | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | `fetchProfile` auth thunk; the thunk consumes the `User` on success. |
| `GET /auth/profile` | No body; bearer token when available. | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | Service method only; no direct screen caller found. |
| `PUT /auth/profile` | `{"name":"Ada Lovelace"}` (any `Partial<User>` fields). | `{"success":true,"data":{"id":"u1","email":"ada@example.test","name":"Ada Lovelace","address":"G...","publicKey":"G...","isDeployed":true,"isFunded":true,"tokenType":"XLM","authProvider":"email","isEmailVerified":true,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}}` | Service method; profile update route available. |
| `POST /auth/change-password` | `{"currentPassword":"Example123!","newPassword":"NewExample123!"}` | `{"success":true,"data":{"message":"Password changed"}}` | Service method only; no direct screen caller found. |
| `DELETE /auth/account` | No body; bearer token when available. | `{"success":true,"data":{"message":"Account deleted"}}` | Service method only; clears the in-memory/local token after the request resolves. |

### Re-authentication For Sensitive Actions (#255)

**Proposed; backend support not yet confirmed.** See [ADR-0006](adr/0006-idle-session-reauthentication.md).

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /auth/reauthenticate` | `{"password":"Example123!"}`; cookies included. | `{"authenticatedAt":"2026-01-01T00:00:00Z","expiresAt":"2026-01-01T00:05:00Z"}`; a wrong password returns `401`/`403`. | `ReauthDialog`, shown only after a step-up challenge. |

**Step-up challenge.** When the user's last authentication is older than the server's limit, `POST /auth/change-password`, `DELETE /account` and the data-export routes respond with:

```json
HTTP 403
{ "code": "REAUTH_REQUIRED", "maxAgeSeconds": 300 }
```

The client prompts for the password, calls `/auth/reauthenticate` (`apiService.stepUpReauthenticate`) and retries the original request once. This applies on top of the settings page's own pre-check (the `POST /auth/login` verification grant described under "Protected settings actions"). `apiService.deleteAccount()` rethrows the challenge before clearing any local data. A `401` with this `code` does not trigger the token-refresh/logout interceptor. The client has no idle timer for these actions; the server's limit is the only rule.

### Sign-in Activity (#257)

**Proposed; backend support not yet confirmed.** These routes are used by `SignInActivity` on the settings page, through `sessionService`.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /auth/activity` | `GET /auth/activity?limit=20`; bearer token. | `{"events":[{"id":"evt_1","type":"sign_in","outcome":"success","occurredAt":"2026-10-20T09:15:00Z","device":{"browser":"Chrome","os":"macOS","type":"desktop"},"approxLocation":{"region":"Lagos","country":"NG"},"ipAddress":"203.0.113.42","method":"password","sessionId":"sess_1","current":true}],"capabilities":{"revokeSession":true,"reportEvent":true}}` | Settings → Recent sign-in activity. `404`/`501` shows "isn't available yet"; other failures show a retry. |
| `DELETE /auth/sessions/{sessionId}` | `DELETE /auth/sessions/sess_2` | `204 No Content` | "Sign out session". Shown only when `capabilities.revokeSession` is true, and never for the `current` session or for failed events. |
| `POST /auth/activity/{eventId}/report` | `POST /auth/activity/evt_3/report` with `{}` | `202 Accepted` | "This wasn't me". Shown only when `capabilities.reportEvent` is true; not shown for the current session. |

**Event model:**
- `type`: one of `sign_in`, `sign_out`, `password_change`, `reauthentication`, `token_refresh`.
- `outcome`: `success` or `failure`.
- `occurredAt`: ISO 8601. Events are shown newest first.

Events with an unknown type, unknown outcome or invalid date are dropped. `device` should be derived on the server. If only `userAgent` is sent, the client reduces it to "Browser on OS" and drops version numbers.

**Privacy defaults:**
- Shown by default: date, coarse device/browser, outcome and approximate location (region, country).
- `ipAddress` is never shown by default. "Show network details" reveals only a coarsened form (`203.0.113.x`; the first three groups of an IPv6 address).
- The backend should not send precise location or full fingerprints.

### Email Normalization (#259)

**Proposed contract; the backend must confirm it applies the same rule.** `POST /auth/login`, `POST /auth/register`, `POST /auth/forgot-password` and `POST /auth/resend-verification` should treat email addresses as follows:

1. Trim leading and trailing whitespace, including tabs, newlines, non-breaking spaces and zero-width spaces.
2. Lowercase the entire address. Comparison and uniqueness are case-insensitive.
3. Nothing else. No provider-specific rules: Gmail dots and `+tags` are kept, `googlemail.com` is not rewritten, and there is no punycode conversion. Whitespace inside the address is invalid and rejected by validation.

The client applies exactly this rule with `normalizeEmail` (`src/services/auth.service.ts`), shared by the login and registration forms through `toAuthPayload`. The input field keeps what the user typed; only the request payload is normalized. **Passwords are never trimmed or changed.** `emailSchema` accepts surrounding whitespace so an accidental space doesn't block submission, and whitespace-only input reports "Email is required".

| Typed | Sent |
| --- | --- |
| `  Ada.Lovelace@Example.COM ` | `ada.lovelace@example.com` |
| `first.last+tag@gmail.com` | `first.last+tag@gmail.com` |

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
| `POST /api/fund` | `{"publicKey":"G...","requiredAmount":10}` | `{"success":true,"message":"Account funded successfully via backend service.","txHash":"0xabc"}` | Account auto-funding endpoint; on testnet, falls back to Stellar Friendbot (`GET https://friendbot.stellar.org/?addr={publicKey}`) if backend fails. |

### Transaction Precision & Testnet Contract Rules

- **Precision**: All Stellar amounts in transaction requests, fees, and balance envelopes are formatted as strings with up to 7 decimal places (stroops, e.g. `'10.5000000'`). Do not use floating-point numbers.
- **Pagination**: `page` defaults to 1 (1-indexed) and `limit` defaults to 10. Empty pages return `{ success: true, data: { transactions: [], total: 0, page: N, limit: M } }`.
- **Testnet-Only Data**: Automated tests and client requests must strictly use testnet addresses (`G...`) and never transmit real mainnet credentials or private keys.
- **Contract Tests**: Verified in [`src/services/__tests__/apiContracts.test.ts`](../src/services/__tests__/apiContracts.test.ts).
| `GET /account/{userId}/transactions?page={page}&limit={limit}` | `GET /account/u1/transactions?page=1&limit=10` | `{"success":true,"data":{"transactions":[{"id":"tx1","hash":"abc...","ledger":123,"created_at":"2026-01-01T00:00:00Z","source_account":"G...","fee_charged":"100","operation_count":1,"successful":true,"operations":[],"memo":"invoice-42","memo_type":"text"}],"total":1,"page":1,"limit":10}}` | Account transaction thunk/dashboard; errors are stored in account state. `memo` and `memo_type` are optional. `memo_type` may be `text`, `id`, `hash`, or `return`. The transactions page renders the memo below operations with a type badge; values longer than 40 characters are truncated in the UI with the full value accessible via the element's `title` attribute. |

### Transaction Schema & Direction Contract

`StellarTransaction` records returned by `GET /account/{userId}/transactions` contain `id`, `hash`, `ledger`, `created_at`, `source_account`, `fee_charged`, `operation_count`, `successful`, `operations: StellarOperation[]`, and optional `direction`. Each `StellarOperation` contains `id`, `type`, `source_account`, optional `amount`, optional `asset` (or `asset_code`, `asset_issuer`, `asset_type`), optional `from`, optional `to`, and optional `direction`.

`type` is the raw Horizon operation type string. The client keeps a curated label for the variants it renders — `payment`, `create_account`, `account_merge`, `manage_offer`, `create_passive_offer`, `set_options`, `change_trust`, `allow_trust`, `account_created`, `invoke_host_function`, `bump_sequence`, and `ext_soroban_op`, declared as `StellarOperationType` in `src/types/index.ts`. Types outside that list render verbatim, and a transaction whose first operation has no `type` renders as `Unknown`, so an unrecognised variant never blanks out or drops a row. The backend is free to add Horizon types without a client change.

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

`Contact` is `{ id, name, address, tokenType, createdAt, updatedAt, avatar?, isFavorite?, lastUsed? }`. Create and update accept `tokenType` from the canonical set `XLM | USDC | USDT | BTC | ETH | AQUA`, which is defined once in `SUPPORTED_ASSETS` (`src/types/index.ts`) and shared by the contact editor, send form, contact picker, and Zod schemas. Passing a legacy value not in that set (e.g. `STRK`, `DAI`) will be rejected by the client's Zod schema with an actionable error message listing the supported tokens before the request reaches the server.
`Contact` is `{ id, name, address, tokenType, createdAt, updatedAt, avatar?, isFavorite?, lastUsed?, defaultMemo?, defaultMemoType? }`. Create requires `name`, `address`, and a `tokenType` from `XLM | USDC | USDT | BTC | ETH`; update accepts those fields optionally. Both create and update also accept the optional memo-preset fields `defaultMemo` (string) and `defaultMemoType` (`none | text | id | hash`). When `defaultMemoType` is `none` or absent, `defaultMemo` is ignored.

### Fallback Contract Behavior
When contacting an experimental backend that lacks dedicated `/contacts` routes:
- `GET /contacts`: Catches HTTP 404 and returns a successful empty envelope: `{ success: true, data: [], message: "Contact management is available through the chat interface" }`.
- `POST /contacts`: Catches HTTP 404 and returns `{ success: false, status: 404, message: "Contact creation is available through the chat interface. Try: \"Add John as a contact with address 0x123...\"" }`.
- `PUT /contacts/{id}`: Catches HTTP 404 and returns `{ success: false, status: 404, message: "Contact updates are available through the chat interface" }`.
- `DELETE /contacts/{id}`: Catches HTTP 404 and returns `{ success: false, status: 404, message: "Contact deletion is available through the chat interface. Try: \"Remove John from my contacts\"" }`.
- Non-404 errors (400, 401, 403, 500, network loss) reject with the underlying Axios error and are not converted into fallback success envelopes.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `GET /contacts` | No body; bearer token when available. | `{"success":true,"data":[{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}]}` | Contacts page/send flow is present; handles 404 fallback gracefully. |
| `POST /contacts` | `{"name":"Ada","address":"G...","tokenType":"XLM"}` | `{"success":true,"data":{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | Contact creation; 404 becomes an explanatory failure envelope. |
| `PUT /contacts/{id}` | `PUT /contacts/c1` with `{"name":"Ada Lovelace"}` | `{"success":true,"data":{"id":"c1","name":"Ada Lovelace","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}}` | Contact update; 404 becomes an explanatory failure envelope. |
| `DELETE /contacts/{id}` | `DELETE /contacts/c1` | `{"success":true,"data":{"message":"Contact deleted"}}` | Contact deletion; 404 becomes an explanatory failure envelope. |
| `GET /contacts` | No body; bearer token when available. | `{"success":true,"data":[{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}]}` | Contacts page; Redux slice calls this endpoint. 404 returns an empty-array success fallback. |
| `POST /contacts` | `{"name":"Ada","address":"G...","tokenType":"XLM","defaultMemo":"inv-42","defaultMemoType":"text"}` | `{"success":true,"data":{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","defaultMemo":"inv-42","defaultMemoType":"text","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | Create modal; only the targeted create button is disabled while in-flight. 404 returns an explanatory failure envelope. |
| `PUT /contacts/{id}` | `PUT /contacts/c1` with `{"name":"Ada Lovelace","defaultMemo":"ref-7","defaultMemoType":"id"}` | `{"success":true,"data":{"id":"c1","name":"Ada Lovelace","address":"G...","tokenType":"XLM","defaultMemo":"ref-7","defaultMemoType":"id","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}}` | Edit modal; only the targeted contact's edit button is disabled while in-flight. Form values are preserved on failure so the user can retry. 404 becomes an explanatory failure envelope. |
| `DELETE /contacts/{id}` | `DELETE /contacts/c1` | `{"success":true,"data":{"message":"Contact deleted"}}` | Delete confirmation; only the targeted contact's delete button is disabled while in-flight. Contact remains in the list on failure with a per-card error message. 404 becomes an explanatory failure envelope. |

### Contact Local Export

The export is entirely client-side; no HTTP request is made and no contact data leaves the device. Clicking the **Export** button on the contacts page triggers a `application/json` browser download in the following format:

```json
{
  "format": "chenpilot-contacts-v1",
  "exportedAt": "2026-10-21T12:00:00.000Z",
  "contacts": [
    {
      "name": "Ada",
      "address": "G...",
      "tokenType": "XLM",
      "defaultMemo": "inv-42",
      "defaultMemoType": "text",
      "isFavorite": true,
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

Fields `defaultMemo`, `defaultMemoType`, and `isFavorite` are omitted when absent. Internal server-assigned fields (`id`, `updatedAt`) are never included. The `format` field is a version sentinel for future import support.

### Memo Preset Prefill (Payment Form)

When a contact with `defaultMemo` and a non-`none` `defaultMemoType` is selected in `SendPaymentForm`, those values are pre-filled into the memo fields. The user may edit or clear them before submitting. If a different contact is selected or the contact is cleared, the memo fields are reset to empty / `none`.
| `GET /contacts` | No body; bearer token when available. | `{"success":true,"data":[{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}]}` | Contacts page/send flow; wrappers handle 404 specially. |
| `POST /contacts` | `{"name":"Ada","address":"G...","tokenType":"XLM"}` | `{"success":true,"data":{"id":"c1","name":"Ada","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. |
| `PUT /contacts/{id}` | `PUT /contacts/c1` with `{"name":"Ada Lovelace"}` | `{"success":true,"data":{"id":"c1","name":"Ada Lovelace","address":"G...","tokenType":"XLM","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. Also used to toggle `isFavorite`; the client sends `{"isFavorite":true}` or `{"isFavorite":false}`. The flip is applied optimistically in Redux and reverted if the request fails. |
| `DELETE /contacts/{id}` | `DELETE /contacts/c1` | `{"success":true,"data":{"message":"Contact deleted"}}` | Same wrapper-only caveat; 404 becomes an explanatory failure envelope. The client uses a soft-delete / undo pattern: the contact is removed from the UI immediately (`softDeleteContact`) and the backend call (`commitDeleteContact`) is deferred by 5 s to allow undo. If the backend call fails the contact is automatically restored in Redux state and an error toast is shown. |

The contacts screen searches the complete loaded contact list and renders 24 matches per page. This is client-side pagination; the current contacts contract does not define page/limit parameters, so no paginated backend response is assumed.

### Contact Import (Client-Side Only)

The contacts screen supports importing contacts from a JSON file. Parsing, validation, and duplicate detection are performed entirely in the browser before any network calls are made. No new backend endpoint is required.

**Export format (version `"1"`):**

```json
{
  "version": "1",
  "exportedAt": "2026-01-01T00:00:00Z",
  "contacts": [
    { "name": "Alice", "address": "G...", "tokenType": "XLM", "note": "optional" }
  ]
}
```

The `version` field must be the string `"1"`. Files with any other value are rejected before preview.

**Import workflow:**
1. User selects a `.json` file. The client parses and classifies every row as `valid`, `invalid`, or `duplicate` (address already in the contact list).
2. A preview modal shows the classification of every row along with any validation errors for invalid rows.
3. Only `valid` rows are submitted. The user must confirm before any contact is persisted.
4. Each valid row is saved via `POST /contacts` individually. Any row-level failures are surfaced after the batch completes; successfully created contacts are kept.

**Row validation rules (client-side):**
- `name`: required, 2–50 characters.
- `address`: required, must pass the Stellar address regex (`/^G[A-Z0-9]{55}$/`). Address is normalised (trimmed and upper-cased) before storage.
- `tokenType`: required, must be one of `XLM | STRK | USDC | USDT | BTC | ETH | AQUA`.
- `note`: optional, max 280 characters.

A row is classified as `duplicate` when its normalised address matches an address already present in the loaded contact list. Duplicates are shown in the preview but are not imported.

The payment screen may use `data.nativeBalance` as the total native balance and `data.required` as the minimum required reserve. It displays spendable XLM as `max(0, nativeBalance - required)` only when both values are finite numbers; this is a display estimate, not a payment authorization guarantee. Reserve-related payment failures are translated when the backend message mentions a reserve or minimum/insufficient native balance. No stable backend error code is currently declared.

## Liquidity Endpoint

`LiquidityRequest` fields are optional: `includeInactive`, `limit`, `sortBy` (`liquidity | volume | apr`), and `sortOrder` (`asc | desc`). The UI polls this endpoint every 30 seconds and requests the ten highest-liquidity pools.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /liquidity` | `{"sortBy":"liquidity","sortOrder":"desc","limit":10}` | `{"success":true,"data":{"totalPools":1,"totalLiquidity":"100000","totalVolume24h":"5000","averageAPR":0.12,"activePools":1,"topPools":[],"networkMetrics":{"gasPrice":"1","blockNumber":123,"timestamp":"2026-01-01T00:00:00Z"}}}` | `LiquidityPoolStats` widget; errors show a generic inline message. |

`topPools` items use `LiquidityPool`: pool id/name, token1/token2 metadata, reserve and liquidity strings, APR, 24-hour volume, fee, active flag, and `created_at`.

## Payment Endpoint

`SendPaymentRequest` fields: `recipientAddress` (Stellar G-address, required), `amount` (string, required), `tokenType` (one of `XLM | USDC | USDT | BTC | ETH | AQUA`, required), `memo` (string, optional, max 28 chars), `memoType` (`none | text | id | hash`, optional), `recipientContactId` (string, optional).

The client normalises and validates the payload using `sendPaymentSchema` (Zod) before sending. The server is the authoritative gate for balance, authorisation, and duplicate-submission checks. Never rely on client-side validation as a security boundary.

| Endpoint | Request example | Success response example | UI surface / behavior |
| --- | --- | --- | --- |
| `POST /payments/send` | `{"recipientAddress":"G...","amount":"10","tokenType":"XLM","memoType":"text","memo":"rent"}` | `{"success":true,"data":{"transactionHash":"abc123","status":"success"}}` | Send page; shows a loading toast while in-flight, success toast with redirect to `/transactions` on success, or an error toast on failure. Payload logging and simulated delay have been removed — only the backend-confirmed result is surfaced to the user. |

Self-transfer behaviour: the client compares `recipientAddress` (normalised) against `state.auth.user.address` and surfaces a field-level warning with an acknowledgement checkbox. This is a UX guard only. The backend must independently decide whether to allow or reject self-transfers.

## Browser Security And CSP Reports

Next.js applies the security headers defined in [`src/security/securityHeaders.ts`](../src/security/securityHeaders.ts) to every route. The content security policy allows Google OAuth and font endpoints, Stellar Horizon, and API/socket origins configured by `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SOCKET_URL`.

Browsers can submit CSP violation reports to `POST /api/csp-report`. The endpoint accepts legacy `csp-report` and Reporting API `body` JSON, caps input at 16 KiB, and logs only the document URL, blocked URL, and violated directive. It does not require authentication because browsers send reports automatically. Production responses include HSTS; development responses omit HSTS and allow `unsafe-eval` for the development bundler. Review CSP reports when adding a browser integration, then add only its required origin to the policy.

- `POST /auth/refresh` | `{}`; cookies are included. | `{"token":"<new-jwt>"}` | Auth refresh thunk and automatic 401 refresh interceptor. Socket connections safely update authentication and reconnect once without leaking listeners or opening duplicate connections.

## SSR Safety And Browser-Global Guard Rules

This project targets Next.js App Router with server-side rendering. The following rules apply to any code in `src/config/`, `src/services/`, or `src/components/providers/` that may be imported by a server component or executed during prerendering.

**`window`, `localStorage`, `sessionStorage`, `navigator`, `document`** are browser-only globals. Accessing them at module initialisation time (outside a function body) will throw `ReferenceError` during SSR.

### Required patterns

| Situation | Correct pattern |
| --- | --- |
| Reading `localStorage` or `sessionStorage` in a service or slice | Wrap in `if (typeof window !== 'undefined')` |
| Reading `window.location` | Call `getHorizonProxyUrl()` or wrap inline access in a function; never read at module scope |
| Setting initial Redux state that depends on a browser global | Default to a static value (`false`, `null`, `''`); update via an action dispatched in `useEffect` after mount |
| Using browser APIs in a provider component | Place all access inside `useEffect`; keep the component's module-level code free of browser globals |
| Redirecting on 401 | `if (typeof window !== 'undefined') { window.location.href = '/auth/login'; }` |

### Specific decisions

- **`src/config/env.ts`** — `HORIZON_PROXY_URL` was removed from the frozen `env` object. Use `getHorizonProxyUrl()` (exported from the same file) whenever the full URL including origin is needed. The function is safe to call on both the server and the client.
- **`src/store/slices/chatSlice.ts`** — `isOnline` initial state is `false`. The real value is set after mount by `setOnlineStatus` (dispatched by `OfflineIndicator` listening to browser `online`/`offline` events). Do not read `navigator.onLine` in slice initialState.
- **`src/services/api.ts`** — all `localStorage`, `sessionStorage`, and `window.location` accesses are already wrapped in `typeof window !== 'undefined'` guards. The module-level singleton constructor is safe to execute on the server.
- **`src/components/providers/`** — all provider files carry `"use client"` and place every browser-API call inside `useEffect`. Do not remove these directives or hoist side effects out of `useEffect`.

## Malformed localStorage Payload Recovery

Persisted Redux state (chat history, offline queue, conversation list, auth credentials) can be stale, from an older schema version, or physically corrupt (truncated write, storage quota exceeded mid-write, manual editing). The client must never crash on hydration because of a bad payload.

### Recovery contract

For every `localStorage` key the client reads and parses:

1. **Parse failure** — catch the `SyntaxError`, call `logger.warn` with the key name only (never the raw value), call `localStorage.removeItem(<key>)`, and fall back to the declared empty default (`{}` for objects, `[]` for arrays).
2. **Schema mismatch** — if `JSON.parse` succeeds but the result is the wrong JS type (e.g. an array where a plain object is expected, or vice versa), treat it identically to a parse failure: log, remove only the bad key, fall back to the empty default.
3. **Scope** — only the key that failed is cleared. All other keys in `localStorage` are untouched.
4. **Diagnostics** — `logger.warn` is used (not `console.error`). The logger redacts values automatically; the message contains the key name and a description of the failure but never the stored payload or any credential.

### Keys and their expected schemas

| `localStorage` key | Expected schema | Declared empty default | Where parsed |
| --- | --- | --- | --- |
| `chat_history` | Plain object `{ [conversationId]: ChatMessage[] }` | `{}` | `initializeChatHistory` (chatSlice) |
| `conversations` | Array of `Conversation` objects | `[]` | `loadConversationsLocally`, `saveConversationLocally`, `deleteConversationLocally`, `addTag`, `removeTag` (chatSlice) |
| `messageQueue` | Array of `{ id, query, timestamp }` | `[]` | `loadMessageQueue` (chatSlice) |
| `user_data` | `User` object | unauthenticated state | `initializeAuth` (authSlice) |
| `auth_token` | Raw string (no JSON parse) | `null` in-memory token | `loadTokenFromStorage` (ApiService) — already safe, no parse step |

### `auth_token` and `user_data` interaction

`initializeAuth` reads both keys together. If `auth_token` is present but `user_data` is missing or malformed, both keys are cleared and the app recovers to the unauthenticated default state, routing the user to `/auth/login`. No partial auth state is left in Redux.

### Backend integration note

These recovery paths are entirely client-side and require no backend changes. The backend is not notified when a key is cleared. On the next successful login or registration the keys are rewritten with fresh values.
