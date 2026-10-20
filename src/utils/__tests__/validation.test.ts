import { describe, it, expect } from "vitest";
import {
  emailSchema,
  passwordSchema,
  nameSchema,
  stellarAddressSchema,
  tokenAmountSchema,
  createContactSchema,
  updateContactSchema,
  validateContactAddress,
  normalizeContactAddress,
  validateContact,
  validateUpdateContact,
} from "../validation";

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
  const valid = ["Abcdefg1", "Password1", "UPPERlower9"];
  const invalid = ["", "short", "alllowercase1", "ALLUPPER1", "NoDigitsHere"];
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
  it("requires at least 8 chars", () => {
    const r = passwordSchema.safeParse("Ab1");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain("at least 8");
  });
  it("requires uppercase + lowercase + digit", () => {
    const r = passwordSchema.safeParse("alllowercase");
    expect(r.success).toBe(false);
  });
});

describe("nameSchema", () => {
  it("rejects empty", () => {
    expect(nameSchema.safeParse("").success).toBe(false);
  });
  it("rejects single char", () => {
    expect(nameSchema.safeParse("A").success).toBe(false);
  });
  it("accepts 'Alice'", () => {
    expect(nameSchema.safeParse("Alice").success).toBe(true);
  });
  it("rejects > 50 chars", () => {
    expect(nameSchema.safeParse("A".repeat(51)).success).toBe(false);
  });
});

describe("stellarAddressSchema", () => {
  const validAddr = "G" + "A".repeat(55); // 56-char G + uppercase alphanum
  it("accepts a valid G... 56-char address", () => {
    expect(stellarAddressSchema.safeParse(validAddr).success).toBe(true);
  });
  it("rejects empty", () => {
    expect(stellarAddressSchema.safeParse("").success).toBe(false);
  });
  it("rejects lowercase g prefix", () => {
    expect(stellarAddressSchema.safeParse("g" + validAddr.slice(1)).success).toBe(false);
  });
  it("rejects too-short string", () => {
    expect(stellarAddressSchema.safeParse("GABC").success).toBe(false);
  });
  it("rejects address with special chars", () => {
    expect(stellarAddressSchema.safeParse("G" + "!" + "A".repeat(54)).success).toBe(false);
  });
});

describe("tokenAmountSchema", () => {
  it("accepts positive decimal", () => {
    expect(tokenAmountSchema.safeParse("1.5").success).toBe(true);
  });
  it("accepts integer", () => {
    expect(tokenAmountSchema.safeParse("100").success).toBe(true);
  });
  it("rejects empty", () => {
    expect(tokenAmountSchema.safeParse("").success).toBe(false);
  });
  it("rejects zero", () => {
    expect(tokenAmountSchema.safeParse("0").success).toBe(false);
  });
  it("rejects negative", () => {
    expect(tokenAmountSchema.safeParse("-1").success).toBe(false);
  });
  it("rejects non-numeric", () => {
    expect(tokenAmountSchema.safeParse("abc").success).toBe(false);
  });
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

// #216 — contact address validation and normalization

const VALID_STELLAR = "GABC" + "A".repeat(52); // G + 55 uppercase alphanum = 56 chars
describe("normalizeContactAddress", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeContactAddress("  " + VALID_STELLAR + "  ")).toBe(VALID_STELLAR);
  });
  it("uppercases the string", () => {
    expect(normalizeContactAddress(VALID_STELLAR.toLowerCase())).toBe(VALID_STELLAR);
  });
  it("trims and uppercases together", () => {
    expect(normalizeContactAddress("  " + VALID_STELLAR.toLowerCase() + "\t")).toBe(VALID_STELLAR);
  });
});

describe("validateContactAddress", () => {
  it("returns null for a valid address", () => {
    expect(validateContactAddress(VALID_STELLAR)).toBeNull();
  });
  it("returns null for whitespace-padded valid address (normalizes first)", () => {
    expect(validateContactAddress("  " + VALID_STELLAR + "  ")).toBeNull();
  });
  it("returns an error string for an empty address", () => {
    expect(validateContactAddress("")).not.toBeNull();
  });
  it("returns an error string for a malformed address (too short)", () => {
    expect(validateContactAddress("GABC")).not.toBeNull();
  });
  it("returns an error string for a non-G prefix", () => {
    expect(validateContactAddress("X" + "A".repeat(55))).not.toBeNull();
  });
  it("returns an error string for special characters", () => {
    expect(validateContactAddress("G!" + "A".repeat(54))).not.toBeNull();
  });
  it("returns an error string for pure whitespace", () => {
    expect(validateContactAddress("   ")).not.toBeNull();
  });
});

describe("validateContact", () => {
  const valid = { name: "Alice", address: VALID_STELLAR, tokenType: "XLM" };

  it("accepts a valid contact", () => {
    expect(validateContact(valid).isValid).toBe(true);
  });
  it("accepts whitespace-padded valid address", () => {
    expect(validateContact({ ...valid, address: "  " + VALID_STELLAR + "  " }).isValid).toBe(true);
  });
  it("rejects malformed address and sets address error", () => {
    const r = validateContact({ ...valid, address: "not-an-address" });
    expect(r.isValid).toBe(false);
    expect(r.errors.address).toBeDefined();
  });
  it("rejects empty address", () => {
    const r = validateContact({ ...valid, address: "" });
    expect(r.isValid).toBe(false);
    expect(r.errors.address).toBeDefined();
  });
  it("rejects invalid name", () => {
    const r = validateContact({ ...valid, name: "" });
    expect(r.isValid).toBe(false);
    expect(r.errors.name).toBeDefined();
  });
});

describe("updateContactSchema / validateUpdateContact", () => {
  it("accepts partial update with only name", () => {
    expect(updateContactSchema.safeParse({ name: "Bob" }).success).toBe(true);
  });
  it("rejects malformed address in update", () => {
    const r = validateUpdateContact({ address: "bad" });
    expect(r.isValid).toBe(false);
    expect(r.errors.address).toBeDefined();
  });
  it("accepts whitespace-padded address in update", () => {
    const r = validateUpdateContact({ address: "  " + VALID_STELLAR + "  " });
    expect(r.isValid).toBe(true);
  });
  it("accepts empty update object (all fields optional)", () => {
    expect(validateUpdateContact({}).isValid).toBe(true);
  });
});
