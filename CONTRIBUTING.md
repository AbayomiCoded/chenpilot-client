# Contributing to Chenpilot Client

Thank you for contributing to Chenpilot Client! This document outlines our development workflows, code standards, and decision-recording conventions.

---

## Architectural Decision Records (ADRs)

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

## Development Workflow

1. **Branching**: Create a feature branch off main/build (e.g., `feat/my-feature` or `fix/issue-description`).
2. **Code Style & Linting**: Run `npm run lint` before committing code changes. Ensure TypeScript types are exact.
3. **Testing**: Run `npm run test` to verify unit and integration tests pass.

# Contributing to Chenpilot Client

Thank you for your interest in contributing to **Chenpilot Client (`gear5labs/chenpilot-client`)**! We appreciate bug reports, feature proposals, documentation improvements, and pull requests from the community.

---

## 1. Local Development Setup & Commands

Ensure you have Node.js (v18+) and **pnpm** installed on your system.

1. **Clone the repository and install dependencies:**
   ```bash
   git clone [https://github.com/gear5labs/chenpilot-client.git](https://github.com/gear5labs/chenpilot-client.git)
   cd chenpilot-client
   pnpm install