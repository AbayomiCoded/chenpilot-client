// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SendPaymentForm from './SendPaymentForm';

vi.mock('./ContactPicker', () => ({
  default: () => null,
}));

describe('SendPaymentForm offline behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the payment draft and offers retry after connectivity returns', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Request failed'));
    const { rerender } = render(
      <SendPaymentForm onSubmit={onSubmit} contacts={[]} isOnline={false} />,
    );

    const address = `G${'A'.repeat(55)}`;
    fireEvent.change(screen.getByPlaceholderText('GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'), {
      target: { value: address },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: '1' },
    });

    expect((screen.getByRole('button', { name: 'Unavailable offline' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<SendPaymentForm onSubmit={onSubmit} contacts={[]} isOnline />);
    const retryButton = await screen.findByRole('button', { name: 'Retry payment' });
    fireEvent.click(retryButton);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      recipientAddress: address,
      amount: '1',
    })));
    expect((screen.getByPlaceholderText('0.00') as HTMLInputElement).value).toBe('1');
    expect((screen.getByPlaceholderText('GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890') as HTMLInputElement).value).toBe(address);
  });
});
