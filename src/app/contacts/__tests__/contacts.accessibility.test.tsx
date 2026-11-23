/**
 * Focused accessibility tests for the Contacts page search field.
 *
 * Covers:
 *  - Accessible label for the search input
 *  - Live-region announces result count when search changes
 *  - Live-region is silent when there is no active search
 *  - Empty-state text is still rendered after a no-results search
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// ── Minimal stub reducers ────────────────────────────────────────────────────
// We don't need the full store for these UI-only tests.

const mockContact = (overrides = {}) => ({
  id: '1',
  name: 'Alice',
  address: 'GALICEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  tokenType: 'XLM',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function makeStore(contacts = [mockContact()]) {
  return configureStore({
    reducer: {
      auth: () => ({ isAuthenticated: true, user: { address: 'GSENDER' } }),
      contacts: () => ({ list: contacts, isLoading: false, error: null }),
    },
  });
}

// Stub Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

// Stub the Redux dispatch so async thunks don't fire real network calls
vi.mock('@/store/slices/contactsSlice', () => ({
  getContacts: () => ({ type: 'contacts/getContacts/mock' }),
  createContact: () => ({ type: 'contacts/createContact/mock' }),
  updateContact: () => ({ type: 'contacts/updateContact/mock' }),
  deleteContact: () => ({ type: 'contacts/deleteContact/mock' }),
}));

// Stub layout to avoid deep dependency tree in tests
vi.mock('@/components/layout/ChatLayout', () => ({
  ChatLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Stub EmptyState
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      <p>{title}</p>
      <p>{description}</p>
    </div>
  ),
}));

// eslint-disable-next-line import/first
import ContactsPage from '../page';

function renderPage(contacts = [mockContact()]) {
  const store = makeStore(contacts);
  return render(
    <Provider store={store}>
      <ContactsPage />
    </Provider>,
  );
}

describe('Contacts page — accessible search', () => {
  it('search input has an accessible label', () => {
    renderPage();
    // The label text is visually hidden (sr-only) but still associated
    const input = screen.getByLabelText(/search contacts by name or address/i);
    expect(input).toBeInTheDocument();
  });

  it('live region is empty before the user types', () => {
    renderPage();
    const liveRegion = screen.getByRole('status', { hidden: true }) ??
      // fallback: find by aria-live attribute
      document.querySelector('[aria-live="polite"][aria-atomic="true"].sr-only');
    // The live region should start empty
    expect(liveRegion?.textContent?.trim()).toBe('');
  });

  it('announces result count when search yields results', async () => {
    renderPage([mockContact({ name: 'Alice' }), mockContact({ id: '2', name: 'Bob', address: 'GBOBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })]);

    const input = screen.getByLabelText(/search contacts by name or address/i);
    await userEvent.type(input, 'Alice');

    await waitFor(() => {
      const liveRegion = document.querySelector(
        '[aria-live="polite"][aria-atomic="true"].sr-only',
      );
      expect(liveRegion?.textContent).toMatch(/1 contact found/i);
    });
  });

  it('announces "No contacts found" when search yields no results', async () => {
    renderPage([mockContact({ name: 'Alice' })]);

    const input = screen.getByLabelText(/search contacts by name or address/i);
    await userEvent.type(input, 'zzznomatch');

    await waitFor(() => {
      const liveRegion = document.querySelector(
        '[aria-live="polite"][aria-atomic="true"].sr-only',
      );
      expect(liveRegion?.textContent).toMatch(/No contacts found/i);
    });
  });

  it('shows the empty-state component when no contacts match', async () => {
    renderPage([mockContact({ name: 'Alice' })]);

    const input = screen.getByLabelText(/search contacts by name or address/i);
    await userEvent.type(input, 'zzznomatch');

    await waitFor(() => {
      expect(screen.getByText('No contacts found')).toBeInTheDocument();
    });
  });

  it('live region is silent (no text) when search is cleared', async () => {
    renderPage([mockContact({ name: 'Alice' })]);

    const input = screen.getByLabelText(/search contacts by name or address/i);
    await userEvent.type(input, 'Alice');

    // Clear the search
    await userEvent.clear(input);

    await waitFor(() => {
      const liveRegion = document.querySelector(
        '[aria-live="polite"][aria-atomic="true"].sr-only',
      );
      expect(liveRegion?.textContent?.trim()).toBe('');
    });
  });
});
