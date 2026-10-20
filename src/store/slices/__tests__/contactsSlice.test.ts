import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import contactsReducer, { createContact } from '../contactsSlice';
import type { Contact } from '@/types';

// #217 — duplicate contact prevention

const ADDR_A = 'G' + 'A'.repeat(55); // valid 56-char Stellar address
const ADDR_B = 'G' + 'B'.repeat(55);

function makeStore(existingContacts: Contact[] = []) {
  return configureStore({
    reducer: { contacts: contactsReducer },
    preloadedState: {
      contacts: {
        list: existingContacts,
        isLoading: false,
        error: null,
        selectedContact: null,
      },
    },
  });
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'existing-1',
    name: 'Alice',
    address: ADDR_A,
    tokenType: 'XLM',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('createContact duplicate prevention', () => {
  it('creates a contact when the address is unique', async () => {
    const store = makeStore([makeContact()]);
    const result = await store.dispatch(
      createContact({ name: 'Bob', address: ADDR_B, tokenType: 'XLM' })
    );
    expect(createContact.fulfilled.match(result)).toBe(true);
    expect(store.getState().contacts.list).toHaveLength(2);
  });

  it('blocks a contact whose address exactly matches an existing one', async () => {
    const store = makeStore([makeContact()]);
    const result = await store.dispatch(
      createContact({ name: 'Alice 2', address: ADDR_A, tokenType: 'XLM' })
    );
    expect(createContact.rejected.match(result)).toBe(true);
    expect(result.payload).toMatch(/already uses this address/);
    expect(result.payload).toMatch(/Alice/);
    expect(store.getState().contacts.list).toHaveLength(1);
  });

  it('treats a whitespace-padded duplicate as a duplicate', async () => {
    const store = makeStore([makeContact()]);
    const result = await store.dispatch(
      createContact({ name: 'Alice 2', address: `  ${ADDR_A}  `, tokenType: 'XLM' })
    );
    expect(createContact.rejected.match(result)).toBe(true);
    expect(result.payload).toMatch(/already uses this address/);
    expect(store.getState().contacts.list).toHaveLength(1);
  });

  it('treats a lowercase duplicate as a duplicate (case-normalized)', async () => {
    const store = makeStore([makeContact()]);
    const result = await store.dispatch(
      createContact({ name: 'Alice 2', address: ADDR_A.toLowerCase(), tokenType: 'XLM' })
    );
    expect(createContact.rejected.match(result)).toBe(true);
    expect(result.payload).toMatch(/already uses this address/);
    expect(store.getState().contacts.list).toHaveLength(1);
  });

  it('error message names the conflicting contact and directs to edit', async () => {
    const store = makeStore([makeContact({ name: 'Carol' })]);
    const result = await store.dispatch(
      createContact({ name: 'Carol 2', address: ADDR_A, tokenType: 'XLM' })
    );
    expect(createContact.rejected.match(result)).toBe(true);
    expect(result.payload).toContain('Carol');
    expect(result.payload).toContain('Edit that contact instead');
  });

  it('allows creating a contact when the list is empty', async () => {
    const store = makeStore([]);
    const result = await store.dispatch(
      createContact({ name: 'Dave', address: ADDR_A, tokenType: 'XLM' })
    );
    expect(createContact.fulfilled.match(result)).toBe(true);
    expect(store.getState().contacts.list).toHaveLength(1);
  });
});
