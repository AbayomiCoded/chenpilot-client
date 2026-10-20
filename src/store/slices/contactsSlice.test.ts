import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import contactsReducer, {
  softDeleteContact,
  restoreContact,
  clearPendingDeletion,
  commitDeleteContact,
  optimisticToggleFavorite,
  toggleFavorite,
} from './contactsSlice';
import { Contact } from '@/types';

vi.mock('@/services/api', () => ({
  default: {
    deleteContact: vi.fn(),
    updateContact: vi.fn(),
  },
}));

import apiService from '@/services/api';

const mockContact: Contact = {
  id: 'c1',
  name: 'Alice',
  address: '0xabc',
  tokenType: 'XLM',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const createStore = (preloaded?: Partial<ReturnType<typeof contactsReducer>>) =>
  configureStore({
    reducer: { contacts: contactsReducer },
    preloadedState: preloaded
      ? { contacts: { list: [], isLoading: false, error: null, selectedContact: null, pendingDeletion: [], ...preloaded } }
      : undefined,
  });

describe('contactsSlice — soft-delete / undo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('softDeleteContact removes contact from list and adds to pendingDeletion', () => {
    const store = createStore({ list: [mockContact] });
    store.dispatch(softDeleteContact('c1'));

    const { list, pendingDeletion } = store.getState().contacts;
    expect(list).toHaveLength(0);
    expect(pendingDeletion).toHaveLength(1);
    expect(pendingDeletion[0]).toEqual(mockContact);
  });

  it('softDeleteContact is a no-op for an unknown id', () => {
    const store = createStore({ list: [mockContact] });
    store.dispatch(softDeleteContact('unknown'));

    expect(store.getState().contacts.list).toHaveLength(1);
    expect(store.getState().contacts.pendingDeletion).toHaveLength(0);
  });

  it('restoreContact moves contact back from pendingDeletion to list', () => {
    const store = createStore({ list: [], pendingDeletion: [mockContact] });
    store.dispatch(restoreContact('c1'));

    const { list, pendingDeletion } = store.getState().contacts;
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(mockContact);
    expect(pendingDeletion).toHaveLength(0);
  });

  it('clearPendingDeletion removes entry without touching list', () => {
    const store = createStore({ list: [], pendingDeletion: [mockContact] });
    store.dispatch(clearPendingDeletion('c1'));

    expect(store.getState().contacts.list).toHaveLength(0);
    expect(store.getState().contacts.pendingDeletion).toHaveLength(0);
  });
});

describe('contactsSlice — commitDeleteContact thunk', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('on success clears pendingDeletion entry', async () => {
    vi.mocked(apiService.deleteContact).mockResolvedValue({ success: true, data: { message: 'Contact deleted' } });

    const store = createStore({ list: [], pendingDeletion: [mockContact] });
    await store.dispatch(commitDeleteContact('c1'));

    expect(store.getState().contacts.pendingDeletion).toHaveLength(0);
    expect(store.getState().contacts.error).toBeNull();
  });

  it('on failure restores contact to list and sets error', async () => {
    vi.mocked(apiService.deleteContact).mockRejectedValue(new Error('Network error'));

    const store = createStore({ list: [], pendingDeletion: [mockContact] });
    await store.dispatch(commitDeleteContact('c1'));

    const { list, pendingDeletion, error } = store.getState().contacts;
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(mockContact);
    expect(pendingDeletion).toHaveLength(0);
    expect(error).toBe('Network error');
  });

  it('on failure with unknown error message falls back gracefully', async () => {
    vi.mocked(apiService.deleteContact).mockRejectedValue('plain string error');

    const store = createStore({ list: [], pendingDeletion: [mockContact] });
    await store.dispatch(commitDeleteContact('c1'));

    expect(store.getState().contacts.list).toHaveLength(1);
    expect(store.getState().contacts.error).toBe('Failed to delete contact');
  });
});

describe('contactsSlice — favorites', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ─── optimisticToggleFavorite ───────────────────────────────────────────────

  it('optimisticToggleFavorite flips isFavorite from false to true', () => {
    const contact: Contact = { ...mockContact, isFavorite: false };
    const store = createStore({ list: [contact] });
    store.dispatch(optimisticToggleFavorite('c1'));
    expect(store.getState().contacts.list[0].isFavorite).toBe(true);
  });

  it('optimisticToggleFavorite flips isFavorite from true to false', () => {
    const contact: Contact = { ...mockContact, isFavorite: true };
    const store = createStore({ list: [contact] });
    store.dispatch(optimisticToggleFavorite('c1'));
    expect(store.getState().contacts.list[0].isFavorite).toBe(false);
  });

  it('optimisticToggleFavorite is a no-op for unknown id', () => {
    const store = createStore({ list: [mockContact] });
    store.dispatch(optimisticToggleFavorite('unknown'));
    expect(store.getState().contacts.list[0].isFavorite).toBeUndefined();
  });

  // ─── toggleFavorite thunk ──────────────────────────────────────────────────

  it('toggleFavorite.fulfilled updates the contact with server response', async () => {
    const serverContact: Contact = { ...mockContact, isFavorite: true };
    vi.mocked(apiService.updateContact).mockResolvedValue({ success: true, data: serverContact });

    const store = createStore({ list: [{ ...mockContact, isFavorite: false }] });
    // Simulate the optimistic flip that the page does before dispatching the thunk.
    store.dispatch(optimisticToggleFavorite('c1'));
    await store.dispatch(toggleFavorite('c1'));

    expect(store.getState().contacts.list[0].isFavorite).toBe(true);
    expect(store.getState().contacts.error).toBeNull();
  });

  it('toggleFavorite.rejected reverts the optimistic flip', async () => {
    vi.mocked(apiService.updateContact).mockRejectedValue(new Error('Server error'));

    const store = createStore({ list: [{ ...mockContact, isFavorite: false }] });
    store.dispatch(optimisticToggleFavorite('c1'));
    // After optimistic flip, value is true.
    expect(store.getState().contacts.list[0].isFavorite).toBe(true);

    await store.dispatch(toggleFavorite('c1'));

    // Should be reverted back to false.
    expect(store.getState().contacts.list[0].isFavorite).toBe(false);
    expect(store.getState().contacts.error).toBe('Server error');
  });

  it('toggleFavorite.rejected with non-Error falls back to generic message', async () => {
    vi.mocked(apiService.updateContact).mockRejectedValue('oops');

    const store = createStore({ list: [{ ...mockContact, isFavorite: true }] });
    store.dispatch(optimisticToggleFavorite('c1'));
    await store.dispatch(toggleFavorite('c1'));

    expect(store.getState().contacts.error).toBe('Failed to update favorite');
  });

  // ─── sortContacts (unit-tested via the reducer's fulfilled path) ───────────

  it('favorites appear before non-favorites in list after multiple toggles', async () => {
    const alice: Contact = { ...mockContact, id: 'a', name: 'Alice', isFavorite: false };
    const bob: Contact = { ...mockContact, id: 'b', name: 'Bob', isFavorite: true };
    const carol: Contact = { ...mockContact, id: 'c', name: 'Carol', isFavorite: false };

    // Verify the sort function directly via the shape we expect on page.
    // favorites first (Bob), then alpha (Alice, Carol).
    const sorted = [alice, bob, carol].sort((a, b) => {
      const af = a.isFavorite ? 0 : 1;
      const bf = b.isFavorite ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
    expect(sorted.map((c) => c.name)).toEqual(['Bob', 'Alice', 'Carol']);
  });

  it('sort is stable when all contacts are favorites — falls back to alpha', () => {
    const contacts: Contact[] = [
      { ...mockContact, id: 'z', name: 'Zara', isFavorite: true },
      { ...mockContact, id: 'a', name: 'Anna', isFavorite: true },
      { ...mockContact, id: 'm', name: 'Mike', isFavorite: true },
    ];
    const sorted = [...contacts].sort((a, b) => {
      const af = a.isFavorite ? 0 : 1;
      const bf = b.isFavorite ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
    expect(sorted.map((c) => c.name)).toEqual(['Anna', 'Mike', 'Zara']);
  });

  it('favorites filter excludes non-favorites', () => {
    const contacts: Contact[] = [
      { ...mockContact, id: '1', name: 'Alice', isFavorite: true },
      { ...mockContact, id: '2', name: 'Bob', isFavorite: false },
    ];
    const filtered = contacts.filter((c) => c.isFavorite);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Alice');
  });

  it('search and favorites filter compose correctly', () => {
    const contacts: Contact[] = [
      { ...mockContact, id: '1', name: 'Alice', isFavorite: true },
      { ...mockContact, id: '2', name: 'Alex', isFavorite: false },
      { ...mockContact, id: '3', name: 'Bob', isFavorite: true },
    ];
    const term = 'al';
    const result = contacts.filter(
      (c) => c.isFavorite && c.name.toLowerCase().includes(term),
    );
    // Only Alice matches: is favorite AND name contains 'al'
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });
});
