// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/types';
import { ConversationExportMenu } from './ConversationExportMenu';

const messages: ChatMessage[] = [
  { id: 'm1', type: 'user', content: 'hello', timestamp: '2026-10-28T09:00:00.000Z' },
  {
    id: 'm2',
    type: 'agent',
    content: 'hi there',
    timestamp: '2026-10-28T09:00:01.000Z',
    metadata: { status: 'success' },
  },
];
const fixedNow = () => new Date('2026-10-28T12:00:00.000Z');

describe('ConversationExportMenu', () => {
  it('downloads the active conversation as Markdown', () => {
    const onDownload = vi.fn();
    render(
      <ConversationExportMenu
        messages={messages}
        conversationId="conv-1"
        title="Greetings"
        onDownload={onDownload}
        now={fixedNow}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));

    expect(onDownload).toHaveBeenCalledOnce();
    const [fileName, content, mimeType] = onDownload.mock.calls[0];
    expect(fileName).toBe('chenpilot-conversation-conv-1-2026-10-28.md');
    expect(mimeType).toBe('text/markdown;charset=utf-8');
    expect(content).toContain('# Greetings');
    expect(content).toContain('## User · 2026-10-28T09:00:00.000Z');
    expect(content).toContain('hi there');
  });

  it('downloads JSON that parses back to the same messages', () => {
    const onDownload = vi.fn();
    render(
      <ConversationExportMenu
        messages={messages}
        conversationId="conv-1"
        onDownload={onDownload}
        now={fixedNow}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));

    const [fileName, content, mimeType] = onDownload.mock.calls[0];
    expect(fileName).toBe('chenpilot-conversation-conv-1-2026-10-28.json');
    expect(mimeType).toBe('application/json;charset=utf-8');
    expect(JSON.parse(content)).toEqual(messages);
  });

  it('disables both actions with a tooltip for an empty conversation', () => {
    const onDownload = vi.fn();
    render(<ConversationExportMenu messages={[]} conversationId="conv-1" onDownload={onDownload} />);

    for (const name of ['Markdown', 'JSON']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', expect.stringMatching(/Nothing to export/));
      fireEvent.click(button);
    }
    expect(onDownload).not.toHaveBeenCalled();
  });
});
