import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatch, setTheme } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  setTheme: vi.fn((mode: string) => ({ type: 'ui/setTheme', payload: mode })),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (select: (s: unknown) => unknown) =>
    select({
      auth: { isAuthenticated: true, user: { name: 'Ada', email: 'ada@example.test', authProvider: 'email' }, isLoading: false },
      ui: { mode: 'dark', language: 'en', translationLanguage: null },
    }),
}));
vi.mock('@/store/slices/authSlice', () => ({ fetchProfile: vi.fn(() => ({ type: 'auth/fetchProfile' })), logout: vi.fn() }));
vi.mock('@/store/slices/uiSlice', () => ({ setLanguage: vi.fn(), setTheme, setTranslationLanguage: vi.fn() }));
vi.mock('@/components/layout/ChatLayout', () => ({ ChatLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
// Sections that talk to the network are covered by their own tests
vi.mock('@/components/settings/MfaSettingsSection', () => ({ MfaSettingsSection: () => null }));
vi.mock('@/components/settings/DangerZone', () => ({ DangerZone: () => null }));
vi.mock('@/components/settings/SignInActivity', () => ({ SignInActivity: () => null }));
vi.mock('@/components/settings/NotificationPreferencesSection', () => ({ NotificationPreferencesSection: () => null }));
vi.mock('@/components/settings/NotificationPermissionStatus', () => ({ NotificationPermissionStatus: () => null }));
vi.mock('@/components/dashboard/TrustlinesPanel', () => ({ TrustlinesPanel: () => <div>Trustlines</div> }));
vi.mock('@/components/wallet/StellarNetworkBadge', () => ({ StellarNetworkBadge: () => null }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import SettingsPage from './page';
import { SETTINGS_SECTIONS } from '@/components/settings/SettingsSectionNav';

describe('settings sections (#300)', () => {
  beforeEach(() => {
    dispatch.mockReset();
    setTheme.mockClear();
  });

  it('has a navigation link for every section, each pointing at a real section', () => {
    const { container } = render(<SettingsPage />);
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });

    for (const section of SETTINGS_SECTIONS) {
      const link = within(nav).getByRole('link', { name: section.label });
      expect(link).toHaveAttribute('href', `#${section.id}`);
      const target = container.querySelector(`section#${section.id}`);
      expect(target, section.id).not.toBeNull();
      expect(target).toHaveAccessibleName(section.label);
    }
  });

  it('keeps profile, appearance, notification and security controls in separate sections', () => {
    const { container } = render(<SettingsPage />);
    expect(container.querySelector('#settings-profile')?.textContent).toContain('Wallet Address');
    expect(container.querySelector('#settings-appearance')?.textContent).toMatch(/Theme/);
    expect(container.querySelector('#settings-security')?.textContent).toMatch(/Change Password/);
    expect(container.querySelector('#settings-profile')?.textContent).not.toMatch(/Change Password/);
  });

  it('theme buttons persist the choice instead of doing nothing', () => {
    render(<SettingsPage />);
    const light = screen.getByRole('button', { name: 'Light' });
    expect(light).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(light);
    expect(setTheme).toHaveBeenCalledWith('light');
    expect(dispatch).toHaveBeenCalledWith({ type: 'ui/setTheme', payload: 'light' });
  });

  it('labels read-only profile fields as unavailable', () => {
    render(<SettingsPage />);
    expect(screen.getAllByText("Managed by your account. Editing isn't available here yet.")).toHaveLength(2);
  });
});
