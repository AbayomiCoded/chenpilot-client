import { AgentQueryResponse } from '@/types/agent';

/**
 * Agent response streaming protocol (#261). See docs/API_CONTRACT.md "Agent Response Streaming".
 *
 * Transport: `POST /query/stream` with `Accept: text/event-stream`, answered with Server-Sent Events.
 *   event: delta  data: {"requestId": "...", "seq": 0, "text": "partial chunk"}
 *   event: final  data: {"requestId": "...", "result": { success, data, error?, ... }}
 *   event: error  data: {"requestId": "...", "message": "..."}
 *
 * `delta.text` chunks are appended in `seq` order; a repeated or older `seq` is ignored.
 * `final.result` is authoritative and replaces the streamed text, so content is never shown twice.
 */
export type AgentStreamEvent =
  | { type: 'delta'; requestId?: string; seq: number; text: string }
  | { type: 'final'; requestId?: string; result: AgentQueryResponse['result'] }
  | { type: 'error'; requestId?: string; message: string };

export interface SseMessage {
  event: string;
  data: string;
}

/** Thrown when the backend has no streaming endpoint; the caller falls back to `POST /query`. */
export class StreamingUnsupportedError extends Error {
  constructor(message = 'Agent streaming is not supported by the backend') {
    super(message);
    this.name = 'StreamingUnsupportedError';
  }
}

/**
 * Incremental Server-Sent Events parser. Feed decoded text chunks of any size; complete
 * messages (terminated by a blank line) are returned as they become available.
 */
export class SseParser {
  private buffer = '';

  push(chunk: string): SseMessage[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    const messages: SseMessage[] = [];
    let boundary = this.buffer.indexOf('\n\n');

    while (boundary !== -1) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const message = parseBlock(block);
      if (message) messages.push(message);
      boundary = this.buffer.indexOf('\n\n');
    }
    return messages;
  }
}

function parseBlock(block: string): SseMessage | null {
  let event = 'message';
  const data: string[] = [];

  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue; // comment / keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }

  return data.length ? { event, data: data.join('\n') } : null;
}

/** Convert a raw SSE message into a typed stream event; unknown or malformed messages yield null. */
export function toStreamEvent(message: SseMessage): AgentStreamEvent | null {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(message.data);
  } catch {
    return null;
  }
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : undefined;

  switch (message.event) {
    case 'delta':
      if (typeof payload.text !== 'string' || typeof payload.seq !== 'number') return null;
      return { type: 'delta', requestId, seq: payload.seq, text: payload.text };
    case 'final': {
      const result = payload.result as AgentQueryResponse['result'] | undefined;
      if (!result || typeof result !== 'object') return null;
      return { type: 'final', requestId, result };
    }
    case 'error':
      return {
        type: 'error',
        requestId,
        message: typeof payload.message === 'string' ? payload.message : 'Agent stream failed',
      };
    default:
      return null;
  }
}

/** Accumulates delta text, ignoring duplicate or out-of-date sequence numbers. */
export class StreamTextAccumulator {
  private lastSeq = -1;
  private text = '';

  /** Returns true when the text changed. */
  apply(event: { seq: number; text: string }): boolean {
    if (event.seq <= this.lastSeq) return false;
    this.lastSeq = event.seq;
    this.text += event.text;
    return true;
  }

  get value(): string {
    return this.text;
  }
}
