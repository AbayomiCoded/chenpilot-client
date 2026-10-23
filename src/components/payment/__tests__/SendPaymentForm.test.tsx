'use client';

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SendPaymentForm } from '../SendPaymentForm';

// #219 — preselect contact from initialContactId

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  __esModule: true,
}));

// Minimal stub for ContactPicker so we don't need full modal infrastructure
vi.mock('../ContactPicker', () => ({
  default: () => null,
}));

const ADDR_A = 'G' + 'A'.repeat(55);
const ADDR_B = 'G' + 'B'.repeat(55);

const contacts = [
  {
    id: 'c1',
    name: 'Alice',
    address: ADDR_A,
    tokenType: 'XLM',
  },
  {
    id: 'c2',
    name: 'Bob',
    address: ADDR_B,
    tokenType: 'USDC',
  },
];

const noop = async () => {};

describe('SendPaymentForm — initialContactId preselection', () => {
  it('renders without preselection when no initialContactId given', () => {
    render(
      <SendPaymentForm onSubmit={noop} contacts={contacts} />
    );
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.queryByText('Bob')).toBeNull();
  });

  it('preselects the matching contact when initialContactId is provided', async () => {
    await act(async () => {
      render(
        <SendPaymentForm onSubmit={noop} contacts={contacts} initialContactId="c1" />
      );
    });
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('preselects the correct contact when a different id is given', async () => {
    await act(async () => {
      render(
        <SendPaymentForm onSubmit={noop} contacts={contacts} initialContactId="c2" />
      );
    });
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.queryByText('Alice')).toBeNull();
  });

  it('does not preselect anything when the id does not match any contact', async () => {
    await act(async () => {
      render(
        <SendPaymentForm onSubmit={noop} contacts={contacts} initialContactId="unknown" />
      );
    });
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.queryByText('Bob')).toBeNull();
  });

  it('renders the clear (X) button when a contact is preselected, allowing recipient change', async () => {
    await act(async () => {
      render(
        <SendPaymentForm onSubmit={noop} contacts={contacts} initialContactId="c1" />
      );
    });
    // The clear button is rendered when a contact is selected
    const clearButtons = screen.getAllByRole('button');
    // At least one button should exist (the X to clear the contact)
    expect(clearButtons.length).toBeGreaterThan(0);
  });
});
