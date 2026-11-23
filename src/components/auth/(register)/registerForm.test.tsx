/**
 * Tests for RegisterForm privacy-safe error handling.
 *
 * Verifies that no account-existence information (email already taken, etc.)
 * leaks through the toast shown after a failed registration attempt.
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

vi.mock('@/components/auth/(register)/passwordStrengthMeter', () => ({
  PasswordStrengthMeter: () => <div data-testid="strength-meter" />,
}));

import { RegisterForm } from './registerForm';
import { GENERIC_REGISTER_ERROR } from '@/services/auth.service';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm() {
  return render(<RegisterForm />);
}

async function fillAndSubmit(email: string, password: string, name?: string) {
  renderForm();
  if (name) {
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: name } });
  }
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: password } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RegisterForm — privacy-safe error messages', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders the create account button', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /create account/i })).toBeDefined();
  });

  it('shows the generic error when the thunk rejects with "email already taken"', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.reject(new Error('Email already taken')),
    });

    await fillAndSubmit('taken@example.com', 'Password1!', 'Ada');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(GENERIC_REGISTER_ERROR);
    });
  });

  it('shows the generic error on HTTP 409 conflict (email exists)', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          response: { status: 409, data: { message: 'Email already in use' } },
        }),
    });

    await fillAndSubmit('taken@example.com', 'Password1!', 'Ada');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(GENERIC_REGISTER_ERROR);
    });
  });

  it('shows the generic error on a server error (no detail leak)', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.reject(new Error('Internal server error')),
    });

    await fillAndSubmit('new@example.com', 'Password1!', 'Ada');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(GENERIC_REGISTER_ERROR);
    });
  });

  it('does NOT reveal that the email is already registered', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.reject(new Error('Email already registered')),
    });

    await fillAndSubmit('taken@example.com', 'Password1!', 'Ada');

    await waitFor(() => {
      const [msg] = mockToastError.mock.calls[0];
      expect(String(msg)).not.toMatch(/already|taken|registered|exists|duplicate/i);
    });
  });

  it('redirects to /chat on successful registration', async () => {
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({}) });

    await fillAndSubmit('new@example.com', 'Password1!', 'Ada');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/chat');
    });
  });

  it('shows field-level validation for weak password without calling thunk', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'valid@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'weak' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });

    await waitFor(() => {
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });
});
