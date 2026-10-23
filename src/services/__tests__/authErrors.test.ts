import { describe, it, expect } from 'vitest';
import { normalizeAuthError, isNormalizedAuthError } from '../auth.service';

const FIELDS = ['name', 'email', 'password'] as const;
const axiosError = (status: number, data: unknown) => ({ message: `Request failed with status code ${status}`, response: { status, data } });

describe('normalizeAuthError (#258)', () => {
  it('maps an object of field errors onto known fields', () => {
    const result = normalizeAuthError(
      axiosError(422, { message: 'Validation failed', errors: { email: 'Email is already registered', password: ['Too short', 'Needs a number'] } }),
      FIELDS,
    );

    expect(result).toEqual({
      status: 422,
      message: 'Validation failed',
      fieldErrors: { email: 'Email is already registered', password: 'Too short' },
    });
  });

  it('maps express-validator style arrays', () => {
    const result = normalizeAuthError(
      axiosError(400, { errors: [{ param: 'email', msg: 'Invalid email' }, { field: 'name', message: 'Name too long' }] }),
      FIELDS,
    );
    expect(result.fieldErrors).toEqual({ email: 'Invalid email', name: 'Name too long' });
    expect(result.message).toBe('Please correct the highlighted fields.');
  });

  it('maps zod style issues with path arrays and nested paths', () => {
    const result = normalizeAuthError(
      axiosError(400, { details: [{ path: ['body', 'email'], message: 'Required' }, { path: 'user.password', message: 'Weak' }] }),
      FIELDS,
    );
    expect(result.fieldErrors).toEqual({ email: 'Required', password: 'Weak' });
  });

  it('applies server field aliases', () => {
    const result = normalizeAuthError(axiosError(400, { errors: { username: 'Unknown user', fullName: 'Too long' } }), FIELDS);
    expect(result.fieldErrors).toEqual({ email: 'Unknown user', name: 'Too long' });
  });

  it('keeps the first message per field and folds unknown fields into the general message', () => {
    const result = normalizeAuthError(
      axiosError(400, { errors: [{ field: 'email', message: 'first' }, { field: 'email', message: 'second' }, { field: 'captcha', message: 'Captcha failed' }] }),
      FIELDS,
    );
    expect(result.fieldErrors).toEqual({ email: 'first' });
    expect(result.message).toBe('Captcha failed');
  });

  it('never echoes the submitted password in field or general messages', () => {
    const password = 'Hunter2!Secret';
    const result = normalizeAuthError(
      axiosError(400, {
        message: `Password ${password} does not meet policy`,
        errors: [{ field: 'password', message: `"${password}" is too common`, value: password }],
      }),
      FIELDS,
      [password],
    );

    expect(JSON.stringify(result)).not.toContain(password);
    expect(result.fieldErrors.password).toBe('"••••••" is too common');
  });

  it('uses a safe generic message for unstructured server errors', () => {
    expect(normalizeAuthError(axiosError(500, '<html>oops</html>'), FIELDS).message).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('explains network failures', () => {
    expect(normalizeAuthError(new Error('Network Error'), FIELDS).message).toMatch(/Can't reach the server/);
  });

  it('recognizes normalized payloads', () => {
    expect(isNormalizedAuthError({ message: 'x', fieldErrors: {} })).toBe(true);
    expect(isNormalizedAuthError('x')).toBe(false);
    expect(isNormalizedAuthError(null)).toBe(false);
  });
});
