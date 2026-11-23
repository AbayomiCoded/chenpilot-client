/**
 * Tests for contactsSlice — per-action pending states and memo preset fields.
 *
 * Uses Redux Toolkit's createAsyncThunk, so we exercise the slice through a
 * real configureStore rather than calling reducers directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import contactsReducer, {
  createContact,
  updateContact,
  deleteContact,
  getContacts,
  clearCreateError,
  clearUpdateError,
  clearDeleteError,
} from '../contactsSlice';
import type { ContactsState } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Spin up a fresh, isolated store for each test. */
function makeStore() {
  return configureStore({ reducer: { contacts: contactsReducer } });
}

/** Resolve the next micro-task tick so Redux dispatches flush. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// Minimal valid address accepted by the stellar schema
const ADDR = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890123456';

function makeContact(overrides: Partial<import('@/types').Contact> = {}) {
  return {
    id: '1',
    name: 'Alice',
    address: ADDR,
    tokenType: 'XLM' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock apiService at the module level so thunks go through the mock
// ---------------------------------------------------------------------------
vi.mock('@/services/api', () => ({
  default: {
    getContacts: vi.fn(),
    createContact: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
  },
}));

import apiService from '@/services/api';

const mockApi = apiService as {
  getContacts: ReturnType<typeof vi.fn>;
  createContact: ReturnType<typeof vi.fn>;
  updateContact: ReturnType<typeof vi.fn>;
  deleteContact: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
describe('initial state', () => {
  it('starts with empty list and no pending mutations', () => {
    const store = makeStore();
    const s = store.getState().contacts as ContactsState;
    expect(s.list).toEqual([]);
    expect(s.mutating.create).toBe(false);
    expect(s.mutating.update).toEqual([]);
    expect(s.mutating.delete).toEqual([]);
    expect(s.mutationError.create).toBeNull();
    expect(s.mutationError.update).toEqual({});
    expect(s.mutationError.delete).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// getContacts
// ---------------------------------------------------------------------------
describe('getContacts', () => {
  it('sets isLoading while in-flight and populates list on success', async () => {
    const contacts = [makeContact(), makeContact({ id: '2', name: 'Bob' })];
    mockApi.getContacts.mockResolvedValueOnce({ success: true, data: contacts });

    const store = makeStore();
    const promise = store.dispatch(getContacts());

    // Pending
    expect((store.getState().contacts as ContactsState).isLoading).toBe(true);

    await promise;
    const s = store.getState().contacts as ContactsState;
    expect(s.isLoading).toBe(false);
    expect(s.list).toHaveLength(2);
    expect(s.error).toBeNull();
  });

  it('stores the error on rejection and clears isLoading', async () => {
    mockApi.getContacts.mockResolvedValueOnce({ success: false, message: 'Not found' });

    const store = makeStore();
    await store.dispatch(getContacts());

    const s = store.getState().contacts as ContactsState;
    expect(s.isLoading).toBe(false);
    expect(s.list).toHaveLength(0);
    expect(s.error).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// createContact — per-action pending, memo preset, error retention
// ---------------------------------------------------------------------------
describe('createContact', () => {
  it('sets mutating.create while pending and clears on success', async () => {
    const created = makeContact({ defaultMemo: 'inv-001', defaultMemoType: 'text' });
    mockApi.createContact.mockResolvedValueOnce({ success: true, data: created });

    const store = makeStore();
    const promise = store.dispatch(
      createContact({ name: 'Alice', address: ADDR, tokenType: 'XLM', defaultMemo: 'inv-001', defaultMemoType: 'text' }),
    );

    expect((store.getState().contacts as ContactsState).mutating.create).toBe(true);

    await promise;
    const s = store.getState().contacts as ContactsState;
    expect(s.mutating.create).toBe(false);
    expect(s.list).toHaveLength(1);
    expect(s.list[0].defaultMemo).toBe('inv-001');
    expect(s.list[0].defaultMemoType).toBe('text');
    expect(s.mutationError.create).toBeNull();
  });

  it('records error on rejection and leaves list unchanged', async () => {
    mockApi.createContact.mockResolvedValueOnce({ success: false, message: 'Duplicate address' });

    const store = makeStore();
    await store.dispatch(
      createContact({ name: 'Alice', address: ADDR, tokenType: 'XLM' }),
    );

    const s = store.getState().contacts as ContactsState;
    expect(s.mutating.create).toBe(false);
    expect(s.list).toHaveLength(0);
    expect(s.mutationError.create).toBe('Duplicate address');
  });

  it('clearCreateError resets the create error', async () => {
    mockApi.createContact.mockResolvedValueOnce({ success: false, message: 'Bad request' });
    const store = makeStore();
    await store.dispatch(createContact({ name: 'X', address: ADDR, tokenType: 'XLM' }));

    store.dispatch(clearCreateError());
    expect((store.getState().contacts as ContactsState).mutationError.create).toBeNull();
  });

  it('prevents isLoading from blocking independent load while create is in-flight', async () => {
    // createContact pending should NOT flip the global isLoading flag
    let resolveFn!: (v: unknown) => void;
    mockApi.createContact.mockReturnValueOnce(new Promise((r) => { resolveFn = r; }));

    const store = makeStore();
    store.dispatch(createContact({ name: 'A', address: ADDR, tokenType: 'XLM' }));
    await flush();

    const s = store.getState().contacts as ContactsState;
    // Global isLoading must stay false so the contacts list can still be shown
    expect(s.isLoading).toBe(false);
    expect(s.mutating.create).toBe(true);

    resolveFn({ success: true, data: makeContact() });
    await flush();
    expect((store.getState().contacts as ContactsState).mutating.create).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateContact — only the targeted contact is disabled
// ---------------------------------------------------------------------------
describe('updateContact', () => {
  it('adds target id to mutating.update while pending', async () => {
    const updated = makeContact({ name: 'Alice 2', defaultMemo: 'ref-7', defaultMemoType: 'id' });
    mockApi.updateContact.mockResolvedValueOnce({ success: true, data: updated });

    const store = makeStore();
    // Pre-populate list
    store.dispatch({ type: 'contacts/getContacts/fulfilled', payload: [makeContact()] });

    const promise = store.dispatch(
      updateContact({ id: '1', data: { name: 'Alice 2', defaultMemo: 'ref-7', defaultMemoType: 'id' } }),
    );

    expect((store.getState().contacts as ContactsState).mutating.update).toContain('1');

    await promise;
    const s = store.getState().contacts as ContactsState;
    expect(s.mutating.update).not.toContain('1');
    expect(s.list[0].name).toBe('Alice 2');
    expect(s.list[0].defaultMemo).toBe('ref-7');
    expect(s.list[0].defaultMemoType).toBe('id');
  });

  it('stores error keyed by contact id and removes id from mutating.update', async () => {
    mockApi.updateContact.mockResolvedValueOnce({ success: false, message: 'Conflict' });

    const store = makeStore();
    store.dispatch({ type: 'contacts/getContacts/fulfilled', payload: [makeContact()] });
    await store.dispatch(updateContact({ id: '1', data: { name: 'New' } }));

    const s = store.getState().contacts as ContactsState;
    expect(s.mutating.update).not.toContain('1');
    expect(s.mutationError.update['1']).toBe('Conflict');
    // Form value preserved — list item is unchanged
    expect(s.list[0].name).toBe('Alice');
  });

  it('clearUpdateError removes only the targeted contact error', async () => {
    mockApi.updateContact
      .mockResolvedValueOnce({ success: false, message: 'Err 1' })
      .mockResolvedValueOnce({ success: false, message: 'Err 2' });

    const store = makeStore();
    await store.dispatch(updateContact({ id: '1', data: {} }));
    await store.dispatch(updateContact({ id: '2', data: {} }));

    store.dispatch(clearUpdateError('1'));
    const s = store.getState().contacts as ContactsState;
    expect(s.mutationError.update['1']).toBeUndefined();
    expect(s.mutationError.update['2']).toBe('Err 2');
  });

  it('does not affect the delete spinner for a different contact', async () => {
    let resolveDelete!: (v: unknown) => void;
    mockApi.deleteContact.mockReturnValueOnce(new Promise((r) => { resolveDelete = r; }));
    mockApi.updateContact.mockResolvedValueOnce({ success: true, data: makeContact({ id: '2' }) });

    const store = makeStore();
    store.dispatch({ type: 'contacts/getContacts/fulfilled', payload: [makeContact(), makeContact({ id: '2' })] });

    // Start delete on id=1
    store.dispatch(deleteContact('1'));
    await flush();

    // Start update on id=2 simultaneously
    await store.dispatch(updateContact({ id: '2', data: { name: 'Bob' } }));

    const s = store.getState().contacts as ContactsState;
    // delete for id=1 should still be in-flight
    expect(s.mutating.delete).toContain('1');
    // update for id=2 should have completed
    expect(s.mutating.update).not.toContain('2');

    resolveDelete({ success: true, data: '1' });
    await flush();
  });
});

// ---------------------------------------------------------------------------
// deleteContact
// ---------------------------------------------------------------------------
describe('deleteContact', () => {
  it('adds id to mutating.delete while pending and removes contact on success', async () => {
    mockApi.deleteContact.mockResolvedValueOnce({ success: true, data: { message: 'Deleted' } });

    const store = makeStore();
    store.dispatch({ type: 'contacts/getContacts/fulfilled', payload: [makeContact()] });

    const promise = store.dispatch(deleteContact('1'));
    expect((store.getState().contacts as ContactsState).mutating.delete).toContain('1');

    await promise;
    const s = store.getState().contacts as ContactsState;
    expect(s.mutating.delete).not.toContain('1');
    expect(s.list).toHaveLength(0);
  });

  it('stores error keyed by id and keeps contact in list on rejection', async () => {
    mockApi.deleteContact.mockResolvedValueOnce({ success: false, message: 'Server error' });

    const store = makeStore();
    store.dispatch({ type: 'contacts/getContacts/fulfilled', payload: [makeContact()] });
    await store.dispatch(deleteContact('1'));

    const s = store.getState().contacts as ContactsState;
    expect(s.mutating.delete).not.toContain('1');
    expect(s.mutationError.delete['1']).toBe('Server error');
    // Contact must remain so the user can retry
    expect(s.list).toHaveLength(1);
  });

  it('clearDeleteError removes only the targeted delete error', async () => {
    mockApi.deleteContact
      .mockResolvedValueOnce({ success: false, message: 'Err A' })
      .mockResolvedValueOnce({ success: false, message: 'Err B' });

    const store = makeStore();
    await store.dispatch(deleteContact('1'));
    await store.dispatch(deleteContact('2'));

    store.dispatch(clearDeleteError('1'));
    const s = store.getState().contacts as ContactsState;
    expect(s.mutationError.delete['1']).toBeUndefined();
    expect(s.mutationError.delete['2']).toBe('Err B');
import { describe, it, expect } from 'vitest';
import contactsReducer, {
  clearError,
  setSelectedContact,
  clearSelectedContact,
  searchContacts,
  getContacts,
  createContact,
  updateContact,
  deleteContact,
} from '../contactsSlice';
import { Contact } from '@/types';

describe('#343 — contactsSlice reducers and extraReducers', () => {
  const initial = {
    list: [],
    isLoading: false,
    error: null,
    selectedContact: null,
  };

  const sampleContact: Contact = {
    id: '1',
    name: 'Alice',
    address: '0x123',
    tokenType: 'STRK',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  it('handles synchronous actions (setSelectedContact, clearSelectedContact, clearError, searchContacts)', () => {
    let state = contactsReducer(initial, setSelectedContact(sampleContact));
    expect(state.selectedContact).toEqual(sampleContact);

    state = contactsReducer(state, clearSelectedContact());
    expect(state.selectedContact).toBeNull();

    const stateWithError = { ...initial, error: 'Some error' };
    state = contactsReducer(stateWithError, clearError());
    expect(state.error).toBeNull();

    // searchContacts reducer exists and produces valid state
    state = contactsReducer(initial, searchContacts('Alice'));
    expect(state).toBeDefined();
  });

  describe('getContacts', () => {
    it('handles pending, fulfilled, and rejected', () => {
      let state = contactsReducer(initial, { type: getContacts.pending.type });
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();

      state = contactsReducer(state, {
        type: getContacts.fulfilled.type,
        payload: [sampleContact],
      });
      expect(state.isLoading).toBe(false);
      expect(state.list).toEqual([sampleContact]);

      state = contactsReducer(state, {
        type: getContacts.rejected.type,
        payload: 'Failed to fetch',
      });
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Failed to fetch');
    });
  });

  describe('createContact', () => {
    it('handles pending, fulfilled, and rejected', () => {
      let state = contactsReducer(initial, { type: createContact.pending.type });
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();

      state = contactsReducer(state, {
        type: createContact.fulfilled.type,
        payload: sampleContact,
      });
      expect(state.isLoading).toBe(false);
      expect(state.list).toContainEqual(sampleContact);

      state = contactsReducer(state, {
        type: createContact.rejected.type,
        payload: 'Create failed',
      });
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Create failed');
    });
  });

  describe('updateContact', () => {
    it('updates contact in list and selectedContact on fulfilled', () => {
      const existingState = {
        ...initial,
        list: [sampleContact],
        selectedContact: sampleContact,
      };

      const updated = { ...sampleContact, name: 'Alice Renamed' };
      let state = contactsReducer(existingState, { type: updateContact.pending.type });
      expect(state.isLoading).toBe(true);

      state = contactsReducer(state, {
        type: updateContact.fulfilled.type,
        payload: updated,
      });
      expect(state.isLoading).toBe(false);
      expect(state.list[0].name).toBe('Alice Renamed');
      expect(state.selectedContact?.name).toBe('Alice Renamed');

      state = contactsReducer(state, {
        type: updateContact.rejected.type,
        payload: 'Update failed',
      });
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Update failed');
    });
  });

  describe('deleteContact', () => {
    it('removes contact from list and clears selectedContact on fulfilled', () => {
      const existingState = {
        ...initial,
        list: [sampleContact],
        selectedContact: sampleContact,
      };

      let state = contactsReducer(existingState, { type: deleteContact.pending.type });
      expect(state.isLoading).toBe(true);

      state = contactsReducer(state, {
        type: deleteContact.fulfilled.type,
        payload: sampleContact.id,
      });
      expect(state.isLoading).toBe(false);
      expect(state.list).toHaveLength(0);
      expect(state.selectedContact).toBeNull();

      state = contactsReducer(state, {
        type: deleteContact.rejected.type,
        payload: 'Delete failed',
      });
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Delete failed');
    });
  });
});
