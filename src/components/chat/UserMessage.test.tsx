import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '@/types';

vi.mock('@/store', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ chat: { pendingMessages: new Set<string>() } }),
}));

import UserMessage from './UserMessage';

const message = (delivery?: NonNullable<ChatMessage['metadata']>['delivery']): ChatMessage => ({
  id: 'm1',
  type: 'user',
  content: 'send 5 XLM',
  timestamp: '2026-01-01T00:00:00Z',
  metadata: delivery ? { delivery } : undefined,
});

describe('UserMessage delivery state (#266)', () => {
  it('offers retry only for failed messages', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<UserMessage message={message('failed')} onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Not sent');
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));

    for (const delivery of ['queued', 'sending', 'sent'] as const) {
      rerender(<UserMessage message={message(delivery)} onRetry={onRetry} />);
      expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    }
  });

  it('shows queued and sending states', () => {
    const { rerender, container } = render(<UserMessage message={message('queued')} />);
    expect(screen.getByText(/Queued/)).toBeInTheDocument();

    rerender(<UserMessage message={message('sending')} />);
    expect(screen.getByText('Sending...')).toBeInTheDocument();

    rerender(<UserMessage message={message('sent')} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('[data-delivery="sent"]')).not.toBeNull();
  });
});
