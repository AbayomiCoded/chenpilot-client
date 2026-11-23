# Contributing to Chenpilot Client

Thank you for your interest in contributing to **Chenpilot Client (`gear5labs/chenpilot-client`)**! We welcome bug reports, feature proposals, documentation improvements, and pull requests from the community.

This document outlines development workflows, architectural conventions, quality standards, and our **Contributor Checklist for Wallet Flows**.

---

## 1. Local Development Setup & Commands

Ensure you have **Node.js (v20+)** and **pnpm (v9+)** installed on your system.

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/gear5labs/chenpilot-client.git
   cd chenpilot-client
   pnpm install
   ```

2. **Available Commands (Aligned with CI):**
   - `pnpm dev`: Start local development server with Turbopack on port 3000.
   - `pnpm lint`: Run ESLint across all TypeScript and JavaScript files.
   - `pnpm lint:fix`: Automatically fix formatting and lint errors.
   - `pnpm typecheck`: Run TypeScript compiler (`tsc --noEmit`) to verify types.
   - `pnpm test`: Run Vitest unit and service contract test suites.
   - `pnpm test:watch`: Run tests in watch mode.
   - `pnpm test:coverage`: Run unit tests and generate V8 coverage reports.
   - `pnpm test:a11y`: Run automated accessibility checks (`vitest-axe` + `axe-core`).
   - `pnpm test:e2e`: Run isolated Playwright end-to-end tests for wallet-critical paths.
   - `pnpm build`: Validate types and build production Next.js bundle.

---

## 2. Wallet Flow Contributor Checklist

When modifying, adding, or refactoring wallet flows (such as authentication, sending payments, managing contacts, funding, and transaction review), contributors must complete this checklist prior to submitting a pull request:

### A. Transaction Review UX
- [ ] **Recipient Clarity**: Clearly show the recipient address with accessible truncation and one-click copy capability.
- [ ] **Asset & Network Indication**: Explicitly display the token symbol (e.g. `XLM`, `USDC`) and a visible network badge (e.g. `Testnet`).
- [ ] **Fee & Total Cost Disclosure**: Display estimated network transaction fees and the total amount before user confirmation.
- [ ] **Confirmation Step**: Always provide a review dialog or confirmation modal (`role="dialog"`, `aria-modal="true"`) prior to transaction signing or broadcast.
- [ ] **Input State & Error Recovery**: In case of network failure or backend error (e.g., HTTP 429 or 503), display actionable inline errors/toasts and **preserve user input** without resetting the form.

### B. Testnet-Only Test Data Practices
- [ ] **Zero Mainnet Secrets**: **NEVER** use, commit, or prompt for mainnet credentials, secret keys (starts with `S...`), seed phrases, or private keys.
- [ ] **Public Testnet Addresses**: Only use public Stellar Testnet addresses (`G...`) in tests, documentation, and mock fixtures.
- [ ] **Deterministic Mocks**: In automated unit and E2E tests, intercept network calls (`vi.mock('axios')` or Playwright `page.route()`) rather than communicating with live production systems.
- [ ] Refer to [`SECURITY.md`](SECURITY.md) for our full vulnerability reporting policy and secret-handling rules.

### C. Precision & Numerical Handling
- [ ] **7-Decimal Precision**: Stellar Lumens (XLM) and Soroban token balances support up to 7 decimal places (1 stroop = `0.0000001` XLM).
- [ ] **No Floating-Point Arithmetic**: Never use native JavaScript floating-point calculations for financial amounts (e.g. `0.1 + 0.2`).
- [ ] **String/Fixed-Point Representations**: Store and transmit token values as strings (e.g., `'10.5000000'`) or scaled integers (stroops / BigInt).
- [ ] **Schema Validation**: Ensure all amount inputs pass `tokenAmountSchema` (`SECURITY_VALIDATION.AMOUNT_REGEX`).

### D. API Contract Updates
- [ ] **Update Contract Docs**: When introducing or updating service endpoints, update [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) with paths, request/response shapes, headers, status codes, and error envelopes.
- [ ] **Envelopes**: Respect `ApiResponse<T>` (`{ success: true, data: T }` or `{ success: false, status: number, message: string }`).
- [ ] **Add Focused Tests**: Add or update contract tests in [`src/services/__tests__/apiContracts.test.ts`](src/services/__tests__/apiContracts.test.ts).

### E. Quality & Review Requirements
- [ ] Verify accessibility passes without serious or critical violations: `pnpm test:a11y`.
- [ ] Verify unit and contract tests pass: `pnpm test`.
- [ ] Verify E2E suite passes: `pnpm test:e2e`.
- [ ] Verify typecheck passes: `pnpm typecheck`.

---

## 3. Architectural Decision Records (ADRs)

We record significant architectural choices, technical decisions, and technology stack changes using **Architectural Decision Records (ADRs)** located in [`docs/adr/`](docs/adr/).

### When a New ADR is Required
You MUST submit a new ADR PR when proposing or implementing:
1. **New Core Dependencies or Frameworks**: Adding or replacing major dependencies (e.g., state management libraries, HTTP clients, UI component libraries, real-time transport protocol changes).
2. **Structural / Architectural Changes**: Modifying application layout routing conventions, state flow patterns, authorization/session management, or network layer interceptor pipelines.
3. **Cross-Cutting Concerns**: Introducing broad conventions that affect all components (e.g., logging standards, security headers, error handling strategies, retry behaviors).
4. **Deprecations & Replacements**: Deprecating existing protocols, tools, or major architectural decisions.

### How to Create an ADR
1. Copy the template from [`docs/adr/0000-template.md`](docs/adr/0000-template.md) to a new file in `docs/adr/` using the format `NNNN-short-title.md` (e.g. `docs/adr/0006-my-decision.md`).
2. Fill out all sections: Title, Status, Date, Authors, Context, Decision, Consequences, and Implementation Details (including links to relevant code files).
3. Submit the ADR alongside your feature or refactoring Pull Request for maintainer review.

---

## 4. Relevant Documentation Links
## Development Workflow

1. **Branching**: Create a feature branch off main/build (e.g., `feat/my-feature` or `fix/issue-description`).
2. **Code Style & Linting**: Run `pnpm lint` before committing code changes. Ensure TypeScript types are exact.
3. **Testing**: Run `pnpm test` to verify unit and integration tests pass.

---

## Quality Checklist for User-Impacting Changes

When submitting PRs that affect user-facing functionality, ensure the following:

- **Transaction Safety**: Async operations handle errors gracefully; state updates are atomic to prevent data loss.
- **Data Persistence**: Any changes to stored data are tested and backward-compatible.
- **API Compatibility**: Document backend API contract requirements in `docs/API_CONTRACT.md`. Include secret handling notes if credentials are involved.
- **Accessibility**: UI changes are tested with keyboard navigation and screen readers per WCAG guidelines.
- **Tests**: Add or update tests for all behavior changes; documentation-only changes are exempt.

# Contributing to Chenpilot Client

Thank you for your interest in contributing to **Chenpilot Client (`gear5labs/chenpilot-client`)**! We appreciate bug reports, feature proposals, documentation improvements, and pull requests from the community.

---

## 1. Local Development Setup & Commands

Ensure you have Node.js (v18+) and **pnpm** installed on your system.

- [Testing Guide (`docs/TESTING.md`)](docs/TESTING.md)
- [Backend API Contract (`docs/API_CONTRACT.md`)](docs/API_CONTRACT.md)
- [Security Policy (`SECURITY.md`)](SECURITY.md)
- [Architecture Overview (`ARCHITECTURE.md`)](ARCHITECTURE.md)