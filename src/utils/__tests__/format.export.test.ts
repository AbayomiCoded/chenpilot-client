import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/types';
import {
  conversationExportFileName,
  serializeConversationJson,
  serializeConversationMarkdown,
} from '../format';

const text: ChatMessage = {
  id: 'm1',
  type: 'user',
  content: 'Send 10 XLM to Ada',
  timestamp: '2026-10-28T09:00:00.000Z',
};

const structured: ChatMessage = {
  id: 'm2',
  type: 'agent',
  content: '{"action":"transfer","amount":"10","asset":"XLM"}',
  timestamp: '2026-10-28T09:00:03.000Z',
  metadata: {
    status: 'success',
    amount: '10',
    tokenType: 'XLM',
    transactionHash: 'abc123',
    tempId: 'temp-1',
    delivery: 'sent',
    rawData: { nested: { ok: true } },
  },
};

const traced: ChatMessage = {
  id: 'm3',
  type: 'agent',
  content: 'Done.',
  timestamp: '2026-10-28T09:00:05.000Z',
  metadata: {
    executionTrace: {
      startTime: '2026-10-28T09:00:03.000Z',
      endTime: '2026-10-28T09:00:05.000Z',
      totalTime: 2000,
      steps: [
        {
          id: 's1',
          name: 'Plan transfer',
          type: 'thought',
          timestamp: '2026-10-28T09:00:03.100Z',
          duration: 300,
          description: 'Resolve the recipient',
          substeps: [
            {
              id: 's1a',
              name: 'Lookup contact',
              type: 'tool_call',
              timestamp: '2026-10-28T09:00:03.200Z',
              duration: 120,
              description: 'Found Ada',
            },
          ],
        },
        {
          id: 's2',
          name: 'Submit payment',
          type: 'action',
          timestamp: '2026-10-28T09:00:04.000Z',
          duration: 1500,
          description: 'Signed and submitted',
        },
      ],
    },
  },
};

describe('conversationExportFileName', () => {
  it('is deterministic for an id, format and date', () => {
    const date = new Date('2026-10-28T23:59:59.000Z');
    expect(conversationExportFileName('abc123', 'markdown', date)).toBe(
      'chenpilot-conversation-abc123-2026-10-28.md',
    );
    expect(conversationExportFileName('abc123', 'json', '2026-10-28T01:00:00.000Z')).toBe(
      'chenpilot-conversation-abc123-2026-10-28.json',
    );
  });

  it('keeps path-like or empty ids out of the file name', () => {
    const date = new Date('2026-10-28T00:00:00.000Z');
    expect(conversationExportFileName('../../etc/passwd', 'json', date)).toBe(
      'chenpilot-conversation-etc-passwd-2026-10-28.json',
    );
    expect(conversationExportFileName('///', 'json', date)).toBe(
      'chenpilot-conversation-conversation-2026-10-28.json',
    );
  });
});

describe('serializeConversationJson', () => {
  it('serialises an empty conversation as an empty array', () => {
    expect(JSON.parse(serializeConversationJson([]))).toEqual([]);
  });

  it('round-trips ChatMessage[] without losing metadata fields', () => {
    const messages = [text, structured, traced];
    expect(JSON.parse(serializeConversationJson(messages))).toEqual(messages);
  });
});

describe('serializeConversationMarkdown', () => {
  it('has only a title for an empty conversation', () => {
    expect(serializeConversationMarkdown([])).toBe('# ChenPilot conversation\n');
  });

  it('writes role headings, ISO timestamps and plain text for text-only messages', () => {
    const md = serializeConversationMarkdown([text], { title: 'Payments' });
    expect(md).toContain('# Payments');
    expect(md).toContain('## User · 2026-10-28T09:00:00.000Z');
    expect(md).toContain('Send 10 XLM to Ada');
    expect(md).not.toContain('```');
  });

  it('fences structured content and lists metadata', () => {
    const md = serializeConversationMarkdown([structured]);
    expect(md).toContain('## Agent · 2026-10-28T09:00:03.000Z');
    expect(md).toContain('```json\n{\n  "action": "transfer",\n  "amount": "10",\n  "asset": "XLM"\n}\n```');
    expect(md).toContain('- Transaction: `abc123`');
    expect(md).toContain('- Amount: 10 XLM');
    expect(md).toContain('- Status: success');
  });

  it('uses a longer fence when the content contains backticks', () => {
    const md = serializeConversationMarkdown([
      { ...structured, content: '{"note":"use ``` carefully"}' },
    ]);
    expect(md).toContain('````json');
  });

  it('summarises an execution trace, including substeps', () => {
    expect(serializeConversationMarkdown([traced], { title: 'Trace' })).toMatchSnapshot();
  });

  it('uses the transcript for voice messages', () => {
    const md = serializeConversationMarkdown([
      {
        id: 'v1',
        type: 'user',
        messageType: 'voice',
        content: '',
        timestamp: '2026-10-28T09:10:00.000Z',
        voice: { audioUrl: 'data:audio/webm;base64,AAAA', duration: 4, mimeType: 'audio/webm', transcript: 'pay Ada', sizeBytes: 3 },
      },
    ]);
    expect(md).toContain('pay Ada');
    expect(md).not.toContain('base64');
  });
});
