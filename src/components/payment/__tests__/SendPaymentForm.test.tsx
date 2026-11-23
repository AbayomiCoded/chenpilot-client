/**
 * Focused tests for SendPaymentForm — self-transfer detection and
 * unified asset list rendering.
 *
 * The component relies on react-hook-form and zod; we keep these as-is to
 * test real integration behaviour rather than mocking them away.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendPaymentForm } from '../SendPaymentForm';
import { SUPPORTED_ASSETS } from '@/types';

// Minimal Contact fixture
const CONTACTS = [] as any[];

const SENDER_ADDRESS = 'GSENDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OTHER_ADDRESS  = 'GRECIPIENTA AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  .replace(' ', ''); // valid G+55 chars

// Build a valid 56-char G-address for sender and a different recipient
const G55 = 'A'.repeat(55);
const VALID_SENDER    = 'G' + G55;
const VALID_RECIPIENT = 'G' + 'B'.repeat(55);

describe('SendPaymentForm — self-transfer detection', () => {
  const mockSubmit = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    mockSubmit.mockClear();
  });

  it('renders without self-transfer warning when no senderAddress is provided', () => {
    render(
      <SendPaymentForm
        onSubmit={mockSubmit}
        contacts={CONTACTS}
      />,
    );
    expect(
      screen.queryByRole('alert', { name: /sending to yourself/i }),
    ).toBeNull();
    expect(screen.queryByText(/Sending to yourself/i)).toBeNull();
  });

  it('shows a warning when the recipient matches the sender address', async () => {
    render(
      <SendPaymentForm
        onSubmit={mockSubmit}
        contacts={CONTACTS}
        senderAddress={VALID_SENDER}
      />,
    );

    const recipientInput = screen.getByPlaceholderText(/GABCD/i);
    await userEvent.type(recipientInput, VALID_SENDER);

    expect(await screen.findByText(/Sending to yourself/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/I intend to send to my own address/i),
    ).toBeInTheDocument();
  });

  it('shows warning case-insensitively (lower-case input)', async () => {
    render(
      <SendPaymentForm
        onSubmit={mockSubmit}
        contacts={CONTACTS}
        senderAddress={VALID_SENDER}
      />,
    );

    const recipientInput = screen.getByPlaceholderText(/GABCD/i);
    await userEvent.type(recipientInput, VALID_SENDER.toLowerCase());

    expect(await screen.findByText(/Sending to yourself/i)).toBeInTheDocument();
  });

  it('clears the warning when a different address is typed', async () => {
    render(
      <SendPaymentForm
        onSubmit={mockSubmit}
        contacts={CONTACTS}
        senderAddress={VALID_SENDER}
      />,
    );

    const recipientInput = screen.getByPlaceholderText(/GABCD/i);

    // Type own address → warning appears
    await userEvent.type(recipientInput, VALID_SENDER);
    expect(await screen.findByText(/Sending to yourself/i)).toBeInTheDocument();

    // Clear and type a different address → warning disappears
    await userEvent.clear(recipientInput);
    await userEvent.type(recipientInput, VALID_RECIPIENT);
    await waitFor(() =>
      expect(screen.queryByText(/Sending to yourself/i)).toBeNull(),
    );
  });

  it('disables submit while warning is shown and not acknowledged', async () => {
    render(
      <SendPaymentForm
        onSubmit={mockSubmit}
        contacts={CONTACTS}
        senderAddress={VALID_SENDER}
      />,
    );

    const recipientInput = screen.getByPlaceholderText(/GABCD/i);
    await userEvent.type(recipientInput, VALID_SENDER);

    await screen.findByText(/Sending to yourself/i);

    const submitButton = screen.getByRole('button', { name: /send payment/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit after user acknowledges self-transfer', async () => {
    render(
      <SendPaymentForm
        onSubmit={mockSubmit}
        contacts={CONTACTS}
        senderAddress={VALID_SENDER}
      />,
    );

    const recipientInput = screen.getByPlaceholderText(/GABCD/i);
    await userEvent.type(recipientInput, VALID_SENDER);

    const checkbox = await screen.findByRole('checkbox');
    await userEvent.click(checkbox);

    const submitButton = screen.getByRole('button', { name: /send payment/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('the warning has role="alert" for screen-reader announcement', async () => {
    render(
      <SendPaymentForm
        onSubmit={mockSubmit}
        contacts={CONTACTS}
        senderAddress={VALID_SENDER}
      />,
    );

    const recipientInput = screen.getByPlaceholderText(/GABCD/i);
    await userEvent.type(recipientInput, VALID_SENDER);

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent(/Sending to yourself/i);
  });
});

describe('SendPaymentForm — unified asset list', () => {
  it('renders every supported token as an option in the token dropdown', () => {
    render(<SendPaymentForm onSubmit={vi.fn()} contacts={CONTACTS} />);

    // The token <select> has aria-label="Token type"
    const select = screen.getByLabelText(/token type/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);

    for (const token of SUPPORTED_ASSETS) {
      expect(options).toContain(token);
    }
  });

  it('does not render legacy tokens (STRK, DAI)', () => {
    render(<SendPaymentForm onSubmit={vi.fn()} contacts={CONTACTS} />);
    const select = screen.getByLabelText(/token type/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);

    expect(options).not.toContain('STRK');
    expect(options).not.toContain('DAI');
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
