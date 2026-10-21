import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import chatReducer, { addMessage, sendMessage, setMessageDelivery } from '../chatSlice';
import authReducer from '../authSlice';
import apiService from '@/services/api';

vi.mock('@/services/api', () => ({ default: { queryAgent: vi.fn() } }));

const createStore = () =>
  configureStore({
    reducer: { chat: chatReducer, auth: authReducer },
    preloadedState: { auth: { user: { id: 'user_1' }, isAuthenticated: true } as never },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });

const userRows = (store: ReturnType<typeof createStore>) =>
  store.getState().chat.messages.filter((m) => m.type === 'user');

describe('chat message delivery states (#266)', () => {
  beforeEach(() => {
    vi.mocked(apiService.queryAgent).mockReset();
    localStorage.clear();
  });

  it('moves a message sending → sent and adopts the server id without duplicating it', async () => {
    const store = createStore();
    let resolve: (value: unknown) => void = () => {};
    vi.mocked(apiService.queryAgent).mockReturnValue(new Promise((r) => { resolve = r; }) as never);

    const request = store.dispatch(sendMessage('hello'));
    expect(userRows(store)[0].metadata?.delivery).toBe('sending');

    resolve({ result: { success: true, data: 'hi', userMessageId: 'srv_42' } });
    await request;

    const rows = userRows(store);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'srv_42', metadata: { delivery: 'sent', serverId: 'srv_42' } });
  });

  it('keeps one row when the server copy arrived before the acknowledgement', async () => {
    const store = createStore();
    let resolve: (value: unknown) => void = () => {};
    vi.mocked(apiService.queryAgent).mockReturnValue(new Promise((r) => { resolve = r; }) as never);

    const request = store.dispatch(sendMessage('hello'));
    store.dispatch(addMessage({ id: 'srv_42', type: 'user', content: 'hello', timestamp: new Date().toISOString() }));
    resolve({ result: { success: true, data: 'hi', userMessageId: 'srv_42' } });
    await request;

    const rows = userRows(store);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('srv_42');
    expect(rows[0].metadata?.delivery).toBe('sent');
  });

  it('marks a message failed when the connection drops during send, and retry reuses the row', async () => {
    const store = createStore();
    vi.mocked(apiService.queryAgent).mockResolvedValueOnce({
      result: { success: false, data: "I'm having trouble connecting.", error: 'Network Error', delivered: false },
    } as never);

    await store.dispatch(sendMessage('send 5 XLM to GABC'));

    let rows = userRows(store);
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata?.delivery).toBe('failed');
    const failedId = rows[0].id;

    vi.mocked(apiService.queryAgent).mockResolvedValueOnce({ result: { success: true, data: 'Sent 5 XLM' } } as never);
    const retry = store.dispatch(sendMessage({ query: 'send 5 XLM to GABC', tempId: failedId }));
    expect(userRows(store)[0].metadata?.delivery).toBe('sending');
    await retry;

    rows = userRows(store);
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata?.delivery).toBe('sent');
  });

  it('also fails on a thrown network error', async () => {
    const store = createStore();
    vi.mocked(apiService.queryAgent).mockRejectedValueOnce(new Error('Network error: connection lost'));

    await store.dispatch(sendMessage('hi'));

    expect(userRows(store)[0].metadata?.delivery).toBe('failed');
  });

  it('counts a delivered request as sent even if the agent answered with an error', async () => {
    const store = createStore();
    vi.mocked(apiService.queryAgent).mockResolvedValueOnce({
      result: { success: false, data: "I didn't understand that.", error: 'invalid query', delivered: true },
    } as never);

    await store.dispatch(sendMessage('asdf'));

    expect(userRows(store)[0].metadata?.delivery).toBe('sent');
  });

  it('sends a queued message on the same row', async () => {
    const store = createStore();
    store.dispatch(addMessage({
      id: 'offline_1',
      type: 'user',
      content: 'balance?',
      timestamp: new Date().toISOString(),
      metadata: { delivery: 'queued', status: 'pending', optimisticId: 'offline_1', tempId: 'offline_1' },
    }));
    vi.mocked(apiService.queryAgent).mockResolvedValueOnce({ result: { success: true, data: '5 XLM' } } as never);

    await store.dispatch(sendMessage({ query: 'balance?', tempId: 'offline_1' }));

    const rows = userRows(store);
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata?.delivery).toBe('sent');
  });

  it('rejects invalid transitions', async () => {
    const store = createStore();
    vi.mocked(apiService.queryAgent).mockResolvedValueOnce({ result: { success: true, data: 'ok' } } as never);
    await store.dispatch(sendMessage('hi'));
    const id = userRows(store)[0].id;

    store.dispatch(setMessageDelivery({ id, delivery: 'queued' }));

    expect(userRows(store)[0].metadata?.delivery).toBe('sent');
  });
});
