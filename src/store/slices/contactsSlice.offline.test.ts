// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import contactsReducer, { createContact, deleteContact, getContacts, updateContact } from './contactsSlice';

const apiMocks = vi.hoisted(() => ({
  getContacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  default: apiMocks,
}));

describe('contact actions while offline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  });

  it('blocks contact reads and mutations without calling the API', async () => {
    const store = configureStore({ reducer: contactsReducer });
    const outcomes = await Promise.all([
      store.dispatch(getContacts()),
      store.dispatch(createContact({ name: 'Ada', address: `G${'A'.repeat(55)}`, tokenType: 'XLM' })),
      store.dispatch(updateContact({ id: 'contact-1', data: { name: 'Ada Lovelace' } })),
      store.dispatch(deleteContact('contact-1')),
    ]);

    expect(outcomes.every((outcome) => outcome.meta.requestStatus === 'rejected')).toBe(true);
    expect(apiMocks.getContacts).not.toHaveBeenCalled();
    expect(apiMocks.createContact).not.toHaveBeenCalled();
    expect(apiMocks.updateContact).not.toHaveBeenCalled();
    expect(apiMocks.deleteContact).not.toHaveBeenCalled();
  });
});
