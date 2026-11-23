import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '@/types';

const { checkBeforeRetry } = vi.hoisted(() => ({ checkBeforeRetry: vi.fn() }));

vi.mock('@/services/agentService', () => ({
  agentService: { checkBeforeRetry },
  default: { checkBeforeRetry },
}));

import { AgentRetryAction } from './AgentRetryAction';

const failed = (meta: Partial<NonNullable<ChatMessage['metadata']>> = {}): ChatMessage => ({
  id: 'msg_err_1',
  type: 'agent',
  content: "I'm having trouble connecting.",
  timestamp: '2024-01-01T12:00:00Z',
  metadata: {
    success: false,
    status: 'failed',
    errorKind: 'network',
    retryable: true,
    retryPrompt: 'What is my XLM balance?',
    retryTempId: 'msg_optimistic_1',
    requestId: 'agent_req_1',
    stateChanging: false,
    ...meta,
  },
});

const setup = (message: ChatMessage) => {
  const onRetry = vi.fn();
  const onResolve = vi.fn();
  const utils = render(<AgentRetryAction message={message} onRetry={onRetry} onResolve={onResolve} />);
  return { onRetry, onResolve, ...utils };
};

describe('AgentRetryAction (#262)', () => {
  beforeEach(() => {
    checkBeforeRetry.mockReset();
  });

  it.each([
    ['invalid query', { retryable: false, errorKind: 'invalid_query' as const }],
    ['not authenticated', { retryable: false, errorKind: 'unauthenticated' as const }],
    ['successful reply', { retryable: undefined, success: true, status: 'success' as const }],
    ['missing prompt', { retryPrompt: undefined }],
  ])('is hidden for an ineligible failure: %s', (_label, meta) => {
    const { container } = setup(failed(meta));
    expect(container).toBeEmptyDOMElement();
  });

  it('retries a read-only prompt directly with the original message', async () => {
    checkBeforeRetry.mockResolvedValue({ action: 'retry' });
    const message = failed();
    const { onRetry } = setup(message);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(onRetry).toHaveBeenCalledWith(message));
    expect(checkBeforeRetry).toHaveBeenCalledWith('agent_req_1', false);
    expect(onRetry.mock.calls[0][0].metadata.retryPrompt).toBe('What is my XLM balance?');
  });

  it('does not resend a state-changing prompt that already completed', async () => {
    checkBeforeRetry.mockResolvedValue({
      action: 'completed',
      result: { success: true, data: 'Sent 20 XLM', transactionHash: 'tx_1' },
    });
    const { onRetry, onResolve } = setup(failed({ stateChanging: true, retryPrompt: 'send 20 XLM to GABC' }));

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(onResolve).toHaveBeenCalled());
    expect(checkBeforeRetry).toHaveBeenCalledWith('agent_req_1', true);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onResolve.mock.calls[0][0]).toMatchObject({
      content: 'Sent 20 XLM',
      metadata: { success: true, retryable: false, transactionHash: 'tx_1' },
    });
  });

  it('holds off while the original attempt is still pending', async () => {
    checkBeforeRetry.mockResolvedValue({ action: 'pending' });
    const { onRetry } = setup(failed({ stateChanging: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(/still being processed/)).toBeInTheDocument();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation when status is unknown', async () => {
    checkBeforeRetry.mockResolvedValue({ action: 'confirm' });
    const { onRetry } = setup(failed({ stateChanging: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/couldn't confirm/)).toBeInTheDocument();
    expect(onRetry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry anyway' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('retries a state-changing prompt the backend reports as failed', async () => {
    checkBeforeRetry.mockResolvedValue({ action: 'retry' });
    const { onRetry } = setup(failed({ stateChanging: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });
});
