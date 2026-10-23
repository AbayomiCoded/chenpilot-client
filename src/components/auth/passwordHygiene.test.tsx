import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isTerminalAuthError, useClearPasswordOnLeave } from './passwordHygiene';

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
const rejectWith = (error: unknown) => dispatch.mockReturnValueOnce({ unwrap: () => Promise.reject(error) });
const fill = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const passwordInput = () => screen.getByLabelText(/^Password$/i) as HTMLInputElement;
const emailInput = () => screen.getByLabelText(/Email Address/i) as HTMLInputElement;

const firePageShow = (persisted: boolean) => {
  const event = new Event('pageshow') as PageTransitionEvent;
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
};

describe('isTerminalAuthError (#253)', () => {
  it.each([
    [{ response: { status: 400 } }, true],
    [{ response: { status: 401 } }, true],
    [{ response: { status: 422 } }, true],
    [{ response: { status: 408 } }, false],
    [{ response: { status: 429 } }, false],
    [{ response: { status: 503 } }, false],
    [{ code: 'ERR_NETWORK', message: 'Network Error' }, false],
    [{ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' }, false],
    [new Error('Invalid credentials'), true],
    [undefined, true],
  ])('%j → %s', (error, expected) => {
    expect(isTerminalAuthError(error)).toBe(expected);
  });
});

describe('useClearPasswordOnLeave (#253)', () => {
  it('clears on pagehide, on bfcache restore and on unmount, but not on a normal pageshow', () => {
    const clear = vi.fn();
    const { unmount } = renderHook(() => useClearPasswordOnLeave(clear));

    window.dispatchEvent(new Event('pagehide'));
    expect(clear).toHaveBeenCalledTimes(1);

    firePageShow(false);
    expect(clear).toHaveBeenCalledTimes(1);

    firePageShow(true);
    expect(clear).toHaveBeenCalledTimes(2);

    unmount();
    expect(clear).toHaveBeenCalledTimes(3);

    window.dispatchEvent(new Event('pagehide'));
    expect(clear).toHaveBeenCalledTimes(3);
  });
});

describe('LoginForm password retention (#253)', () => {
  beforeEach(() => {
    dispatch.mockReset();
    push.mockReset();
  });

  it('clears the password and keeps the email after a terminal error', async () => {
    rejectWith({ message: 'Invalid credentials', response: { status: 401 } });
    render(<LoginForm />);

    fill(/Email Address/i, 'ada@example.test');
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));

    await waitFor(() => expect(passwordInput().value).toBe(''));
    expect(emailInput().value).toBe('ada@example.test');
    expect(document.activeElement).toBe(passwordInput());
  });

  it('keeps the password after a transient network error so the user can resubmit', async () => {
    rejectWith({ code: 'ERR_NETWORK', message: 'Network Error' });
    render(<LoginForm />);

    fill(/Email Address/i, 'ada@example.test');
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));

    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    await act(async () => {});
    expect(passwordInput().value).toBe(PASSWORD);
  });

  it('clears the password when the page is hidden or restored from bfcache', () => {
    render(<LoginForm />);
    fill(/Email Address/i, 'ada@example.test');
    fill(/^Password$/i, PASSWORD);

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(passwordInput().value).toBe('');
    expect(emailInput().value).toBe('ada@example.test');

    fill(/^Password$/i, PASSWORD);
    act(() => firePageShow(true));
    expect(passwordInput().value).toBe('');
  });

  it('keeps password-manager autocomplete enabled', () => {
    render(<LoginForm />);
    expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password');
    expect(emailInput()).toHaveAttribute('autocomplete', 'email');
  });
});

describe('RegisterForm password retention (#253)', () => {
  beforeEach(() => {
    dispatch.mockReset();
  });

  it('clears the password and keeps name and email after a terminal error', async () => {
    rejectWith({ message: 'Email already registered', response: { status: 409 } });
    render(<RegisterForm />);

    fill(/Full Name/i, 'Ada Lovelace');
    fill(/Email Address/i, 'ada@example.test');
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(passwordInput().value).toBe(''));
    expect(emailInput().value).toBe('ada@example.test');
    expect((screen.getByLabelText(/Full Name/i) as HTMLInputElement).value).toBe('Ada Lovelace');
    expect(passwordInput()).toHaveAttribute('autocomplete', 'new-password');
  });
});
