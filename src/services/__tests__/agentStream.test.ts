import { describe, it, expect } from 'vitest';
import { SseParser, StreamTextAccumulator, toStreamEvent } from '../agentStream';

describe('SseParser (#261)', () => {
  it('parses messages split across arbitrary chunk boundaries', () => {
    const parser = new SseParser();
    expect(parser.push('event: del')).toEqual([]);
    expect(parser.push('ta\ndata: {"seq":0,"text":"Hel"}\n')).toEqual([]);
    expect(parser.push('\nevent: delta\ndata: {"seq":1,"text":"lo"}\n\n')).toEqual([
      { event: 'delta', data: '{"seq":0,"text":"Hel"}' },
      { event: 'delta', data: '{"seq":1,"text":"lo"}' },
    ]);
  });

  it('handles CRLF line endings, comments and multi-line data', () => {
    const parser = new SseParser();
    const messages = parser.push(': keep-alive\r\n\r\nevent: final\r\ndata: {"a":\r\ndata: 1}\r\n\r\n');
    expect(messages).toEqual([{ event: 'final', data: '{"a":\n1}' }]);
  });

  it('defaults the event name to message', () => {
    expect(new SseParser().push('data: x\n\n')).toEqual([{ event: 'message', data: 'x' }]);
  });
});

describe('toStreamEvent (#261)', () => {
  it('maps delta, final and error events', () => {
    expect(toStreamEvent({ event: 'delta', data: '{"requestId":"r1","seq":2,"text":"hi"}' })).toEqual({
      type: 'delta', requestId: 'r1', seq: 2, text: 'hi',
    });
    expect(toStreamEvent({ event: 'final', data: '{"result":{"success":true,"data":"done"}}' })).toEqual({
      type: 'final', requestId: undefined, result: { success: true, data: 'done' },
    });
    expect(toStreamEvent({ event: 'error', data: '{"message":"boom"}' })).toEqual({
      type: 'error', requestId: undefined, message: 'boom',
    });
  });

  it('ignores malformed and unknown events', () => {
    expect(toStreamEvent({ event: 'delta', data: 'not json' })).toBeNull();
    expect(toStreamEvent({ event: 'delta', data: '{"text":"no seq"}' })).toBeNull();
    expect(toStreamEvent({ event: 'final', data: '{}' })).toBeNull();
    expect(toStreamEvent({ event: 'ping', data: '{}' })).toBeNull();
  });
});

describe('StreamTextAccumulator (#261)', () => {
  it('appends in order and ignores repeated or stale sequence numbers', () => {
    const acc = new StreamTextAccumulator();
    expect(acc.apply({ seq: 0, text: 'Swap' })).toBe(true);
    expect(acc.apply({ seq: 1, text: 'ping ' })).toBe(true);
    expect(acc.apply({ seq: 1, text: 'ping ' })).toBe(false);
    expect(acc.apply({ seq: 0, text: 'Swap' })).toBe(false);
    expect(acc.apply({ seq: 2, text: '10 XLM' })).toBe(true);
    expect(acc.value).toBe('Swapping 10 XLM');
  });
});
