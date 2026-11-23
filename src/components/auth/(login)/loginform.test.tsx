/**
 * Tests for LoginForm privacy-safe error handling.
 *
 * Verifies that no account-existence information leaks through the toast
 * shown after a failed login attempt, regardless of what the backend returns.
 */
import { cleanup, render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn();
const mockPush = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('@/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => ({ isLoading: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock('@/components/auth/GoogleSignIn', () => ({
  GoogleSignInButton: () => <button type="button">Google</button>,
}));

import LoginForm from './loginform';
import { GENERIC_AUTH_ERROR } from '@/services/auth.service';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm() {
  return render(<LoginForm />);
}

async function fillAndSubmit(email: string, password: string) {
  renderForm();
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: password } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginForm — privacy-safe error messages', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders the sign-in button', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
  });

  it('shows the generic error when the thunk rejects with "user not found"', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.reject(new Error('User not found')),
    });

    await fillAndSubmit('test@example.com', 'Password1');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(GENERIC_AUTH_ERROR);
    });
  });

  it('shows the generic error when the thunk rejects with "invalid credentials"', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.reject(new Error('Invalid credentials')),
    });

    await fillAndSubmit('test@example.com', 'Password1');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(GENERIC_AUTH_ERROR);
    });
  });

  it('shows the generic error on HTTP 401', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.reject({ response: { status: 401, data: { message: 'Unauthorized' } } }),
    });

    await fillAndSubmit('test@example.com', 'Password1');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(GENERIC_AUTH_ERROR);
    });
  });

  it('shows the generic error on network failure (no enumeration leak)', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.reject({ message: 'Network Error' }),
    });

    await fillAndSubmit('test@example.com', 'Password1');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(GENERIC_AUTH_ERROR);
    });
  });

  it('does NOT reveal account-existence information in the toast message', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.reject(new Error('User not found')),
    });

    await fillAndSubmit('test@example.com', 'Password1');

    await waitFor(() => {
      const [msg] = mockToastError.mock.calls[0];
      expect(String(msg)).not.toMatch(/not found|does not exist|no account/i);
    });
  });

  it('redirects to /chat on successful login', async () => {
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({}) });

    await fillAndSubmit('test@example.com', 'Password1');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/chat');
    });
  });

  it('shows field-level validation error for invalid email without calling thunk', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Password1' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    });

    // Zod validation fires before the thunk
    await waitFor(() => {
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });
});
