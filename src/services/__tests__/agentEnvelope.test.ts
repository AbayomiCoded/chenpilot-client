import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockInstance } = vi.hoisted(() => ({
  mockInstance: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock('axios', () => ({
  default: { create: vi.fn(() => mockInstance) },
  create: vi.fn(() => mockInstance),
}));

import agentService from '../agentService';
import { parseAgentEnvelope, PROTOCOL_ERROR, PROTOCOL_ERROR_MESSAGE } from '../agentEnvelope';

describe('documented /query envelopes (#275)', () => {
  it.each([
    ['string data', { result: { success: true, data: 'Your balance is 100 XLM', error: null } }],
    ['object data', { result: { success: true, data: { vaults: [] } } }],
    ['array data', { result: { success: true, data: [{ asset: 'XLM' }] } }],
    [
      'all optional fields',
      {
        result: {
          success: true,
          data: 'Sent 10 XLM',
          transactionHash: 'abc123',
          executionTrace: { steps: [] },
          metadata: { type: 'wallet', action: 'transfer_xlm', amount: '10', asset: 'XLM' },
        },
      },
    ],
  ])('accepts a success envelope with %s', (_label, body) => {
    const parsed = parseAgentEnvelope(body);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.result.success).toBe(true);
      expect(parsed.result.data).toEqual(body.result.data);
      expect(parsed.result.error).toBeUndefined();
    }
  });

  it.each([
    ['error only', { result: { success: false, error: 'insufficient_funds' } }, 'insufficient_funds', 'insufficient_funds'],
    ['message and error', { result: { success: false, data: 'Not enough XLM', error: 'insufficient_funds' } }, 'Not enough XLM', 'insufficient_funds'],
    ['message only', { result: { success: false, data: 'Not enough XLM' } }, 'Not enough XLM', undefined],
  ])('accepts an error envelope with %s', (_label, body, data, error) => {
    const parsed = parseAgentEnvelope(body);
    expect(parsed).toEqual({ ok: true, result: expect.objectContaining({ success: false, data, error }) });
  });
});

describe('malformed /query payloads are protocol errors (#275)', () => {
  it.each([
    ['null body', null],
    ['string body', 'OK'],
    ['array body', [{ success: true }]],
    ['empty object', {}],
    ['result not an object', { result: 'done' }],
    ['result null', { result: null }],
    ['missing success', { result: { data: 'hi' } }],
    ['string success', { result: { success: 'true', data: 'hi' } }],
    ['success without data', { result: { success: true } }],
    ['success with null data', { result: { success: true, data: null } }],
    ['success with empty data', { result: { success: true, data: '   ' } }],
    ['success with an error', { result: { success: true, data: 'hi', error: 'boom' } }],
    ['failure without error or message', { result: { success: false } }],
    ['failure with object data', { result: { success: false, data: { x: 1 }, error: 'e' } }],
    ['non-object executionTrace', { result: { success: true, data: 'hi', executionTrace: 'trace' } }],
    ['numeric transactionHash', { result: { success: true, data: 'hi', transactionHash: 123 } }],
    ['array metadata', { result: { success: true, data: 'hi', metadata: [] } }],
  ])('rejects %s', (_label, body) => {
    expect(parseAgentEnvelope(body).ok).toBe(false);
  });
});

describe('AgentService.queryAgent envelope handling (#275)', () => {
  beforeEach(() => {
    mockInstance.post.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns documented successes unchanged', async () => {
    mockInstance.post.mockResolvedValue({ data: { result: { success: true, data: 'ok', transactionHash: 'tx' } } });
    const response = await agentService.queryAgent({ userId: 'u', query: 'q' });
    expect(response.result).toMatchObject({ success: true, data: 'ok', transactionHash: 'tx' });
  });

  it.each([
    ['plain text', 'Query processed'],
    ['bare object', { balance: 100 }],
    ['result without success flag', { result: { data: 'Sent!' } }],
  ])('never reports success for a %s body', async (_label, body) => {
    mockInstance.post.mockResolvedValue({ data: body });

    const response = await agentService.queryAgent({ userId: 'u', query: 'q' });

    expect(response.result.success).toBe(false);
    expect(response.result.data).toBe(PROTOCOL_ERROR_MESSAGE);
    expect(response.result.error).toMatch(new RegExp(`^${PROTOCOL_ERROR}: `));
  });
});
