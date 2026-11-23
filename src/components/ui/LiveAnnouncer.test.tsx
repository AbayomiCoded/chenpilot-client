import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastMock, storeState } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
  storeState: { auth: { isLoading: false }, ui: { retryStatus: null as null | Record<string, unknown> } },
}));

vi.mock('react-hot-toast', () => ({ default: toastMock }));

import { LiveAnnouncer, SILENT_TOAST } from './LiveAnnouncer';
import SendPaymentForm from '@/components/payment/SendPaymentForm';

const VALID_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const announcer = () => screen.getAllByTestId('live-announcer')[0];

describe('LiveAnnouncer (#307)', () => {
  it('announces pending/success politely and errors assertively', () => {
    const { rerender } = render(<LiveAnnouncer announcement={{ text: 'Sending payment…', tone: 'polite' }} />);
    expect(announcer()).toHaveAttribute('role', 'status');
    expect(announcer()).toHaveAttribute('aria-live', 'polite');
    expect(announcer()).toHaveTextContent('Sending payment…');

    rerender(<LiveAnnouncer announcement={{ text: 'Payment failed', tone: 'assertive' }} />);
    expect(announcer()).toHaveAttribute('role', 'alert');
    expect(announcer()).toHaveAttribute('aria-live', 'assertive');
  });

  it('keeps toasts silent so outcomes are not announced twice', () => {
    expect(SILENT_TOAST.ariaProps['aria-live']).toBe('off');
  });
});

describe('SendPaymentForm status announcements (#307)', () => {
  beforeEach(() => vi.clearAllMocks());

  const submit = async () => {
    fireEvent.change(screen.getByLabelText(/Recipient Address/i), { target: { value: VALID_ADDRESS } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /Review Payment|Send Payment/i }));
    const confirm = await screen.findByRole('button', { name: /Confirm and send/i }).catch(() => null);
    if (confirm) fireEvent.click(confirm);
  };

  it('announces pending then success', async () => {
    let finish: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<SendPaymentForm onSubmit={onSubmit} contacts={[]} />);

    await submit();
    await waitFor(() => expect(announcer()).toHaveTextContent('Sending payment…'));

    await act(async () => finish());
    await waitFor(() => expect(announcer()).toHaveTextContent('Payment sent.'));
  });

  it('announces a failure assertively, once', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Insufficient balance'));
    render(<SendPaymentForm onSubmit={onSubmit} contacts={[]} />);

    await submit();

    await waitFor(() => expect(announcer()).toHaveTextContent('Payment failed: Insufficient balance'));
    expect(announcer()).toHaveAttribute('aria-live', 'assertive');
    expect(toastMock.error).toHaveBeenCalledWith('Insufficient balance', SILENT_TOAST);
  });
});
