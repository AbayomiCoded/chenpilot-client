import { describe, it, expect, vi } from 'vitest';

vi.mock('../api', () => ({ default: {} }));

import { normalizeEmail, toAuthPayload } from '../auth.service';
import { emailSchema, loginSchema } from '@/utils/validation';

describe('normalizeEmail (#259)', () => {
  it.each([
    ['ada@example.com', 'ada@example.com'],
    ['  ada@example.com  ', 'ada@example.com'],
    ['\tada@example.com\n', 'ada@example.com'],
    [' ada@example.com​', 'ada@example.com'],
    ['Ada.Lovelace@Example.COM', 'ada.lovelace@example.com'],
    [' MiXeD@CaSe.Io ', 'mixed@case.io'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it('does not apply provider-specific rules', () => {
    expect(normalizeEmail('first.last+tag@gmail.com')).toBe('first.last+tag@gmail.com');
    expect(normalizeEmail('user@googlemail.com')).toBe('user@googlemail.com');
  });

  it('does not touch inner characters', () => {
    expect(normalizeEmail('a b@example.com')).toBe('a b@example.com');
  });

  it('normalizes the email but never the password', () => {
    const payload = toAuthPayload({ email: ' Ada@Example.com ', password: '  Pass Word1 ', name: 'Ada' });
    expect(payload).toEqual({ email: 'ada@example.com', password: '  Pass Word1 ', name: 'Ada' });
  });
});

describe('email schema with surrounding whitespace (#259)', () => {
  it('accepts an email with accidental surrounding whitespace', () => {
    expect(emailSchema.safeParse('  ada@example.com ').success).toBe(true);
    expect(loginSchema.safeParse({ email: ' ada@example.com ', password: 'x' }).success).toBe(true);
  });

  it('treats whitespace-only input as missing', () => {
    expect(emailSchema.safeParse('   ').error?.issues[0]?.message).toBe('Email is required');
  });

  it('still rejects inner whitespace', () => {
    expect(emailSchema.safeParse('ada @example.com').success).toBe(false);
  });
});
