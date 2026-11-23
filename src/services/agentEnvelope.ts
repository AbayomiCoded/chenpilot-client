import type { AgentQueryResponse } from '@/types/agent';

/**
 * Supported `POST /query` response envelopes (#275). See docs/API_CONTRACT.md
 * "Agent Response Envelope". Anything else is a protocol error, never a silent success.
 *
 * Success: { "result": { "success": true,  "data": <string | object | array>, "error"?: null,
 *                        "executionTrace"?: object, "transactionHash"?: string, "metadata"?: object } }
 * Failure: { "result": { "success": false, "error": <string>, "data"?: <string> } }
 */

export const PROTOCOL_ERROR = 'protocol_error';
export const PROTOCOL_ERROR_MESSAGE =
  'The agent sent a response this app could not understand. Please try again.';

export type EnvelopeParseResult =
  | { ok: true; result: AgentQueryResponse['result'] }
  | { ok: false; reason: string };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validate a `/query` response body against the supported envelopes. */
export function parseAgentEnvelope(body: unknown): EnvelopeParseResult {
  if (!isPlainObject(body)) return { ok: false, reason: 'body is not an object' };
  const result = body.result;
  if (!isPlainObject(result)) return { ok: false, reason: 'missing result object' };
  if (typeof result.success !== 'boolean') return { ok: false, reason: 'result.success must be a boolean' };

  const { success, data, error, executionTrace, transactionHash, metadata } = result;

  if (success) {
    const validData = typeof data === 'string' || (typeof data === 'object' && data !== null);
    if (!validData) return { ok: false, reason: 'successful result has no data' };
    if (typeof data === 'string' && data.trim() === '') return { ok: false, reason: 'successful result has empty data' };
    if (error !== undefined && error !== null && error !== '') {
      return { ok: false, reason: 'successful result carries an error' };
    }
  } else {
    const hasError = typeof error === 'string' && error.length > 0;
    const hasMessage = typeof data === 'string' && data.length > 0;
    if (!hasError && !hasMessage) return { ok: false, reason: 'failed result has no error or message' };
    if (data !== undefined && data !== null && typeof data !== 'string') {
      return { ok: false, reason: 'failed result data must be a string' };
    }
  }

  if (executionTrace !== undefined && !isPlainObject(executionTrace)) {
    return { ok: false, reason: 'executionTrace must be an object' };
  }
  if (transactionHash !== undefined && transactionHash !== null && typeof transactionHash !== 'string') {
    return { ok: false, reason: 'transactionHash must be a string' };
  }
  if (metadata !== undefined && metadata !== null && !isPlainObject(metadata)) {
    return { ok: false, reason: 'metadata must be an object' };
  }

  const normalized = {
    ...result,
    success,
    data: success ? data : (typeof data === 'string' && data) || (error as string),
    error: success ? undefined : ((error as string) || undefined),
  } as AgentQueryResponse['result'];
  return { ok: true, result: normalized };
}

/** The failed result returned for a malformed envelope. */
export function protocolErrorResult(reason: string): AgentQueryResponse['result'] {
  return {
    success: false,
    data: PROTOCOL_ERROR_MESSAGE,
    error: `${PROTOCOL_ERROR}: ${reason}`,
  };
}
