import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TokenRefreshService,
  TokenRefreshResult,
} from "../tokenRefreshService";

const { mockAxios } = vi.hoisted(() => ({
  mockAxios: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    create: vi.fn(),
    default: null as unknown,
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

vi.mock("axios", () => ({ ...mockAxios, default: mockAxios }));

const resetAxiosMocks = () => {
  mockAxios.get.mockReset();
  mockAxios.post.mockReset();
  mockAxios.put.mockReset();
  mockAxios.delete.mockReset();
  mockAxios.patch.mockReset();
  mockAxios.create.mockReset();
};

describe("TokenRefreshService - Single-Flight Behaviour", () => {
  let service: TokenRefreshService;
  const mockApiBaseUrl = "http://localhost:2333";

  beforeEach(() => {
    resetAxiosMocks();
    // Reset singleton instance for each test
    (
      TokenRefreshService as unknown as { instance: TokenRefreshService | null }
    ).instance = null;
    service = TokenRefreshService.getInstance();
  });

  afterEach(() => {
    resetAxiosMocks();
  });

  describe("single-flight queue behaviour", () => {
    it("queues concurrent refresh requests while one is in-flight", async () => {
      // Mock axios to delay the first request
      let resolveFirstRequest: ((value: unknown) => void) | null = null;
      mockAxios.post.mockImplementation(() => {
        return new Promise((resolve) => {
          resolveFirstRequest = resolve;
        });
      });

      // Start first refresh request
      const firstRequest = service.refreshToken(mockApiBaseUrl);

      // Immediately start a second request while first is still in-flight
      const secondRequest = service.refreshToken(mockApiBaseUrl);

      // Third request as well
      const thirdRequest = service.refreshToken(mockApiBaseUrl);

      // Verify that queue has 2 items (second and third requests)
      expect(service.queueLength()).toBe(2);
      expect(service.isTokenRefreshing()).toBe(true);

      // Resolve the first request
      const mockResponse: TokenRefreshResult = { token: "new-token-123" };
      resolveFirstRequest!({ data: mockResponse });

      // All requests should resolve with the same token
      const [firstResult, secondResult, thirdResult] = await Promise.all([
        firstRequest,
        secondRequest,
        thirdRequest,
      ]);

      expect(firstResult.token).toBe("new-token-123");
      expect(secondResult.token).toBe("new-token-123");
      expect(thirdResult.token).toBe("new-token-123");

      // Queue should be empty after all resolve
      expect(service.queueLength()).toBe(0);
      expect(service.isTokenRefreshing()).toBe(false);
    });

    it("handles successful refresh and resolves all queued requests", async () => {
      const mockToken = "refreshed-token-abc";
      mockAxios.post.mockResolvedValue({
        data: { token: mockToken },
      });

      // Start multiple concurrent requests
      const requests = [
        service.refreshToken(mockApiBaseUrl),
        service.refreshToken(mockApiBaseUrl),
        service.refreshToken(mockApiBaseUrl),
      ];

      const results = await Promise.all(requests);

      // All should resolve with the same token
      results.forEach((result) => {
        expect(result.token).toBe(mockToken);
      });

      // Only one HTTP request should have been made
      expect(mockAxios.post).toHaveBeenCalledTimes(1);
    });

    it("propagates error to all queued requests on failure", async () => {
      const mockError = new Error("Refresh token expired");
      mockAxios.post.mockRejectedValue(mockError);

      // Start multiple concurrent requests
      const requests = [
        service.refreshToken(mockApiBaseUrl),
        service.refreshToken(mockApiBaseUrl),
        service.refreshToken(mockApiBaseUrl),
      ];

      // All should reject with the same error
      await expect(Promise.all(requests)).rejects.toThrow(
        "Refresh token expired",
      );

      // Queue should be empty after error
      expect(service.queueLength()).toBe(0);
      expect(service.isTokenRefreshing()).toBe(false);
    });

    it("allows new refresh after previous completes", async () => {
      const mockToken1 = "token-1";
      const mockToken2 = "token-2";

      mockAxios.post
        .mockResolvedValueOnce({ data: { token: mockToken1 } })
        .mockResolvedValueOnce({ data: { token: mockToken2 } });

      // First refresh
      const result1 = await service.refreshToken(mockApiBaseUrl);
      expect(result1.token).toBe(mockToken1);

      // Second refresh should work normally (not queued)
      const result2 = await service.refreshToken(mockApiBaseUrl);
      expect(result2.token).toBe(mockToken2);

      expect(mockAxios.post).toHaveBeenCalledTimes(2);
    });

    it("handles rapid sequential requests correctly", async () => {
      let callCount = 0;
      mockAxios.post.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          data: { token: `token-${callCount}` },
        });
      });

      // Fire 5 requests in quick succession
      const requests = Array.from({ length: 5 }, () =>
        service.refreshToken(mockApiBaseUrl),
      );

      const results = await Promise.all(requests);

      // All should resolve with the same token (from the single in-flight request)
      const uniqueTokens = new Set(results.map((r) => r.token));
      expect(uniqueTokens.size).toBe(1);

      // Only one HTTP call should have been made
      expect(callCount).toBe(1);
    });

    it("handles empty queue after all requests resolve", async () => {
      mockAxios.post.mockResolvedValue({
        data: { token: "test-token" },
      });

      await service.refreshToken(mockApiBaseUrl);

      expect(service.queueLength()).toBe(0);
      expect(service.isTokenRefreshing()).toBe(false);
    });

    it("resets isRefreshing flag even on error", async () => {
      mockAxios.post.mockRejectedValue(new Error("Network error"));

      try {
        await service.refreshToken(mockApiBaseUrl);
      } catch {
        // Expected to fail
      }

      expect(service.isTokenRefreshing()).toBe(false);
    });

    it("processes queue with correct error/result distribution", async () => {
      let shouldSucceed = true;
      mockAxios.post.mockImplementation(() => {
        if (shouldSucceed) {
          return Promise.resolve({ data: { token: "success-token" } });
        }
        return Promise.reject(new Error("Auth failed"));
      });

      // First batch - should succeed
      const batch1 = [
        service.refreshToken(mockApiBaseUrl),
        service.refreshToken(mockApiBaseUrl),
      ];
      await expect(Promise.all(batch1)).resolves.toBeTruthy();

      // Second batch - should fail
      shouldSucceed = false;
      const batch2 = [
        service.refreshToken(mockApiBaseUrl),
        service.refreshToken(mockApiBaseUrl),
      ];
      await expect(Promise.all(batch2)).rejects.toThrow("Auth failed");

      // Third batch - should succeed again (flag reset)
      shouldSucceed = true;
      const batch3 = service.refreshToken(mockApiBaseUrl);
      await expect(batch3).resolves.toEqual({ token: "success-token" });
    });
  });

  describe("singleton behaviour", () => {
    it("returns same instance across multiple calls", () => {
      const instance1 = TokenRefreshService.getInstance();
      const instance2 = TokenRefreshService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("maintains queue state across getInstance calls", async () => {
      mockAxios.post.mockImplementation(
        () =>
          new Promise((resolve) => {
            // Delay resolution
            setTimeout(() => resolve({ data: { token: "test" } }), 100);
          }),
      );

      const instance1 = TokenRefreshService.getInstance();
      const request1 = instance1.refreshToken(mockApiBaseUrl);

      const instance2 = TokenRefreshService.getInstance();
      const request2 = instance2.refreshToken(mockApiBaseUrl);

      // Both should be the same instance, so queue should be shared
      expect(instance1.queueLength()).toBe(1);
      expect(instance2.queueLength()).toBe(1);

      await Promise.all([request1, request2]);
    });
  });

  describe("edge cases", () => {
    it("handles single request without queueing", async () => {
      mockAxios.post.mockResolvedValue({
        data: { token: "single-token" },
      });

      const result = await service.refreshToken(mockApiBaseUrl);

      expect(result.token).toBe("single-token");
      expect(service.queueLength()).toBe(0);
    });

    it("handles requests arriving after queue is processed", async () => {
      let resolveFirst: ((value: unknown) => void) | null = null;
      mockAxios.post.mockImplementation(() => {
        return new Promise((resolve) => {
          if (!resolveFirst) {
            resolveFirst = resolve;
          }
        });
      });

      const request1 = service.refreshToken(mockApiBaseUrl);

      // Wait a bit then add another request
      await new Promise((resolve) => setTimeout(resolve, 10));
      const request2 = service.refreshToken(mockApiBaseUrl);

      resolveFirst!({ data: { token: "token-1" } });

      const [result1, result2] = await Promise.all([request1, request2]);

      expect(result1.token).toBe("token-1");
      expect(result2.token).toBe("token-1");
    });
  });
});
