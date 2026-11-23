import { describe, it, expect } from "vitest";
import {
  emailSchema,
  passwordSchema,
  resetPasswordSchema,
  nameSchema,
  stellarAddressSchema,
  tokenAmountSchema,
  createContactSchema,
  sendPaymentSchema,
  validateSendPayment,
  validateMemo,
  sanitizePaymentInput,
  getAssetPrecision,
  getPaymentFailureMessage,
} from "../validation";
import { SUPPORTED_ASSETS } from "@/types";

// #141 — table-driven tests for validation schemas.

describe("emailSchema", () => {
  const valid = ["user@example.com", "a.b@c.d.com", "x@y.io"];
  const invalid = ["", "no-at-sign", "no-domain@", "@no-local.com", "two@@at.com"];
  for (const e of valid) {
    it(`accepts "${e}"`, () => {
      expect(emailSchema.safeParse(e).success).toBe(true);
    });
  }
  for (const e of invalid) {
    it(`rejects "${e}"`, () => {
      const r = emailSchema.safeParse(e);
      expect(r.success).toBe(false);
    });
  }
  it("reports 'Email is required' on empty", () => {
    expect(emailSchema.safeParse("").error?.issues[0]?.message).toBe("Email is required");
  });
});

describe("passwordSchema", () => {
  const valid = ["Password1!", "Sup3r$ecure", "A1!aaaaa", "longEnough1@"];
  const invalid = [
    "short1!",       // < 8 chars
    "alllowercase1!",// no uppercase
    "ALLUPPER1!",    // no lowercase
    "NoSpecialNum1", // no special char
    "NoNumber!",     // no number
  ];
  for (const p of valid) {
    it(`accepts "${p}"`, () => {
      expect(passwordSchema.safeParse(p).success).toBe(true);
    });
  }
  for (const p of invalid) {
    it(`rejects "${p}"`, () => {
      expect(passwordSchema.safeParse(p).success).toBe(false);
    });
  }
});

describe("resetPasswordSchema", () => {
  it("rejects a weak reset password", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "weak",
        confirmPassword: "weak",
      }).success,
    ).toBe(false);
  });
});

describe("nameSchema", () => {
  it("accepts valid names", () => {
    expect(nameSchema.safeParse("Alice").success).toBe(true);
    expect(nameSchema.safeParse("Bob-Smith").success).toBe(true);
  });
  it("rejects short or empty names", () => {
    expect(nameSchema.safeParse("").success).toBe(false);
    expect(nameSchema.safeParse("A").success).toBe(false);
  });
  it("rejects names that are too long", () => {
    expect(nameSchema.safeParse("A".repeat(101)).success).toBe(false);
  });
});

describe("stellarAddressSchema", () => {
  const validG = "G" + "A".repeat(55); // 56 chars, starts with G
  const invalid = [
    "",
    "G123",                         // too short
    "0x" + "0".repeat(40),          // ethereum address
    "M" + "A".repeat(55),          // starts with M (muxed, not supported here)
    "G" + "A".repeat(56),          // too long
    "g" + "A".repeat(55),          // lowercase
  ];
  it("accepts valid 56-char G-address", () => {
    expect(stellarAddressSchema.safeParse(validG).success).toBe(true);
  });
  for (const a of invalid) {
    it(`rejects "${a}"`, () => {
      expect(stellarAddressSchema.safeParse(a).success).toBe(false);
    });
  }
});

describe("tokenAmountSchema", () => {
  const valid = ["1", "0.5", "100.1234567", "1000000"];
  const invalid = [
    "",
    "0",          // must be > 0
    "-1",         // negative
    "abc",        // non-numeric
    "0.00000001", // below min
    "1000001",    // above max
  ];
  for (const a of valid) {
    it(`accepts "${a}"`, () => {
      expect(tokenAmountSchema.safeParse(a).success).toBe(true);
    });
  }
  for (const a of invalid) {
    it(`rejects "${a}"`, () => {
      expect(tokenAmountSchema.safeParse(a).success).toBe(false);
    });
  }
});

describe("createContactSchema", () => {
  const valid = {
    name: "Alice",
    address: "G" + "A".repeat(55),
    tokenType: "XLM" as const,
  };
  it("accepts a valid contact", () => {
    expect(createContactSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects missing name", () => {
    const r = createContactSchema.safeParse({ ...valid, name: "" });
    expect(r.success).toBe(false);
  });
  it("rejects invalid tokenType", () => {
    const r = createContactSchema.safeParse({ ...valid, tokenType: "DOGE" });
    expect(r.success).toBe(false);
  });
  it("rejects invalid address", () => {
    const r = createContactSchema.safeParse({ ...valid, address: "bad" });
    expect(r.success).toBe(false);
  });
});

describe("#344 — sendPaymentSchema and Memo Validation", () => {
  const validStellarAddress = "G" + "A".repeat(55);
  const validBasePayment = {
    recipientAddress: validStellarAddress,
    amount: "10.5",
    tokenType: "XLM" as const,
  };

  describe("Base payment fields", () => {
    it("accepts valid payment without memo", () => {
      expect(sendPaymentSchema.safeParse(validBasePayment).success).toBe(true);
    });

    it("accepts valid payment with recipientContactId", () => {
      const data = { ...validBasePayment, recipientContactId: "contact-123" };
      expect(sendPaymentSchema.safeParse(data).success).toBe(true);
    });

    it("accepts all supported token types", () => {
      const tokens = ["XLM", "USDC", "USDT", "BTC", "ETH", "AQUA"] as const;
      for (const token of tokens) {
        expect(sendPaymentSchema.safeParse({ ...validBasePayment, tokenType: token }).success).toBe(true);
      }
    });

    it("rejects unsupported token types", () => {
      const invalidTokens = ["DOGE", "SOL", "ADA", ""];
      for (const token of invalidTokens) {
        const res = sendPaymentSchema.safeParse({ ...validBasePayment, tokenType: token as any });
        expect(res.success).toBe(false);
      }
    });

    it("rejects invalid recipient addresses", () => {
      const invalidAddresses = [
        "",
        "0x1234567890abcdef",
        "g" + validStellarAddress.slice(1),
        "GSHORT",
        "G" + "!".repeat(55),
      ];
      for (const addr of invalidAddresses) {
        expect(sendPaymentSchema.safeParse({ ...validBasePayment, recipientAddress: addr }).success).toBe(false);
      }
    });

    it("validates payment amount boundaries and precision", () => {
      // Valid amounts
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "0.0000001" }).success).toBe(true);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "1000000" }).success).toBe(true);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "50.1234567" }).success).toBe(true);

      // Malformed or out-of-range amounts
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "0" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "-5" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "0.00000001" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "1000001" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "abc" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "1.12345678" }).success).toBe(false);
    });
  });

  describe("Conditional memo behavior and memo types", () => {
    it("accepts memoType 'none' when memo is undefined or empty", () => {
      expect(
        sendPaymentSchema.safeParse({ ...validBasePayment, memoType: "none" }).success
      ).toBe(true);
      expect(
        sendPaymentSchema.safeParse({ ...validBasePayment, memo: "", memoType: "none" }).success
      ).toBe(true);
    });

    it("rejects non-empty memo when memoType is 'none'", () => {
      const res = sendPaymentSchema.safeParse({
        ...validBasePayment,
        memo: "Unexpected Memo",
        memoType: "none",
      });
      expect(res.success).toBe(false);
    });

    it("rejects non-empty memo when memoType is missing", () => {
      const res = sendPaymentSchema.safeParse({
        ...validBasePayment,
        memo: "Orphaned Memo",
      });
      expect(res.success).toBe(false);
    });

    describe("memoType: 'text'", () => {
      it("accepts valid text memo up to 28 characters", () => {
        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "text",
            memo: "Thanks for dinner",
          }).success
        ).toBe(true);

        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "text",
            memo: "A".repeat(28),
          }).success
        ).toBe(true);
      });

      it("rejects text memo exceeding 28 characters", () => {
        const res = sendPaymentSchema.safeParse({
          ...validBasePayment,
          memoType: "text",
          memo: "A".repeat(29),
        });
        expect(res.success).toBe(false);
      });
    });

    describe("memoType: 'id'", () => {
      it("accepts valid numeric ID memo", () => {
        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "id",
            memo: "1234567890",
          }).success
        ).toBe(true);

        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "id",
            memo: "18446744073709551615",
          }).success
        ).toBe(true);
      });

      it("rejects malformed non-numeric values for ID memo", () => {
        const invalidIds = ["abc", "12a34", "-100", "12.34", "12 34", "id#123"];
        for (const id of invalidIds) {
          const res = sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "id",
            memo: id,
          });
          expect(res.success).toBe(false);
        }
      });

      it("rejects numeric ID exceeding uint64 range", () => {
        const res = sendPaymentSchema.safeParse({
          ...validBasePayment,
          memoType: "id",
          memo: "18446744073709551616",
        });
        expect(res.success).toBe(false);
      });
    });

    describe("memoType: 'hash'", () => {
      const valid64Hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      it("accepts valid 64-character hex hash memo (both lowercase and uppercase)", () => {
        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "hash",
            memo: valid64Hex,
          }).success
        ).toBe(true);

        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "hash",
            memo: valid64Hex.toUpperCase(),
          }).success
        ).toBe(true);
      });

      it("rejects malformed hash values (wrong length or non-hex)", () => {
        const malformedHashes = [
          "abc",
          "a".repeat(63), // too short
          "a".repeat(65), // too long
          "g".repeat(64), // non-hex character 'g'
          "z".repeat(64), // non-hex character 'z'
          valid64Hex.slice(0, 63) + "!", // invalid symbol
        ];

        for (const hash of malformedHashes) {
          const res = sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "hash",
            memo: hash,
          });
          expect(res.success).toBe(false);
        }
      });
    });
  });

  describe("validateSendPayment utility", () => {
    it("returns isValid: true and empty errors on valid input", () => {
      const result = validateSendPayment({
        recipientAddress: validStellarAddress,
        amount: "5.0",
        tokenType: "XLM",
        memoType: "text",
        memo: "Invoice 101",
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("returns isValid: false and descriptive error messages on malformed input", () => {
      const result = validateSendPayment({
        recipientAddress: "bad_address",
        amount: "-10",
        tokenType: "INVALID_COIN",
        memoType: "id",
        memo: "not-a-number",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("validateMemo utility", () => {
    it("validates empty memo as true when memoType is none", () => {
      expect(validateMemo("", "none")).toBe(true);
      expect(validateMemo("", "text")).toBe(false);
    });

    it("validates text memo correctly", () => {
      expect(validateMemo("Valid note", "text")).toBe(true);
      expect(validateMemo("A".repeat(29), "text")).toBe(false);
    });

    it("validates id memo correctly", () => {
      expect(validateMemo("12345", "id")).toBe(true);
      expect(validateMemo("12a45", "id")).toBe(false);
    });

    it("validates hash memo correctly", () => {
      expect(validateMemo("a".repeat(64), "hash")).toBe(true);
      expect(validateMemo("a".repeat(63), "hash")).toBe(false);
      expect(validateMemo("g".repeat(64), "hash")).toBe(false);
    });
  });

  describe("sanitizePaymentInput utility", () => {
    it("trims whitespace and normalizes token and memo types", () => {
      const sanitized = sanitizePaymentInput({
        recipientAddress: "  " + validStellarAddress + "  ",
        amount: "  25.5  ",
        tokenType: "xlm",
        memoType: "TEXT",
        memo: "  Lunch  ",
        recipientContactId: "  c-1  ",
      });

      expect(sanitized).toEqual({
        recipientAddress: validStellarAddress,
        amount: "25.5",
        tokenType: "XLM",
        memoType: "text",
        memo: "Lunch",
        recipientContactId: "c-1",
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendPaymentSchema
// ─────────────────────────────────────────────────────────────────────────────
const G56 = "G" + "A".repeat(55);

describe('sendPaymentSchema', () => {
  const base = {
    recipientAddress: G56,
    amount: '10',
    tokenType: 'XLM' as const,
    memoType: 'none',
  };

  it('accepts a minimal valid payload', () => {
    expect(sendPaymentSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty recipient address', () => {
    const r = sendPaymentSchema.safeParse({ ...base, recipientAddress: '' });
    expect(r.success).toBe(false);
  });

  it('rejects amount of 0', () => {
    const r = sendPaymentSchema.safeParse({ ...base, amount: '0' });
    expect(r.success).toBe(false);
  });

  it('rejects a negative amount', () => {
    const r = sendPaymentSchema.safeParse({ ...base, amount: '-1' });
    expect(r.success).toBe(false);
  });

  it('rejects amount above max', () => {
    const r = sendPaymentSchema.safeParse({ ...base, amount: '9999999' });
    expect(r.success).toBe(false);
  });

  it.each(SUPPORTED_ASSETS)('accepts tokenType %s', (token) => {
    const r = sendPaymentSchema.safeParse({ ...base, tokenType: token });
    expect(r.success).toBe(true);
  });

  it('rejects an unsupported tokenType (STRK)', () => {
    const r = sendPaymentSchema.safeParse({ ...base, tokenType: 'STRK' as any });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('Unsupported token type');
  });

  it('rejects an unsupported tokenType (DAI)', () => {
    const r = sendPaymentSchema.safeParse({ ...base, tokenType: 'DAI' as any });
    expect(r.success).toBe(false);
  });

  it('rejects memo without memoType when memo is provided', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: 'hello',
      memoType: undefined,
    });
    expect(r.success).toBe(false);
  });

  it('accepts memo with memoType=text', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: 'hello',
      memoType: 'text',
    });
    expect(r.success).toBe(true);
  });

  it('rejects id memo with non-numeric content', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: 'abc',
      memoType: 'id',
    });
    expect(r.success).toBe(false);
  });

  it('accepts id memo with numeric content', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: '12345',
      memoType: 'id',
    });
    expect(r.success).toBe(true);
  });

  it('rejects hash memo shorter than 64 hex chars', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: 'abc',
      memoType: 'hash',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a 64-char hex hash memo', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: 'a'.repeat(64),
      memoType: 'hash',
    });
    expect(r.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createContactSchema — unified asset list
// ─────────────────────────────────────────────────────────────────────────────
describe('createContactSchema — unified asset list', () => {
  const base = { name: 'Alice', address: G56 };

  it.each(SUPPORTED_ASSETS)('accepts supported tokenType %s', (token) => {
    expect(createContactSchema.safeParse({ ...base, tokenType: token }).success).toBe(true);
  });

  it('rejects legacy tokenType STRK with actionable message', () => {
    const r = createContactSchema.safeParse({ ...base, tokenType: 'STRK' as any });
    expect(r.success).toBe(false);
    // Error message must list the supported tokens so the user knows what to use
    const messages = r.error?.issues.map((i) => i.message).join(' ');
    expect(messages).toContain('Unsupported token type');
  });

  it('rejects legacy tokenType DAI', () => {
    const r = createContactSchema.safeParse({ ...base, tokenType: 'DAI' as any });
    expect(r.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTED_ASSETS integrity
// ─────────────────────────────────────────────────────────────────────────────
describe('SUPPORTED_ASSETS', () => {
  it('includes at least one entry', () => {
    expect(SUPPORTED_ASSETS.length).toBeGreaterThan(0);
  });

  it('contains the expected tokens', () => {
    expect(SUPPORTED_ASSETS).toContain('XLM');
    expect(SUPPORTED_ASSETS).toContain('USDC');
    expect(SUPPORTED_ASSETS).toContain('USDT');
    expect(SUPPORTED_ASSETS).toContain('BTC');
    expect(SUPPORTED_ASSETS).toContain('ETH');
    expect(SUPPORTED_ASSETS).toContain('AQUA');
  });

  it('does not contain unsupported legacy tokens', () => {
    expect(SUPPORTED_ASSETS).not.toContain('STRK');
    expect(SUPPORTED_ASSETS).not.toContain('DAI');
  });
});

describe('sendPaymentSchema memo rules', () => {
  const payment = {
    recipientAddress: 'G' + 'A'.repeat(55),
    amount: '1',
    tokenType: 'XLM' as const,
  };

  it('omits stale memo values when memo type is none', () => {
    expect(sendPaymentSchema.safeParse({ ...payment, memo: 'stale', memoType: 'none' }).success).toBe(true);
    expect(sanitizePaymentInput({ ...payment, memo: 'stale', memoType: 'none' })).not.toHaveProperty('memo');
  });

  it('accepts text memo up to 28 UTF-8 bytes and rejects longer values', () => {
    expect(sendPaymentSchema.safeParse({ ...payment, memoType: 'text', memo: 'a'.repeat(28) }).success).toBe(true);
    expect(sendPaymentSchema.safeParse({ ...payment, memoType: 'text', memo: 'é'.repeat(15) }).success).toBe(false);
  });

  it('accepts numeric memo IDs within uint64 and rejects overflow or non-numeric values', () => {
    expect(sendPaymentSchema.safeParse({ ...payment, memoType: 'id', memo: '18446744073709551615' }).success).toBe(true);
    expect(sendPaymentSchema.safeParse({ ...payment, memoType: 'id', memo: '18446744073709551616' }).success).toBe(false);
    expect(sendPaymentSchema.safeParse({ ...payment, memoType: 'id', memo: '12x' }).success).toBe(false);
  });

  it('accepts exactly 32-byte hex hashes and rejects malformed hashes', () => {
    expect(sendPaymentSchema.safeParse({ ...payment, memoType: 'hash', memo: 'a'.repeat(64) }).success).toBe(true);
    expect(sendPaymentSchema.safeParse({ ...payment, memoType: 'hash', memo: 'a'.repeat(63) }).success).toBe(false);
  });

  it('requires a memo type when a memo is provided without one', () => {
    expect(sendPaymentSchema.safeParse({ ...payment, memo: 'untyped' }).success).toBe(false);
  });
});

describe('getPaymentFailureMessage', () => {
  it('explains reserve-related rejection in plain language', () => {
    expect(getPaymentFailureMessage(new Error('Insufficient balance to maintain reserve')))
      .toContain("Stellar's minimum account reserve");
  });
});

describe("payment precision validation", () => {
  const validAddress = G56;

  it("accepts XLM values within the asset precision limit", () => {
    const result = validateSendPayment({
      recipientAddress: validAddress,
      amount: "1.1234567",
      tokenType: "XLM",
    });

    expect(result.isValid).toBe(true);
  });

  it("rejects XLM values with too many fractional digits", () => {
    const result = validateSendPayment({
      recipientAddress: validAddress,
      amount: "1.12345678",
      tokenType: "XLM",
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.join(" ")).toContain("7 decimal");
  });

  it("applies the same precision rule to issued assets like USDC", () => {
    expect(getAssetPrecision("USDC")).toBe(7);

    const result = validateSendPayment({
      recipientAddress: validAddress,
      amount: "12.34567891",
      tokenType: "USDC",
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.join(" ")).toContain("7 decimal");
  });
});

describe("payment error guidance", () => {
  it("explains the activation requirement for unfunded destination errors", () => {
    const message = getPaymentFailureMessage({
      response: {
        data: {
          message: "Account does not exist. Activate the destination account first.",
        },
      },
    });

    expect(message).toContain("activate");
    expect(message).toContain("minimum balance");
  });
});
