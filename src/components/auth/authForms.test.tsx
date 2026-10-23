import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedAuthError } from '@/services/auth.service';

const { dispatch, push, toastError } = vi.hoisted(() => ({ dispatch: vi.fn(), push: vi.fn(), toastError: vi.fn() }));

vi.mock('@/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { isLoading: false } }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/components/auth/GoogleSignIn', () => ({ GoogleSignInButton: () => null }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: toastError } }));

import LoginForm from './(login)/loginform';
import { RegisterForm } from './(register)/registerForm';
import { GENERIC_AUTH_ERROR, GENERIC_REGISTER_ERROR } from '@/services/auth.service';

const PASSWORD = 'Correct-Horse-9!';

/** Make the next dispatched thunk reject `unwrap()` with this payload. */
const rejectWith = (payload: NormalizedAuthError | unknown) => {
  dispatch.mockReturnValueOnce({ unwrap: () => Promise.reject(payload) });
};

const fill = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('LoginForm server errors (#258, privacy-safe)', () => {
  beforeEach(() => {
    dispatch.mockReset();
    push.mockReset();
    toastError.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('never attaches server field errors that could reveal an account, and keeps the email', async () => {
    rejectWith({ message: 'Please correct the highlighted fields.', fieldErrors: { email: 'No account with this email' } });
    const { container } = render(<LoginForm />);

    fill(/Email Address/i, 'ada@example.test');
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(GENERIC_AUTH_ERROR));
    expect(container.textContent).not.toContain('No account with this email');
    const email = screen.getByLabelText(/Email Address/i) as HTMLInputElement;
    expect(email.value).toBe('ada@example.test');
    expect(push).not.toHaveBeenCalled();
  });

  it('clears the password and never shows it or the raw server message', async () => {
    rejectWith({
      message: 'Invalid credentials',
      response: { status: 401, data: { message: `Invalid password ${PASSWORD}` } },
    });
    const { container } = render(<LoginForm />);

    fill(/Email Address/i, 'ada@example.test');
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));

    await waitFor(() => expect((screen.getByLabelText(/^Password$/i) as HTMLInputElement).value).toBe(''));
    expect(container.textContent).not.toContain(PASSWORD);
    expect(toastError).toHaveBeenCalledWith(GENERIC_AUTH_ERROR);
    expect(JSON.stringify(toastError.mock.calls)).not.toContain('Invalid password');
  });
});

describe('RegisterForm server errors (#258, privacy-safe)', () => {
  beforeEach(() => {
    dispatch.mockReset();
    push.mockReset();
    toastError.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows safe field errors, hides account-existence ones, and retains name and email', async () => {
    rejectWith({
      message: 'Please correct the highlighted fields.',
      fieldErrors: { email: 'Email is already registered', name: 'Name contains invalid characters' },
    });
    const { container } = render(<RegisterForm />);

    fill(/Full Name/i, 'Ada Lovelace');
    fill(/Email Address/i, 'ada@example.test');
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    expect(await screen.findByText('Name contains invalid characters')).toBeInTheDocument();
    expect(container.textContent).not.toContain('Email is already registered');
    expect(toastError).toHaveBeenCalledWith(GENERIC_REGISTER_ERROR);
    expect((screen.getByLabelText(/Email Address/i) as HTMLInputElement).value).toBe('ada@example.test');
    expect((screen.getByLabelText(/Full Name/i) as HTMLInputElement).value).toBe('Ada Lovelace');
    expect((screen.getByLabelText(/^Password$/i) as HTMLInputElement).value).toBe('');
  });

  it('hides account-existence wording even on non-email fields', async () => {
    rejectWith({ message: 'x', fieldErrors: { name: 'Duplicate account for this name' } });
    const { container } = render(<RegisterForm />);

    fill(/Full Name/i, 'Ada Lovelace');
    fill(/Email Address/i, 'ada@example.test');
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(GENERIC_REGISTER_ERROR));
    expect(container.textContent).not.toContain('Duplicate account');
  });
});
