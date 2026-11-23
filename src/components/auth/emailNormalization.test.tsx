import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatch, push, login, register } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  push: vi.fn(),
  login: vi.fn((payload: unknown) => ({ type: 'auth/login', payload })),
  register: vi.fn((payload: unknown) => ({ type: 'auth/register', payload })),
}));

vi.mock('@/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { isLoading: false } }),
}));
vi.mock('@/store/slices/authSlice', () => ({ login, register }));
vi.mock('@/services/api', () => ({ default: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/components/auth/GoogleSignIn', () => ({ GoogleSignInButton: () => null }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import LoginForm from './(login)/loginform';
import { RegisterForm } from './(register)/registerForm';

const TYPED_EMAIL = '  Ada.Lovelace@Example.COM ';
const PASSWORD = ' Correct-Horse-9 ';
const fill = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('auth forms send normalized emails (#259)', () => {
  beforeEach(() => {
    dispatch.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({}) });
    login.mockClear();
    register.mockClear();
  });

  it('login sends the trimmed, lowercased email and the password unchanged', async () => {
    render(<LoginForm />);
    fill(/Email Address/i, TYPED_EMAIL);
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));

    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(login).toHaveBeenCalledWith({ email: 'ada.lovelace@example.com', password: PASSWORD });
  });

  it('register uses the same normalization', async () => {
    render(<RegisterForm />);
    fill(/Full Name/i, 'Ada Lovelace');
    fill(/Email Address/i, TYPED_EMAIL);
    fill(/^Password$/i, 'Correct-Horse-9');
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register.mock.calls[0][0]).toMatchObject({ email: 'ada.lovelace@example.com', password: 'Correct-Horse-9' });
  });

  it('keeps the email field showing what the user typed', async () => {
    dispatch.mockReturnValue({ unwrap: () => Promise.reject({ response: { status: 503 }, message: 'down' }) });
    render(<LoginForm />);
    fill(/Email Address/i, TYPED_EMAIL);
    fill(/^Password$/i, PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));

    await waitFor(() => expect(login).toHaveBeenCalled());
    expect((screen.getByLabelText(/Email Address/i) as HTMLInputElement).value).toBe(TYPED_EMAIL);
  });
});
