import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatch, push, toastMock } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  push: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { isLoading: false } }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/components/auth/GoogleSignIn', () => ({ GoogleSignInButton: () => null }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));

import LoginForm from './(login)/loginform';
import { GENERIC_AUTH_ERROR } from '@/services/auth.service';
import { SILENT_TOAST } from '@/components/ui/LiveAnnouncer';

const announcer = () => screen.getByTestId('live-announcer');
const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'ada@example.test' } });
  fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password1' } });
  fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));
};

describe('LoginForm status announcements (#307)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('announces pending then success', async () => {
    let finish: () => void = () => {};
    dispatch.mockReturnValue({ unwrap: () => new Promise<void>((resolve) => { finish = resolve; }) });
    render(<LoginForm />);

    fillAndSubmit();
    await waitFor(() => expect(announcer()).toHaveTextContent('Signing in…'));

    await act(async () => finish());
    await waitFor(() => expect(announcer()).toHaveTextContent('Signed in.'));
  });

  it('announces the generic error assertively and keeps the toast silent', async () => {
    dispatch.mockReturnValue({ unwrap: () => Promise.reject({ response: { status: 401 } }) });
    render(<LoginForm />);

    fillAndSubmit();

    await waitFor(() => expect(announcer()).toHaveTextContent(GENERIC_AUTH_ERROR));
    expect(announcer()).toHaveAttribute('role', 'alert');
    expect(toastMock.error).toHaveBeenCalledWith(GENERIC_AUTH_ERROR, SILENT_TOAST);
  });
});
