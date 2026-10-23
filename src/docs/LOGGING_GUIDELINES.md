# Contributor Logging Guidelines (#924)

## High-Cardinality & Sensitive Data Protection

To avoid ballooning log ingestion costs, degrading query performance, and leaking sensitive user information, all logging in **Prompt Hash Stellar** must follow these strict rules:

### 1. Never Log Raw User Inputs or Secrets
- **Forbidden Fields:** Passwords, JWT/OAuth tokens, Stellar secret keys (`S...`), private keys, raw prompt text payloads, user emails.
- Use `logger` from `@/utils/logger`. The logger automatically redacts sensitive keys and replaces them with `[REDACTED, hash_xxxx]`.

### 2. Use Safe Correlation IDs for Debuggability
- Instead of logging high-cardinality user identifiers (such as full raw prompt strings or email addresses), generate or use a safe correlation ID:
  ```typescript
  import { generateCorrelationId, hashValue } from '@/utils/logger';

  const correlationId = generateCorrelationId('prompt_pub');
  const safePromptHash = hashValue(rawPromptText);

  logger.info(`Processing prompt publishing transaction`, { correlationId, promptHash: safePromptHash });
  ```

### 3. Automatic Truncation & Classification
- Long user strings (>120 characters) are automatically truncated with length metadata and deterministic SHA hashes.
- Debug logs (`logger.debug`) are only printed in `development` and `test` environments.

### 4. Agent Prompt & Response Content (#273)
Agent queries and replies can contain private wallet context (balances, addresses, transfer intents), so they are **not logged by default** in any environment.

- `agentService.queryAgent` logs only correlation metadata:
  - request: `correlationId`, `userHash`, `queryLength`, `queryHash`
  - response: `correlationId`, `status`, `success`, `durationMs`, `responseLength`, `responseHash`
  - failure: `correlationId`, `durationMs`, `message`, `code`, `status`, `method`, `url`
- The same `correlationId` (`agent_query_<ts>_<rand>`) appears on the request, response and failure entries for one query. It is client-side only and is **not** sent to the backend; propagating it as a request header would need backend/CORS support first.
- Errors are reduced with `describeAgentError` before logging. Never pass a raw Axios error to a logger: it carries `config.data` (the request body, including the prompt) and `response.data`.
- User ids in agent URLs (`/memory/:userId`) are logged as `/memory/[user]`.
- The logger redacts these content keys (exact match, case-insensitive, `-`/`_` ignored) as `[REDACTED_CONTENT, len=N, hash_xxxx]`: `query`, `prompt`, `response`, `responseData`, `data`, `content`, `memory`, `executionTrace`. Metadata keys such as `queryLength` or `responseHash` are left untouched.
- To debug content locally, opt in with `NEXT_PUBLIC_LOG_AGENT_CONTENT=true`. This is ignored when `NODE_ENV=production`.

### 5. Verification & Testing
- Run `npm test` or `npx vitest run src/utils/__tests__/logger.test.ts` to verify log sanitization and correlation ID security.
- Run `npx vitest run src/services/__tests__/agentServiceLogging.test.ts` to verify agent prompt/response redaction.
