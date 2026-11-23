import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import agentService from "../agentService";

const { mockClient } = vi.hoisted(() => {
  return {
    mockClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      request: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
  };
});

// The AgentService singleton creates its axios instance once in the
// constructor, so `axios.create` resolves to `mockClient`. Stub the instance
// methods directly rather than re-mocking the factory per test.
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => mockClient),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

const resetClientMocks = () => {
  mockClient.get.mockReset();
  mockClient.post.mockReset();
  mockClient.put.mockReset();
  mockClient.delete.mockReset();
  mockClient.patch.mockReset();
  mockClient.request.mockReset();
};

describe("AgentService", () => {
  beforeEach(resetClientMocks);
  afterEach(resetClientMocks);

  describe("healthCheck", () => {
    it("returns healthy status when request succeeds", async () => {
      mockClient.request.mockResolvedValue({ status: 200 });

      const result = await agentService.healthCheck();

      expect(result.status).toBe("healthy");
      expect(result.services.agent.status).toBe("up");
    });

    it("returns unhealthy status when request fails", async () => {
      mockClient.request.mockRejectedValue(new Error("Network error"));

      const result = await agentService.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.services.agent.status).toBe("down");
    });
  });

  describe("queryAgent", () => {
    it("sends query request and returns response", async () => {
      const mockResponse = {
        result: {
          success: true,
          data: "Mock response data",
        },
      };

      mockClient.post.mockResolvedValue({ data: mockResponse });

      const result = await agentService.queryAgent({
        userId: "user-1",
        query: "test query",
      });

      expect(result.result.success).toBe(true);
      expect(result.result.data).toBe("Mock response data");
    });

    it("handles network errors gracefully", async () => {
      mockClient.post.mockRejectedValue(new Error("Network error"));

      const result = await agentService.queryAgent({
        userId: "user-1",
        query: "test query",
      });

      expect(result.result.success).toBe(false);
      expect(result.result.error).toBeDefined();
    });

    it("provides user-friendly error messages", async () => {
      mockClient.post.mockRejectedValue({
        response: { data: { message: "invalid query" } },
      });

      const result = await agentService.queryAgent({
        userId: "user-1",
        query: "test query",
      });

      expect(result.result.success).toBe(false);
      expect(result.result.data).toContain("didn't understand");
    });
  });

  describe("getMemory", () => {
    it("returns memory entries for user", async () => {
      const mockMemory = ["memory1", "memory2"];

      mockClient.get.mockResolvedValue({ data: mockMemory });

      const result = await agentService.getMemory("user123");

      expect(result).toEqual({ ok: true, entries: mockMemory });
    });

    it("returns empty array on error", async () => {
      mockClient.get.mockRejectedValue(new Error("Error"));

      const result = await agentService.getMemory("user123");

      expect(result).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
    });
  });

  describe("clearMemory", () => {
    it("clears memory successfully", async () => {
      mockClient.delete.mockResolvedValue({});

      await expect(agentService.clearMemory("user123")).resolves.not.toThrow();
    });

    it("throws error on failure", async () => {
      mockClient.delete.mockRejectedValue(new Error("Error"));

      await expect(agentService.clearMemory("user123")).rejects.toThrow(
        "Failed to clear agent memory",
      );
    });
  });

  describe("getTools", () => {
    it("returns list of tools", async () => {
      const mockTools = [
        { name: "tool1", description: "Tool 1" },
        { name: "tool2", description: "Tool 2" },
      ];

      mockClient.get.mockResolvedValue({ data: mockTools });

      const result = await agentService.getTools();

      expect(result).toEqual(mockTools);
    });

    it("returns empty array on error", async () => {
      mockClient.get.mockRejectedValue(new Error("Error"));

      const result = await agentService.getTools();

      expect(result).toEqual([]);
    });
  });

  describe("executeTool", () => {
    it("executes tool and returns result", async () => {
      const mockResult = { success: true, data: "tool result" };

      mockClient.post.mockResolvedValue({ data: mockResult });

      const result = await agentService.executeTool("tool1", {
        param: "value",
      });

      expect(result).toEqual(mockResult);
    });

    it("throws error on failure", async () => {
      mockClient.post.mockRejectedValue(new Error("Error"));

      await expect(
        agentService.executeTool("tool1", { param: "value" }),
      ).rejects.toThrow("Failed to execute tool: tool1");
    });
  });

  describe("initialize", () => {
    it("initializes service with health check", async () => {
      mockClient.request.mockResolvedValue({ status: 200 });

      await expect(agentService.initialize()).resolves.not.toThrow();
    });

    it("handles initialization failure gracefully", async () => {
      mockClient.request.mockRejectedValue(new Error("Error"));

      await expect(agentService.initialize()).resolves.not.toThrow();
    });
  });
});
