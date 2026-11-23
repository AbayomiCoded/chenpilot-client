import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SendPaymentForm from './SendPaymentForm';
import { PaymentOutcomeUnknownError } from '@/utils/paymentOutcome';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('#344 — SendPaymentForm Component & Conditional Memo UI', () => {
  const mockOnSubmit = vi.fn();
  const sampleContacts = [
    {
      id: 'contact-alice',
      name: 'Alice',
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      tokenType: 'USDC',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue({ status: 'confirmed', transactionHash: 'hash-test' });
  });

  it('renders default form fields with memo input hidden when memoType is "none"', () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    expect(screen.getByLabelText(/Recipient Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Memo \(Optional\)/i)).toBeInTheDocument();

    // With default memoType="none", the input for memo text should NOT be present
    expect(screen.queryByPlaceholderText(/Enter memo text/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Enter numeric ID/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Enter 64-character hex hash/i)).not.toBeInTheDocument();
  });

  it('conditionally shows text memo input with max 28 characters placeholder when "text" is selected', () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const memoTypeSelect = screen.getByDisplayValue('No Memo');
    fireEvent.change(memoTypeSelect, { target: { value: 'text' } });

    const memoInput = screen.getByPlaceholderText(/Enter memo text/i) as HTMLInputElement;
    expect(memoInput).toBeInTheDocument();
    expect(memoInput.maxLength).toBe(28);
  });

  it('conditionally shows numeric ID memo input when "id" is selected', () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const memoTypeSelect = screen.getByDisplayValue('No Memo');
    fireEvent.change(memoTypeSelect, { target: { value: 'id' } });

    const memoInput = screen.getByPlaceholderText('Enter numeric ID') as HTMLInputElement;
    expect(memoInput).toBeInTheDocument();
    expect(memoInput.maxLength).toBe(20);
  });

  it('conditionally shows hash memo input with 64 max length when "hash" is selected', () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const memoTypeSelect = screen.getByDisplayValue('No Memo');
    fireEvent.change(memoTypeSelect, { target: { value: 'hash' } });

    const memoInput = screen.getByPlaceholderText('Enter 64-character hex hash') as HTMLInputElement;
    expect(memoInput).toBeInTheDocument();
    expect(memoInput.maxLength).toBe(64);
  });

  it('hides memo input again when switching back to "none"', () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const memoTypeSelect = screen.getByDisplayValue('No Memo');
    fireEvent.change(memoTypeSelect, { target: { value: 'text' } });
    expect(screen.getByPlaceholderText(/Enter memo text/i)).toBeInTheDocument();

    fireEvent.change(memoTypeSelect, { target: { value: 'none' } });
    expect(screen.queryByPlaceholderText(/Enter memo/i)).not.toBeInTheDocument();
  });

  it('validates and submits payment when valid data is provided', async () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const addressInput = screen.getByLabelText(/Recipient Address/i);
    const amountInput = screen.getByLabelText(/Amount/i);
    const memoTypeSelect = screen.getByDisplayValue('No Memo');

    const validAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    fireEvent.change(addressInput, { target: { value: validAddress } });
    fireEvent.change(amountInput, { target: { value: '25.0' } });
    fireEvent.change(memoTypeSelect, { target: { value: 'text' } });

    const memoInput = screen.getByPlaceholderText(/Enter memo text/i);
    fireEvent.change(memoInput, { target: { value: 'Project donation' } });

    fireEvent.click(screen.getByRole('button', { name: /Review Payment|Send Payment/i }));

    const confirmButton = await screen.findByRole('button', { name: /Confirm and send/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientAddress: validAddress,
          amount: '25.0',
          tokenType: 'XLM',
          memoType: 'text',
          memo: 'Project donation',
        }),
        expect.any(String)
      );
    });
  });

  it('shows validation errors when invalid amount and malformed memo are submitted', async () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const addressInput = screen.getByLabelText(/Recipient Address/i);
    const amountInput = screen.getByLabelText(/Amount/i);
    const memoTypeSelect = screen.getByDisplayValue('No Memo');

    // Invalid address, negative amount, malformed ID memo
    fireEvent.change(addressInput, { target: { value: 'bad_address' } });
    fireEvent.change(amountInput, { target: { value: '-10' } });
    fireEvent.change(memoTypeSelect, { target: { value: 'id' } });

    const memoInput = screen.getByPlaceholderText('Enter numeric ID');
    fireEvent.change(memoInput, { target: { value: 'letters_not_allowed' } });

    fireEvent.click(screen.getByRole('button', { name: /Review Payment|Send Payment/i }));

    await waitFor(() => {
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });
});

const recipientAddress = `G${'A'.repeat(55)}`;

async function fillPaymentForm() {
  fireEvent.change(screen.getByPlaceholderText('GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'), {
    target: { value: recipientAddress },
  });
  fireEvent.change(screen.getByPlaceholderText('0.00'), {
    target: { value: '1.25' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Review Payment|Send Payment/i }));
  await screen.findByRole('dialog');
}

describe('SendPaymentForm review and result states', () => {
  it('requires explicit confirmation and submits the exact reviewed values', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ status: 'submitted', transactionHash: 'hash-123' });
    const onCheckStatus = vi.fn();
    render(<SendPaymentForm contacts={[]} onSubmit={onSubmit} onCheckStatus={onCheckStatus} />);

    await fillPaymentForm();

    expect(onSubmit).not.toHaveBeenCalled();
    const dialogText = screen.getByRole('dialog').textContent ?? '';
    expect(dialogText).toContain(recipientAddress);
    expect(dialogText).toContain('1.25 XLM');
    expect(dialogText).toContain('No memo');
    expect(dialogText).toContain('Network unknown');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }));
    await screen.findByText('Payment submitted');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      recipientAddress,
      amount: '1.25',
      tokenType: 'XLM',
      memoType: 'none',
    });
    expect(onSubmit.mock.calls[0][1]).toEqual(expect.any(String));
    expect(screen.getByText('hash-123')).toBeTruthy();
  });

  it('allows returning to edit without losing the entered payment', async () => {
    render(<SendPaymentForm contacts={[]} onSubmit={vi.fn()} onCheckStatus={vi.fn()} />);
    await fillPaymentForm();

    fireEvent.click(screen.getByRole('button', { name: 'Return to edit' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByPlaceholderText('0.00') as HTMLInputElement).value).toBe('1.25');
    expect((screen.getByPlaceholderText('GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890') as HTMLInputElement).value).toBe(recipientAddress);
  });

  it('offers status checking, not a second send, after an uncertain result', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSubmit = vi.fn().mockRejectedValue(new PaymentOutcomeUnknownError('Outcome unknown'));
    const onCheckStatus = vi.fn().mockResolvedValue({ status: 'confirmed', transactionId: 'tx-456' });
    render(<SendPaymentForm contacts={[]} onSubmit={onSubmit} onCheckStatus={onCheckStatus} />);

    await fillPaymentForm();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }));
    await screen.findByText('Payment status unknown');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
    await screen.findByText('Payment confirmed');

    expect(onCheckStatus).toHaveBeenCalledWith(onSubmit.mock.calls[0][1]);
    expect(screen.getByText('tx-456')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
