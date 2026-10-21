import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedAuthError } from '@/services/auth.service';

const { dispatch, push } = vi.hoisted(() => ({ dispatch: vi.fn(), push: vi.fn() }));

vi.mock('@/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { isLoading: false } }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/components/auth/GoogleSignIn', () => ({ GoogleSignInButton: () => null }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import LoginForm from './(login)/loginform';
import { RegisterForm } from './(register)/registerForm';

const PASSWORD = 'Correct-Horse-9!';

/** Make the next dispatched thunk reject `unwrap()` with this payload. */
const rejectWith = (payload: NormalizedAuthError | unknown) => {
  dispatch.mockReturnValueOnce({ unwrap: () => Promise.reject(payload) });
};

const fill = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('LoginForm server validation errors (#258)', () => {
  beforeEach(() => {
    dispatch.mockReset();
    push.mockReset();
  });

  it('attaches server field errors to inputs and keeps the email', async () => {
    rejectWith({ message: 'Please correct the highlighted fields.', fieldErrors: { email: 'No account with this email' } });
    render(<LoginForm />);

    fill(/Email Address/i, 'ada@example.test');
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));

    expect(await screen.findByText('No account with this email')).toBeInTheDocument();
    const email = screen.getByLabelText(/Email Address/i) as HTMLInputElement;
    expect(email.value).toBe('ada@example.test');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(push).not.toHaveBeenCalled();
  });

  it('clears the password and never shows it in error text', async () => {
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
    expect(screen.getByText(/Invalid password ••••••/)).toBeInTheDocument();
  });

  it('shows a form-level message when no field matches', async () => {
    rejectWith({ message: 'Account locked. Try again later.', fieldErrors: {} });
    render(<LoginForm />);

    fill(/Email Address/i, 'ada@example.test');
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));

    expect(await screen.findByText('Account locked. Try again later.')).toBeInTheDocument();
  });
});

describe('RegisterForm server validation errors (#258)', () => {
  beforeEach(() => {
    dispatch.mockReset();
    push.mockReset();
  });

  it('maps several field errors and retains name and email', async () => {
    rejectWith({
      message: 'Please correct the highlighted fields.',
      fieldErrors: { email: 'Email is already registered', name: 'Name contains invalid characters' },
    });
    render(<RegisterForm />);

    fill(/Full Name|Name/i, 'Ada Lovelace');
    fill(/Email Address/i, 'ada@example.test');
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Create Account|Sign Up|Get Started/i }));

    expect(await screen.findByText('Email is already registered')).toBeInTheDocument();
    expect(screen.getByText('Name contains invalid characters')).toBeInTheDocument();
    expect((screen.getByLabelText(/Email Address/i) as HTMLInputElement).value).toBe('ada@example.test');
    expect((screen.getByLabelText(/Full Name|Name/i) as HTMLInputElement).value).toBe('Ada Lovelace');
    expect((screen.getByLabelText(/^Password$/i) as HTMLInputElement).value).toBe('');
  });
});
