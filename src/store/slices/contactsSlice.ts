import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Contact, CreateContactRequest, UpdateContactRequest } from '@/types';
import apiService from '@/services/api';

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
  pendingDeletion: [],
};

// Async thunks
export const getContacts = createAsyncThunk(
  'contacts/getContacts',
  async (_, { rejectWithValue }) => {
    // Mock contacts
    const mockContacts: Contact[] = [
      {
        id: '1',
        name: 'Mock Contact 1',
        address: '0x1234567890abcdef',
        tokenType: 'STRK',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '2',
        name: 'Mock Contact 2',
        address: '0xabcdef1234567890',
        tokenType: 'ETH',
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
    // Mock create contact
    const mockContact: Contact = {
      id: `mock_${Date.now()}`,
      name: contactData.name,
      address: contactData.address,
      tokenType: contactData.tokenType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return mockContact;
  }
);

export const updateContact = createAsyncThunk(
  'contacts/updateContact',
  async ({ id, data }: { id: string; data: UpdateContactRequest }, { rejectWithValue }) => {
    // Mock update contact
    const mockContact: Contact = {
      id,
      name: data.name || 'Updated Contact',
      address: data.address || '0xupdatedaddress',
      tokenType: data.tokenType || 'STRK',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return mockContact;
  }
);

export const deleteContact = createAsyncThunk(
  'contacts/deleteContact',
  async (id: string, { rejectWithValue }) => {
    // Mock delete contact - always succeed
    return id;
  }
);

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
    },
    setSelectedContact: (state, action: PayloadAction<Contact | null>) => {
      state.selectedContact = action.payload;
    },
    clearSelectedContact: (state) => {
      state.selectedContact = null;
    },
    searchContacts: (_state, _action: PayloadAction<string>) => {
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
      // Get Contacts
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
      // Create Contact
      .addCase(createContact.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createContact.fulfilled, (state, action) => {
        state.isLoading = false;
        state.list.push(action.payload);
        state.error = null;
      })
      .addCase(createContact.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Update Contact
      .addCase(updateContact.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateContact.fulfilled, (state, action) => {
        state.isLoading = false;
        const index = state.list.findIndex(contact => contact.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        if (state.selectedContact?.id === action.payload.id) {
          state.selectedContact = action.payload;
        }
        state.error = null;
      })
      .addCase(updateContact.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Delete Contact (legacy — kept for any direct callers)
      .addCase(deleteContact.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteContact.fulfilled, (state, action) => {
        state.isLoading = false;
        state.list = state.list.filter(contact => contact.id !== action.payload);
        if (state.selectedContact?.id === action.payload) {
          state.selectedContact = null;
        }
        state.error = null;
      })
      .addCase(deleteContact.rejected, (state, action) => {
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
  setSelectedContact,
  clearSelectedContact,
  searchContacts,
  softDeleteContact,
  restoreContact,
  clearPendingDeletion,
  optimisticToggleFavorite,
} = contactsSlice.actions;
export default contactsSlice.reducer;
