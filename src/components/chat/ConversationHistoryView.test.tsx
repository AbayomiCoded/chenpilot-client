import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationHistoryView, ConversationHistoryViewProps } from './ConversationHistoryView';
import { ChatMessage } from '@/types';

const cached: ChatMessage[] = [
  { id: 'm1', type: 'user', content: 'What is my XLM balance?', timestamp: '2024-01-01T12:00:00Z' },
  { id: 'm2', type: 'agent', content: 'Your balance is 100 XLM', timestamp: '2024-01-01T12:00:01Z' },
];

const renderView = (props: Partial<ConversationHistoryViewProps> = {}) => {
  const onRetry = vi.fn();
  const onStartChat = vi.fn();
  render(
    <ConversationHistoryView
      messages={[]}
      status="succeeded"
      error={null}
      onRetry={onRetry}
      onStartChat={onStartChat}
      {...props}
    />,
  );
  return { onRetry, onStartChat };
};

describe('ConversationHistoryView (#265)', () => {
  it('shows a loading state while the first load is in flight', () => {
    renderView({ status: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading chat history');
    expect(screen.queryByText('No chat history yet')).not.toBeInTheDocument();
  });

  it('shows the empty state only when history loaded and is empty', () => {
    const { onStartChat } = renderView();
    expect(screen.getByText('No chat history yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Start new chat/ }));
    expect(onStartChat).toHaveBeenCalledTimes(1);
  });

  it('shows a dedicated error state with retry when loading fails and nothing is cached', () => {
    const { onRetry } = renderView({ status: 'failed', error: 'Request failed with status code 500' });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your chat history");
    expect(alert).toHaveAttribute('data-tone', 'error');
    expect(screen.queryByText('No chat history yet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps cached conversations visible with an inline retry when a refresh fails', () => {
    const { onRetry } = renderView({ messages: cached, status: 'failed', error: 'Network Error' });

    expect(screen.getByText('What is my XLM balance?')).toBeInTheDocument();
    expect(screen.getByText('Your balance is 100 XLM')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Showing saved conversations');
    expect(screen.getByRole('alert')).toHaveTextContent('Network Error');

    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows cached conversations without an error banner while refreshing', () => {
    renderView({ messages: cached, status: 'loading' });
    expect(screen.getByText('What is my XLM balance?')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ConversationHistoryView pagination (#264)', () => {
  it('offers to load older messages when more pages exist', () => {
    const onLoadOlder = vi.fn();
    renderView({ messages: cached, hasMore: true, onLoadOlder });

    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }));
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('disables the button while a page is loading', () => {
    renderView({ messages: cached, hasMore: true, isLoadingOlder: true, onLoadOlder: vi.fn() });
    expect(screen.getByRole('button', { name: /Loading older messages/ })).toBeDisabled();
  });

  it('shows a retry after an older page fails', () => {
    const onLoadOlder = vi.fn();
    renderView({ messages: cached, hasMore: true, olderError: 'Network Error', onLoadOlder });

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load older messages: Network Error");
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading older messages' }));
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('hides the control on the last page', () => {
    renderView({ messages: cached, hasMore: false, onLoadOlder: vi.fn() });
    expect(screen.queryByRole('button', { name: /older messages/ })).not.toBeInTheDocument();
  });
});
