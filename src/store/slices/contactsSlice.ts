import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Contact, CreateContactRequest, UpdateContactRequest } from '@/types';
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
}

const initialState: ContactsState = {
  list: [],
  isLoading: false,
  error: null,
  selectedContact: null,
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
    // Mock delete contact - always succeed
    return id;
  }
);

/**
 * Bulk-import a pre-validated list of contacts.
 * Each entry is created sequentially; if an individual creation fails the
 * rest still continue so the import is never silently partial — every
 * failure is collected and surfaced to the caller.
 */
export const importContacts = createAsyncThunk(
  'contacts/importContacts',
  async (rows: CreateContactRequest[], { dispatch, rejectWithValue }) => {
    const succeeded: Contact[] = [];
    const failures: { name: string; error: string }[] = [];

    for (const row of rows) {
      try {
        const contact = await dispatch(createContact(row)).unwrap();
        succeeded.push(contact);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
        failures.push({ name: row.name, error: message });
      }
    }

    if (failures.length > 0 && succeeded.length === 0) {
      return rejectWithValue(
        `All ${failures.length} import(s) failed. First error: ${failures[0].error}`,
      );
    }

    return { succeeded, failures };
  },
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
    searchContacts: (state, action: PayloadAction<string>) => {
      // This would typically be handled by a selector, but we can store the search term here
      // The actual filtering would be done in the component or selector
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
      // Delete Contact
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
      // Import Contacts — individual rows are added via createContact.fulfilled;
      // these cases only manage the top-level loading/error flag.
      .addCase(importContacts.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(importContacts.fulfilled, (state) => {
        state.isLoading = false;
        state.error = null;
      })
      .addCase(importContacts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearError, setSelectedContact, clearSelectedContact, searchContacts } = contactsSlice.actions;
export default contactsSlice.reducer;
