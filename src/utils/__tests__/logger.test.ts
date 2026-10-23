import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  logger,
  hashValue,
  generateCorrelationId,
  sanitizeLogValue,
  isSensitiveKey,
  isContentKey,
  isContentLoggingEnabled,
} from "../logger";

describe("logger & high-cardinality log protection (#924)", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("is silent in production for info/debug", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { logger: prodLogger } = await import("../logger");
    prodLogger.info("hello");
    prodLogger.debug("world");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("routes error calls through console.error", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const { logger: devLogger } = await import("../logger");
    devLogger.error("boom");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("redacts sensitive fields (password, secretKey, token, promptText)", () => {
    const rawPayload = {
      user: "alice",
      password: "SuperSecretPassword123!",
      secretKey: "SD1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF123456",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      promptText: "This is a private prompt payload that should not be logged raw.",
    };

    const sanitized = sanitizeLogValue(rawPayload) as Record<string, string>;

    expect(sanitized.user).toBe("alice");
    expect(sanitized.password).toContain("[REDACTED");
    expect(sanitized.password).not.toContain("SuperSecretPassword123!");
    expect(sanitized.secretKey).toContain("[REDACTED");
    expect(sanitized.token).toContain("[REDACTED");
    expect(sanitized.promptText).toContain("[REDACTED");
  });

  it("generates deterministic hashes for safe correlation IDs without high cardinality", () => {
    const hash1 = hashValue("user-prompt-unique-input-1");
    const hash2 = hashValue("user-prompt-unique-input-1");
    const hash3 = hashValue("user-prompt-unique-input-2");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toMatch(/^hash_[0-9a-f]{8}$/);

    const corrId = generateCorrelationId("stellar_tx");
    expect(corrId).toMatch(/^stellar_tx_\d+_[a-z0-9]+$/);
  });

  it("truncates excessively long high-cardinality string inputs", () => {
    const longString = "A".repeat(200);
    const sanitized = sanitizeLogValue(longString) as string;

    expect(sanitized).toContain("[truncated");
    expect(sanitized.length).toBeLessThan(200);
  });

  it("correctly identifies sensitive key names", () => {
    expect(isSensitiveKey("password")).toBe(true);
    expect(isSensitiveKey("auth_token")).toBe(true);
    expect(isSensitiveKey("secretKey")).toBe(true);
    expect(isSensitiveKey("email")).toBe(true);
    expect(isSensitiveKey("userName")).toBe(false);
  });

  describe("agent content redaction (#273)", () => {
    const prompt = "Move all my USDC to wallet GDXYZ and tell me my seed backup";
    const reply = { result: { success: true, data: "Your balance is 9,000 XLM" } };

    it("redacts query/response content keys by default while keeping metadata", () => {
      delete process.env.NEXT_PUBLIC_LOG_AGENT_CONTENT;
      const sanitized = sanitizeLogValue({
        correlationId: "agent_query_1_abc",
        queryLength: prompt.length,
        query: prompt,
        response: reply,
      }) as Record<string, unknown>;

      expect(sanitized.correlationId).toBe("agent_query_1_abc");
      expect(sanitized.queryLength).toBe(prompt.length);
      expect(sanitized.query).toMatch(/^\[REDACTED_CONTENT, len=\d+, hash_[0-9a-f]{8}\]$/);
      expect(sanitized.response).toMatch(/^\[REDACTED_CONTENT/);
      expect(JSON.stringify(sanitized)).not.toContain("USDC");
      expect(JSON.stringify(sanitized)).not.toContain("9,000");
    });

    it("matches content keys exactly so metadata keys are not redacted", () => {
      expect(isContentKey("query")).toBe(true);
      expect(isContentKey("data")).toBe(true);
      expect(isContentKey("execution_trace")).toBe(true);
      expect(isContentKey("queryLength")).toBe(false);
      expect(isContentKey("responseHash")).toBe(false);
      expect(isContentKey("correlationId")).toBe(false);
    });

    it("allows content only when opted in and never in production", () => {
      process.env.NODE_ENV = "development";
      delete process.env.NEXT_PUBLIC_LOG_AGENT_CONTENT;
      expect(isContentLoggingEnabled()).toBe(false);

      process.env.NEXT_PUBLIC_LOG_AGENT_CONTENT = "true";
      expect(isContentLoggingEnabled()).toBe(true);
      expect((sanitizeLogValue({ query: "hello" }) as Record<string, unknown>).query).toBe("hello");

      process.env.NODE_ENV = "production";
      expect(isContentLoggingEnabled()).toBe(false);
    });

    it("never prints prompt content through logger.error by default", () => {
      delete process.env.NEXT_PUBLIC_LOG_AGENT_CONTENT;
      logger.error("[AgentService] Query failed:", { correlationId: "c1", query: prompt });
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(prompt);
      expect(JSON.stringify(errorSpy.mock.calls)).toContain("c1");
    });
  });
});
