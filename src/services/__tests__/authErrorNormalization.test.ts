/**
 * Tests for privacy-safe auth error normalization.
 *
 * All login and registration errors must collapse to a single generic message
 * so that an attacker cannot determine whether a given email address is enrolled
 * (account-enumeration resistance).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import authService, {
  GENERIC_AUTH_ERROR,
  GENERIC_REGISTER_ERROR,
  ACCOUNT_EXISTENCE_PATTERNS,
} from '../auth.service';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// normalizeLoginError
// ---------------------------------------------------------------------------

describe('AuthService.normalizeLoginError', () => {
  it('returns the generic message for a plain string error', () => {
    expect(authService.normalizeLoginError('Something went wrong')).toBe(GENERIC_AUTH_ERROR);
  });

  it('returns the generic message when error is undefined', () => {
    expect(authService.normalizeLoginError(undefined)).toBe(GENERIC_AUTH_ERROR);
  });

  it('returns the generic message for "user not found" backend text', () => {
    expect(
      authService.normalizeLoginError(new Error('User not found'))
    ).toBe(GENERIC_AUTH_ERROR);
  });

  it('returns the generic message for "invalid credentials" backend text', () => {
    expect(
      authService.normalizeLoginError(new Error('Invalid credentials'))
    ).toBe(GENERIC_AUTH_ERROR);
  });

  it('returns the generic message for "Incorrect email or password"', () => {
    expect(
      authService.normalizeLoginError(new Error('Incorrect email or password'))
    ).toBe(GENERIC_AUTH_ERROR);
  });

  it('returns the generic message for HTTP 401 AxiosError-like', () => {
    const axiosLike = { response: { status: 401, data: { message: 'Unauthorized' } } };
    expect(authService.normalizeLoginError(axiosLike)).toBe(GENERIC_AUTH_ERROR);
  });

  it('returns the generic message for network/timeout errors (no enumeration leak)', () => {
    const networkErr = { message: 'Network Error' };
    expect(authService.normalizeLoginError(networkErr)).toBe(GENERIC_AUTH_ERROR);
  });

  it('logs the raw error internally (redacted from user)', () => {
    const spy = vi.spyOn(console, 'error');
    authService.normalizeLoginError(new Error('User not found'));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[auth] login error (internal):'),
      expect.any(String)
    );
  });

  it('does not expose account-existence signal in the returned string', () => {
    const accountExistenceErrors = [
      'User not found',
      'Account not found',
      'No account found',
      'Invalid credentials',
      'Incorrect password',
      'Email already exists',
      'Already registered',
      'Duplicate email',
      'Email taken',
    ];
    for (const msg of accountExistenceErrors) {
      const result = authService.normalizeLoginError(new Error(msg));
      expect(result).not.toMatch(/not found|already|duplicate|taken|incorrect|invalid credential/i);
    }
  });
});

// ---------------------------------------------------------------------------
// normalizeRegisterError
// ---------------------------------------------------------------------------

describe('AuthService.normalizeRegisterError', () => {
  it('returns the generic registration message for a plain error', () => {
    expect(authService.normalizeRegisterError(new Error('Registration failed'))).toBe(
      GENERIC_REGISTER_ERROR
    );
  });

  it('returns the generic message for "email already taken"', () => {
    expect(
      authService.normalizeRegisterError(new Error('Email already taken'))
    ).toBe(GENERIC_REGISTER_ERROR);
  });

  it('returns the generic message for HTTP 409 conflict (email exists)', () => {
    const conflict = { response: { status: 409, data: { message: 'Email already in use' } } };
    expect(authService.normalizeRegisterError(conflict)).toBe(GENERIC_REGISTER_ERROR);
  });

  it('returns the generic message for nested response.data.message', () => {
    const axiosLike = {
      message: 'Request failed with status code 409',
      response: { status: 409, data: { message: 'Duplicate email' } },
    };
    expect(authService.normalizeRegisterError(axiosLike)).toBe(GENERIC_REGISTER_ERROR);
  });

  it('logs the raw error internally', () => {
    const spy = vi.spyOn(console, 'error');
    authService.normalizeRegisterError(new Error('Email already in use'));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[auth] register error (internal):'),
      expect.any(String)
    );
  });

  it('does not expose email-existence information in the returned string', () => {
    const triggers = [
      'email already exists',
      'already registered',
      'duplicate email',
      'Email taken',
    ];
    for (const msg of triggers) {
      const result = authService.normalizeRegisterError(new Error(msg));
      expect(result).not.toMatch(/already|duplicate|taken|exists/i);
    }
  });
});

// ---------------------------------------------------------------------------
// ACCOUNT_EXISTENCE_PATTERNS export sanity
// ---------------------------------------------------------------------------

describe('ACCOUNT_EXISTENCE_PATTERNS', () => {
  it('covers common backend account-existence messages', () => {
    const samples = [
      'user not found',
      'User Not Found',
      'account not found',
      'No account found for this email',
      'Invalid credentials',
      'invalid credential',
      'Incorrect email',
      'Incorrect password',
      'incorrect credentials',
      'Email already exists',
      'email already registered',
      'Email already taken',
      'email already in use',
      'Already registered',
      'duplicate email',
      'Duplicate account',
      'email taken',
    ];

    for (const sample of samples) {
      const matched = ACCOUNT_EXISTENCE_PATTERNS.some((re) => re.test(sample));
      expect(matched, `expected pattern to match: "${sample}"`).toBe(true);
    }
  });
});
