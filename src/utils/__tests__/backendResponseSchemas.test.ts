import { describe, expect, it } from "vitest";
import {
  balanceResponseSchema,
  BackendResponseValidationError,
  contactResponseEnvelopeSchema,
  contactsResponseSchema,
  horizonTransactionPageResponseSchema,
  loginResponseSchema,
  parseBackendResponse,
  registerResponseSchema,
  transactionPageResponseSchema,
} from "../validation";

const address = `G${"A".repeat(55)}`;
const user = {
  id: "user-1",
  email: "ada@example.test",
  name: "Ada",
  address,
  publicKey: address,
  isDeployed: true,
  isFunded: true,
  tokenType: "XLM",
  authProvider: "email",
  isEmailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const account = { address, publicKey: address, isDeployed: true };
const loginEnvelope = {
  success: true,
  message: "Signed in",
  data: { user, token: "test-token", stellarAccount: account, starknetAccount: account },
};
const contact = {
  id: "contact-1",
  name: "Grace",
  address,
  tokenType: "XLM",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const transaction = {
  id: "transaction-1",
  hash: "a".repeat(64),
  ledger: 42,
  created_at: "2026-01-01T00:00:00.000Z",
  source_account: address,
  fee_charged: "100",
  operation_count: 0,
  successful: true,
  operations: [],
};

describe("backend response schemas", () => {
  it("accepts valid login and registration envelopes", () => {
    expect(loginResponseSchema.safeParse(loginEnvelope).success).toBe(true);
    expect(registerResponseSchema.safeParse({
      ...loginEnvelope,
      data: {
        ...loginEnvelope.data,
        setupStatus: {
          funding: { success: true, amount: "10" },
          deployment: { success: true },
          fullyReady: true,
        },
      },
    }).success).toBe(true);
  });

  it("rejects malformed auth payloads and reports normalized field errors", () => {
    try {
      parseBackendResponse(
        "POST /auth/login",
        loginResponseSchema,
        { ...loginEnvelope, data: { ...loginEnvelope.data, token: "" } },
      );
      throw new Error("Expected response validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BackendResponseValidationError);
      expect((error as Error).message).toContain("POST /auth/login");
      expect((error as Error).message).toContain("data.token");
    }

    expect(registerResponseSchema.safeParse(loginEnvelope).success).toBe(false);
  });

  it("accepts contact envelopes and rejects malformed contact fields", () => {
    expect(contactsResponseSchema.safeParse({
      success: true,
      data: [contact],
    }).success).toBe(true);
    expect(contactResponseEnvelopeSchema.safeParse({
      success: true,
      data: { ...contact, address: "not-a-stellar-address" },
    }).success).toBe(false);
  });

  it("accepts valid balances and rejects non-numeric amount strings", () => {
    expect(balanceResponseSchema.safeParse({
      success: true,
      data: {
        hasBalance: true,
        balance: "12.5",
        required: "1",
        nativeBalance: "12.5",
      },
    }).success).toBe(true);
    expect(balanceResponseSchema.safeParse({
      success: true,
      data: {
        hasBalance: true,
        balance: "NaN",
        required: "1",
        nativeBalance: "12.5",
      },
    }).success).toBe(false);
  });

  it("validates API and Horizon transaction page envelopes", () => {
    expect(transactionPageResponseSchema.safeParse({
      success: true,
      data: { transactions: [transaction], total: 1, page: 1, limit: 50 },
    }).success).toBe(true);
    expect(transactionPageResponseSchema.safeParse({
      success: true,
      data: { transactions: [{ ...transaction, successful: "yes" }], total: 1, page: 1, limit: 50 },
    }).success).toBe(false);
    expect(horizonTransactionPageResponseSchema.safeParse({
      _embedded: { records: [{ ...transaction, paging_token: "42", _embedded: { records: [] } }] },
    }).success).toBe(true);
    expect(horizonTransactionPageResponseSchema.safeParse({
      _embedded: { records: [{ ...transaction, _embedded: { records: [{ id: "op-1" }] } }] },
    }).success).toBe(false);
  });
});
