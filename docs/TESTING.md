# Testing

This project uses Vitest with `jsdom` and Testing Library. The configuration is in [`vitest.config.ts`](../vitest.config.ts); [`src/test/setup.ts`](../src/test/setup.ts) loads `@testing-library/jest-dom` matchers.

## Commands

Run the full suite once:

```bash
pnpm test
```

Keep Vitest running and rerun affected tests as files change:

```bash
pnpm test:watch
```

Run the suite and print a V8 coverage report (also written to `coverage/`):

```bash
pnpm test:coverage
```

Pass a file path after `--` to run a focused test, for example:

```bash
pnpm test -- src/utils/passwordStrength.test.ts
```

## Placement And Naming

Vitest includes `src/**/*.test.ts` and `src/**/*.test.tsx` only. Put a test beside its implementation for a small, focused module, or group related tests in a local `__tests__` directory. Use `.test.ts` for non-React unit tests and `.test.tsx` for tests that render JSX. Existing examples include `src/utils/passwordStrength.test.ts`, `src/store/slices/chatSlice.test.ts`, and `src/components/ui/EmptyState.test.tsx`.

## Environment And Mocks

The default environment is `jsdom`, including for non-UI tests. That provides browser globals for components and code using browser APIs. For a test file that specifically needs Node rather than a DOM, put this directive at the top of the file:

```ts
// @vitest-environment node
```

Vitest globals (`describe`, `it`, `expect`, and lifecycle hooks) are enabled; explicit imports from `vitest` are also used in this repository and are preferred in new examples for clarity. Use `vi.mock()` at module scope to replace network services or other external dependencies, and `vi.fn()` for controllable functions. Reset mock call history in `beforeEach` with `vi.clearAllMocks()`. Avoid mocking the reducer or component under test. If a test changes environment variables, restore them after the test (or use Vitest's environment stubbing and undo it) so the next test is isolated.

## Slice Test Example

Create `src/store/slices/authSlice.test.ts` to exercise the reducer and a public action without involving a configured store or network:

```ts
import { describe, expect, it } from 'vitest';
import authReducer, { setToken } from './authSlice';

describe('authSlice', () => {
  it('stores a token and marks the user authenticated', () => {
    const state = authReducer(undefined, setToken('test-token'));

    expect(state.token).toBe('test-token');
    expect(state.isAuthenticated).toBe(true);
  });
});
```

## Component Test Example

Create `src/components/ui/EmptyState.test.tsx` to verify rendered content and a user action. Testing Library's `screen` queries roles and accessible names, while `fireEvent` triggers the button in this minimal example:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders its title and invokes its primary action', () => {
    const onClick = vi.fn();

    render(
      <EmptyState
        title="Nothing here"
        description="There are no items yet."
        action={{ label: 'Refresh', onClick }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

Run either example directly with `pnpm test -- <path-to-test>` or run all tests with `pnpm test`.