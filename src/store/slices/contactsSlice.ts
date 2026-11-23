import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Contact, ContactsState, CreateContactRequest, UpdateContactRequest } from '@/types';
import apiService from '@/services/api';
import { PAGINATION } from '@/constants';
import { normalizeContactAddress } from '@/utils/validation';

export const paginateContacts = (
  contacts: Contact[],
  page: number,
  pageSize = PAGINATION.CONTACTS_PAGE_SIZE,
): Contact[] => {
  const start = Math.max(0, page - 1) * pageSize;
  return contacts.slice(start, start + pageSize);
};
export const hasContactAddressChanged = (savedAddress: string, proposedAddress: string): boolean =>
  proposedAddress.trim() !== savedAddress;

export const filterContacts = (contacts: Contact[], searchTerm: string): Contact[] => {
  const normalizedTerm = searchTerm.trim().toLowerCase();
  if (!normalizedTerm) return contacts;

  return contacts.filter((contact) =>
    contact.name.toLowerCase().includes(normalizedTerm) ||
    contact.address.toLowerCase().includes(normalizedTerm) ||
    (contact.note ?? '').toLowerCase().includes(normalizedTerm)
  );
};

interface ContactsState {
  list: Contact[];
  isLoading: boolean;
  error: string | null;
  selectedContact: Contact | null;
  /** Contacts optimistically removed pending backend confirmation. */
  pendingDeletion: Contact[];
}

const initialState: ContactsState = {
  list: [],
  isLoading: false,
  error: null,
  selectedContact: null,
  mutating: {
    create: false,
    update: [],
    delete: [],
  },
  mutationError: {
    create: null,
    update: {},
    delete: {},
  },
  pendingDeletion: [],
};

// ---------------------------------------------------------------------------
// Async thunks
// ---------------------------------------------------------------------------

export const getContacts = createAsyncThunk(
  'contacts/getContacts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiService.getContacts();
      if (!response.success) {
        return rejectWithValue(response.message);
      }
      return response.data as Contact[];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load contacts';
      return rejectWithValue(message);
    }
  },
    // Mock contacts
    const mockContacts: Contact[] = [
      {
        id: '1',
        name: 'Mock Contact 1',
        address: '0x1234567890abcdef',
        tokenType: 'STRK',
        note: 'Primary trading account for A/B testing.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '2',
        name: 'Mock Contact 2',
        address: '0xabcdef1234567890',
        tokenType: 'ETH',
        note: 'Treasury vault for monthly settlements.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    return mockContacts;
  }
);

export const createContact = createAsyncThunk(
  'contacts/createContact',
  async (contactData: CreateContactRequest, { rejectWithValue }) => {
    try {
      const response = await apiService.createContact(contactData);
      if (!response.success) {
        return rejectWithValue(response.message);
      }
      return response.data as Contact;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create contact';
      return rejectWithValue(message);
    }
  },
  async (contactData: CreateContactRequest, { rejectWithValue, getState }) => {
    const validation = validateContact(contactData);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0] ?? 'Invalid contact data';
      return rejectWithValue(firstError);
    }
    const normalized: CreateContactRequest = {
      ...contactData,
      address: normalizeContactAddress(contactData.address),
    };

    // Duplicate check: same normalized address already exists
    const state = getState() as { contacts: ContactsState };
    const existing = state.contacts.list.find(
      (c) => normalizeContactAddress(c.address) === normalized.address
    );
    if (existing) {
      return rejectWithValue(
        `"${existing.name}" already uses this address. Edit that contact instead.`
      );
    }

    // Mock create contact
    const mockContact: Contact = {
      id: `mock_${Date.now()}`,
      name: contactData.name,
      address: contactData.address,
      tokenType: contactData.tokenType,
      note: contactData.note?.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return mockContact;
  }
);

export const updateContact = createAsyncThunk(
  'contacts/updateContact',
  async ({ id, data }: { id: string; data: UpdateContactRequest }, { rejectWithValue }) => {
    try {
      const response = await apiService.updateContact(id, data);
      if (!response.success) {
        return rejectWithValue({ id, message: response.message });
      }
      return response.data as Contact;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update contact';
      return rejectWithValue({ id, message });
    }
  },
    const validation = validateUpdateContact(data);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0] ?? 'Invalid contact data';
      return rejectWithValue(firstError);
    }
    const normalized: UpdateContactRequest = data.address
      ? { ...data, address: normalizeContactAddress(data.address) }
      : data;
    // Mock update contact
    const mockContact: Contact = {
      id,
      name: data.name || 'Updated Contact',
      address: data.address || '0xupdatedaddress',
      tokenType: data.tokenType || 'STRK',
      note: data.note?.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return mockContact;
  }
);

export const deleteContact = createAsyncThunk(
  'contacts/deleteContact',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await apiService.deleteContact(id);
      if (!response.success) {
        return rejectWithValue({ id, message: response.message });
      }
      return id;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete contact';
      return rejectWithValue({ id, message });
    }
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------
/**
 * Optimistically flips isFavorite then persists via PUT /contacts/{id}.
 * On failure the original value is restored and an error is set.
 */
export const toggleFavorite = createAsyncThunk(
  'contacts/toggleFavorite',
  async (id: string, { getState, rejectWithValue }) => {
    const state = (getState() as { contacts: ContactsState }).contacts;
    const contact = state.list.find((c) => c.id === id);
    if (!contact) return rejectWithValue('Contact not found');

    const newValue = !contact.isFavorite;
    try {
      const result = await apiService.updateContact(id, { isFavorite: newValue });
      if (!result.success) {
        return rejectWithValue((result as { message?: string }).message ?? 'Failed to update favorite');
      }
      // Return the server-confirmed contact if available, otherwise a minimal patch.
      return result.success ? result.data : { ...contact, isFavorite: newValue };
    } catch (err: unknown) {
      return rejectWithValue(
        (err as { message?: string }).message ?? 'Failed to update favorite',
      );
    }
  },
);

/**
 * Commits a soft-deleted contact to the backend.
 * On failure the contact is restored to `list` automatically.
 */
export const commitDeleteContact = createAsyncThunk(
  'contacts/commitDeleteContact',
  async (id: string, { rejectWithValue }) => {
    try {
      await apiService.deleteContact(id);
      return id;
    } catch (err: unknown) {
      return rejectWithValue(
        (err as { message?: string }).message ?? 'Failed to delete contact',
      );
    }
  }
);

const contactsSlice = createSlice({
  name: 'contacts',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
      state.mutationError = { create: null, update: {}, delete: {} };
    },
    clearCreateError: (state) => {
      state.mutationError.create = null;
    },
    clearUpdateError: (state, action: PayloadAction<string>) => {
      delete state.mutationError.update[action.payload];
    },
    clearDeleteError: (state, action: PayloadAction<string>) => {
      delete state.mutationError.delete[action.payload];
    },
    setSelectedContact: (state, action: PayloadAction<Contact | null>) => {
      state.selectedContact = action.payload;
    },
    clearSelectedContact: (state) => {
      state.selectedContact = null;
    },
    searchContacts: (_state, _action: PayloadAction<string>) => {
      // Filtering is handled in components/selectors; search term is not persisted in Redux.
      // Filtering is handled by a selector in the component.
    },
    /**
     * Optimistically hides the contact from the list while the undo window
     * is open.  The contact is saved in `pendingDeletion` so it can be
     * restored if the user clicks Undo.
     */
    softDeleteContact: (state, action: PayloadAction<string>) => {
      const idx = state.list.findIndex((c) => c.id === action.payload);
      if (idx === -1) return;
      const [removed] = state.list.splice(idx, 1);
      state.pendingDeletion.push(removed);
      if (state.selectedContact?.id === action.payload) {
        state.selectedContact = null;
      }
    },
    /**
     * Moves the contact back from `pendingDeletion` to `list` (undo).
     */
    restoreContact: (state, action: PayloadAction<string>) => {
      const idx = state.pendingDeletion.findIndex((c) => c.id === action.payload);
      if (idx === -1) return;
      const [contact] = state.pendingDeletion.splice(idx, 1);
      state.list.push(contact);
    },
    /**
     * Discards the pending-deletion record without hitting the network
     * (used when the undo window expires and commitDeleteContact is called
     * instead, or when cleaning up after a failed commit that was already
     * restored).
     */
    clearPendingDeletion: (state, action: PayloadAction<string>) => {
      state.pendingDeletion = state.pendingDeletion.filter(
        (c) => c.id !== action.payload,
      );
    },
    /**
     * Optimistically flips isFavorite in-place before the network request
     * completes.  toggleFavorite.rejected restores the previous value.
     */
    optimisticToggleFavorite: (state, action: PayloadAction<string>) => {
      const contact = state.list.find((c) => c.id === action.payload);
      if (contact) {
        contact.isFavorite = !contact.isFavorite;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // ── getContacts ──────────────────────────────────────────────────────
      .addCase(getContacts.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getContacts.fulfilled, (state, action) => {
        state.isLoading = false;
        state.list = action.payload;
        state.error = null;
      })
      .addCase(getContacts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })

      // ── createContact ────────────────────────────────────────────────────
      .addCase(createContact.pending, (state) => {
        state.mutating.create = true;
        state.mutationError.create = null;
      })
      .addCase(createContact.fulfilled, (state, action) => {
        state.mutating.create = false;
        state.list.push(action.payload);
        state.mutationError.create = null;
      })
      .addCase(createContact.rejected, (state, action) => {
        state.mutating.create = false;
        state.mutationError.create = action.payload as string;
      })

      // ── updateContact ────────────────────────────────────────────────────
      .addCase(updateContact.pending, (state, action) => {
        const id = action.meta.arg.id;
        if (!state.mutating.update.includes(id)) {
          state.mutating.update.push(id);
        }
        delete state.mutationError.update[id];
      })
      .addCase(updateContact.fulfilled, (state, action) => {
        const updated = action.payload;
        state.mutating.update = state.mutating.update.filter((id) => id !== updated.id);
        const index = state.list.findIndex((c) => c.id === updated.id);
        if (index !== -1) {
          state.list[index] = updated;
        }
        if (state.selectedContact?.id === updated.id) {
          state.selectedContact = updated;
        }
        delete state.mutationError.update[updated.id];
      })
      .addCase(updateContact.rejected, (state, action) => {
        const { id, message } = action.payload as { id: string; message: string };
        state.mutating.update = state.mutating.update.filter((uid) => uid !== id);
        state.mutationError.update[id] = message;
      })

      // ── deleteContact ────────────────────────────────────────────────────
      .addCase(deleteContact.pending, (state, action) => {
        const id = action.meta.arg;
        if (!state.mutating.delete.includes(id)) {
          state.mutating.delete.push(id);
        }
        delete state.mutationError.delete[id];
      // Delete Contact (legacy — kept for any direct callers)
      .addCase(deleteContact.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteContact.fulfilled, (state, action) => {
        const id = action.payload;
        state.mutating.delete = state.mutating.delete.filter((did) => did !== id);
        state.list = state.list.filter((c) => c.id !== id);
        if (state.selectedContact?.id === id) {
          state.selectedContact = null;
        }
        delete state.mutationError.delete[id];
      })
      .addCase(deleteContact.rejected, (state, action) => {
        const { id, message } = action.payload as { id: string; message: string };
        state.mutating.delete = state.mutating.delete.filter((did) => did !== id);
        state.mutationError.delete[id] = message;
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Commit Delete Contact
      .addCase(commitDeleteContact.fulfilled, (state, action) => {
        // Remove from pending — contact is already gone from list.
        state.pendingDeletion = state.pendingDeletion.filter(
          (c) => c.id !== action.payload,
        );
        state.error = null;
      })
      .addCase(commitDeleteContact.rejected, (state, action) => {
        // Restore the contact back into the list so the user doesn't lose data.
        const idx = state.pendingDeletion.findIndex(
          (c) => c.id === (action.meta.arg as string),
        );
        if (idx !== -1) {
          const [contact] = state.pendingDeletion.splice(idx, 1);
          state.list.push(contact);
        }
        state.error = action.payload as string;
      })
      // Toggle Favorite
      .addCase(toggleFavorite.fulfilled, (state, action) => {
        // Overwrite with server-confirmed value if the server returned a full contact.
        const idx = state.list.findIndex((c) => c.id === action.payload.id);
        if (idx !== -1) {
          state.list[idx] = { ...state.list[idx], ...action.payload };
        }
        state.error = null;
      })
      .addCase(toggleFavorite.rejected, (state, action) => {
        // Revert the optimistic flip.
        const id = action.meta.arg as string;
        const contact = state.list.find((c) => c.id === id);
        if (contact) {
          contact.isFavorite = !contact.isFavorite;
        }
        state.error = action.payload as string;
      });
  },
});

export const {
  clearError,
  clearCreateError,
  clearUpdateError,
  clearDeleteError,
  setSelectedContact,
  clearSelectedContact,
  searchContacts,
} = contactsSlice.actions;

  setSelectedContact,
  clearSelectedContact,
  searchContacts,
  softDeleteContact,
  restoreContact,
  clearPendingDeletion,
  optimisticToggleFavorite,
} = contactsSlice.actions;
export default contactsSlice.reducer;
