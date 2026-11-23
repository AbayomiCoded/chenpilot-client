import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteConversationDialog } from './DeleteConversationDialog';
import { resetConversationRequests, trackConversationRequest } from '@/store/conversationRequests';

describe('DeleteConversationDialog (#269)', () => {
  beforeEach(() => resetConversationRequests());

  it('asks for confirmation before deleting', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeleteConversationDialog conversation={{ id: 'c1', title: 'Swaps' }} onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText(/Swaps.*and its messages will be removed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledWith('c1');
  });

  it('warns when a response is still in progress', () => {
    trackConversationRequest('c1');
    render(<DeleteConversationDialog conversation={{ id: 'c1', title: 'Swaps' }} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('A response is still in progress');
  });

  it('renders nothing when closed', () => {
    render(<DeleteConversationDialog conversation={null} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('Delete conversation?')).not.toBeInTheDocument();
  });
});
