import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/slices/authSlice';
import contactsReducer from '@/store/slices/contactsSlice';
import uiReducer from '@/store/slices/uiSlice';
import LoginForm from '@/components/auth/(login)/loginform';
import { SendPaymentForm } from '@/components/payment/SendPaymentForm';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/auth/login',
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock GoogleSignInButton to keep auth view isolated and deterministic
vi.mock('@/components/auth/GoogleSignIn', () => ({
  GoogleSignInButton: () => (
    <button type="button" aria-label="Sign in with Google">
      Sign in with Google
    </button>
  ),
}));

/**
 * Standard axe configuration for isolated component subtrees:
 * - 'region': Excluded because testing individual component views does not wrap them in
 *   top-level page landmarks (<header>, <main>, <footer>).
 * - 'color-contrast': Excluded in jsdom environment because jsdom does not calculate
 *   true layout geometries, cascade styles, and pixel rendering.
 */
const AXE_COMPONENT_RULES = {
  rules: {
    region: { enabled: false },
    'color-contrast': { enabled: false },
  },
};

const createMockStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      contacts: contactsReducer,
      ui: uiReducer,
    },
    preloadedState: {
      auth: {
        isAuthenticated: false,
        user: null,
        token: null,
        isLoading: false,
        error: null,
      },
      contacts: {
        list: [
          {
            id: 'c-1',
            name: 'Ada Lovelace',
            address: 'GBRPYHIL2CI3FNQ4AFIXFKVKGMWVDWDBCAGA6XVZZDAML7THV7CANUBB',
            tokenType: 'XLM' as const,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        isLoading: false,
        error: null,
        selectedContact: null,
      },
      ui: {
        sidebarOpen: true,
        darkMode: true,
        activeModal: null,
        notifications: [],
        retryStatus: null,
      },
    },
  });

describe('Automated Accessibility (a11y) Checks', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  describe('1. Auth View (LoginForm)', () => {
    it('has no serious or critical accessibility violations', async () => {
      const { container } = render(
        <Provider store={store}>
          <LoginForm />
        </Provider>
      );

      const results = await axe(container, AXE_COMPONENT_RULES);
      expect(results).toHaveNoViolations();
    });
  });

  describe('2. Dialog View (Modal)', () => {
    it('accessible modal dialog has proper aria-modal, role, labeledby, and no violations', async () => {
      const onClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={onClose} title="Security Confirmation">
          <div>
            <p className="text-sm text-gray-700">Please review the transaction details carefully.</p>
            <div className="mt-4 flex justify-end space-x-3">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button">
                Confirm
              </Button>
            </div>
          </div>
        </Modal>
      );

      const results = await axe(container, AXE_COMPONENT_RULES);
      expect(results).toHaveNoViolations();
    });
  });

  describe('3. Contacts View (Contact Form & Management Dialog)', () => {
    it('has no accessibility violations in contact creation and editing form controls', async () => {
      const { container } = render(
        <Modal isOpen={true} onClose={vi.fn()} title="Add New Contact">
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <Input
              id="contact-name"
              label="Contact Name"
              placeholder="e.g. Satoshi"
              required
            />
            <Input
              id="contact-address"
              label="Stellar Address"
              placeholder="G..."
              required
            />
            <div>
              <label
                htmlFor="contact-token-type"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Token Type
              </label>
              <select
                id="contact-token-type"
                defaultValue="XLM"
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm"
              >
                <option value="XLM">XLM</option>
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
              </select>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
              <Button type="submit">
                Save Contact
              </Button>
            </div>
          </form>
        </Modal>
      );

      const results = await axe(container, AXE_COMPONENT_RULES);
      expect(results).toHaveNoViolations();
    });
  });

  describe('4. Send View (SendPaymentForm)', () => {
    it('has no serious or critical accessibility violations in wallet send form', async () => {
      const mockContacts = [
        {
          id: 'c-1',
          name: 'Ada Lovelace',
          address: 'GBRPYHIL2CI3FNQ4AFIXFKVKGMWVDWDBCAGA6XVZZDAML7THV7CANUBB',
          tokenType: 'XLM' as const,
        },
      ];

      const { container } = render(
        <SendPaymentForm
          onSubmit={vi.fn()}
          contacts={mockContacts}
          isLoading={false}
          defaultTokenType="XLM"
        />
      );

      const results = await axe(container, AXE_COMPONENT_RULES);
      expect(results).toHaveNoViolations();
    });
  });
});
