import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../api', () => ({ default: { stepUpReauthenticate: vi.fn() } }));

import {
  getReauthChallenge,
  withRecentAuth,
  ReauthCancelledError,
  ReauthFailedError,
  ReauthTimeoutError,
} from '../auth.service';

const challenge = (status = 403) => ({ response: { status, data: { code: 'REAUTH_REQUIRED', maxAgeSeconds: 300 } } });

describe('getReauthChallenge (#255)', () => {
  it('recognizes the step-up challenge on 403 and 401', () => {
    expect(getReauthChallenge(challenge(403))).toEqual({ maxAgeSeconds: 300 });
    expect(getReauthChallenge(challenge(401))).toEqual({ maxAgeSeconds: 300 });
  });

  it('ignores other errors', () => {
    expect(getReauthChallenge({ response: { status: 403, data: { code: 'FORBIDDEN' } } })).toBeNull();
    expect(getReauthChallenge({ response: { status: 500, data: { code: 'REAUTH_REQUIRED' } } })).toBeNull();
    expect(getReauthChallenge(new Error('x'))).toBeNull();
  });
});

describe('withRecentAuth (#255)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the action without prompting when the server does not challenge', async () => {
    const run = vi.fn().mockResolvedValue('ok');
    const prompt = vi.fn();

    await expect(withRecentAuth('delete_account', run, prompt)).resolves.toBe('ok');
    expect(prompt).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('re-authenticates on challenge and retries the action once', async () => {
    const run = vi.fn().mockRejectedValueOnce(challenge()).mockResolvedValueOnce('deleted');
    const prompt = vi.fn().mockResolvedValue('Secret123');
    const reauthenticate = vi.fn().mockResolvedValue({});

    await expect(withRecentAuth('delete_account', run, prompt, { reauthenticate })).resolves.toBe('deleted');

    expect(prompt).toHaveBeenCalledWith({ action: 'delete_account', maxAgeSeconds: 300, error: undefined });
    expect(reauthenticate).toHaveBeenCalledWith('Secret123');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('cancels without re-authenticating or retrying', async () => {
    const run = vi.fn().mockRejectedValue(challenge());
    const reauthenticate = vi.fn();

    await expect(
      withRecentAuth('change_password', run, vi.fn().mockResolvedValue(null), { reauthenticate }),
    ).rejects.toBeInstanceOf(ReauthCancelledError);

    expect(reauthenticate).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('times out when the prompt is not answered', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockRejectedValue(challenge());
    const reauthenticate = vi.fn();

    const result = withRecentAuth('export_data', run, () => new Promise(() => {}), { timeoutMs: 1000, reauthenticate });
    const assertion = expect(result).rejects.toBeInstanceOf(ReauthTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    expect(reauthenticate).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('lets the user retry a wrong password, then succeeds', async () => {
    const run = vi.fn().mockRejectedValueOnce(challenge()).mockResolvedValueOnce('ok');
    const prompt = vi.fn().mockResolvedValueOnce('wrong').mockResolvedValueOnce('right');
    const reauthenticate = vi.fn()
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({});

    await expect(withRecentAuth('delete_account', run, prompt, { reauthenticate })).resolves.toBe('ok');
    expect(prompt).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'That password is incorrect. Try again.' }));
  });

  it('gives up after three wrong passwords', async () => {
    const run = vi.fn().mockRejectedValue(challenge());
    const reauthenticate = vi.fn().mockRejectedValue({ response: { status: 401 } });

    await expect(
      withRecentAuth('delete_account', run, vi.fn().mockResolvedValue('wrong'), { reauthenticate }),
    ).rejects.toBeInstanceOf(ReauthFailedError);
    expect(reauthenticate).toHaveBeenCalledTimes(3);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('fails if the server still challenges after re-authentication', async () => {
    const run = vi.fn().mockRejectedValue(challenge());
    await expect(
      withRecentAuth('delete_account', run, vi.fn().mockResolvedValue('pw'), { reauthenticate: vi.fn().mockResolvedValue({}) }),
    ).rejects.toBeInstanceOf(ReauthFailedError);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('passes other errors through untouched', async () => {
    const boom = { response: { status: 500 } };
    await expect(withRecentAuth('delete_account', vi.fn().mockRejectedValue(boom), vi.fn())).rejects.toBe(boom);
  });
});
