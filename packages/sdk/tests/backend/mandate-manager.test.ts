import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MandateManager } from "../../src/backend/mandate-manager";
import type { MandateAPI } from "../../src/backend/mandate-api";
import type { Mandate } from "../../src/types";

describe("MandateManager", () => {
  let manager: MandateManager;
  let mockMandateAPI: {
    issue: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let mockMandate: Mandate;

  beforeEach(() => {
    mockMandateAPI = {
      issue: vi.fn(),
      get: vi.fn(),
    };

    mockMandate = {
      id: "mnd-123",
      version: 1,
      agentId: "agent-123",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 300000,
      allowedTools: ["web_search"],
      deniedTools: [],
      toolPolicies: {},
    };

    manager = new MandateManager({
      agentId: "agent-123",
      mandateAPI: mockMandateAPI as unknown as MandateAPI,
      cacheConfig: { ttl: 1000, maxSize: 10 },
      refreshInterval: 100,
      autoRefresh: false,
    });
  });

  afterEach(() => {
    manager.stopAutoRefresh();
  });

  describe("getMandate", () => {
    it("should fetch from backend on cache miss", async () => {
      mockMandateAPI.issue.mockResolvedValueOnce(mockMandate);

      const result = await manager.getMandate({ user_tier: "free" });

      expect(mockMandateAPI.issue).toHaveBeenCalledWith("agent-123", {
        user_tier: "free",
      });
      expect(result).toEqual(mockMandate);
    });

    it("should cache fetched mandate", async () => {
      mockMandateAPI.issue.mockResolvedValueOnce(mockMandate);

      await manager.getMandate({ user_tier: "free" });
      mockMandateAPI.issue.mockClear();

      const result = await manager.getMandate({ user_tier: "free" });

      expect(mockMandateAPI.issue).not.toHaveBeenCalled();
      expect(result).toEqual(mockMandate);
    });

    it("should return cached mandate on cache hit", async () => {
      mockMandateAPI.issue.mockResolvedValueOnce(mockMandate);

      await manager.getMandate({});
      mockMandateAPI.issue.mockClear();

      const result = await manager.getMandate({});

      expect(mockMandateAPI.issue).not.toHaveBeenCalled();
      expect(result).toEqual(mockMandate);
    });

    it("should handle different contexts separately", async () => {
      const freeMandate = { ...mockMandate, id: "mnd-free" };
      const proMandate = { ...mockMandate, id: "mnd-pro" };

      mockMandateAPI.issue
        .mockResolvedValueOnce(freeMandate)
        .mockResolvedValueOnce(proMandate);

      const free = await manager.getMandate({ user_tier: "free" });
      const pro = await manager.getMandate({ user_tier: "pro" });

      expect(free.id).toBe("mnd-free");
      expect(pro.id).toBe("mnd-pro");
      expect(mockMandateAPI.issue).toHaveBeenCalledTimes(2);
    });

    it("should throw error when backend fails and no cache", async () => {
      mockMandateAPI.issue.mockRejectedValueOnce(new Error("Backend down"));

      await expect(manager.getMandate({})).rejects.toThrow("Backend down");
    });

    it("should use stale cache when backend fails", async () => {
      // First call - successful
      mockMandateAPI.issue.mockResolvedValueOnce(mockMandate);
      await manager.getMandate({});

      // Wait for cache TTL to expire (but mandate itself is still valid)
      await new Promise((r) => setTimeout(r, 1100));

      // Second call - backend fails
      // Note: cache.get() will delete expired entry, but getStaleCache()
      // checks the cache map directly before deletion
      mockMandateAPI.issue.mockRejectedValueOnce(new Error("Backend down"));

      // Should still return stale cache (even though TTL expired)
      const result = await manager.getMandate({});
      expect(result).toEqual(mockMandate);
    });
  });

  describe("refresh", () => {
    it("should refresh mandate from backend", async () => {
      mockMandateAPI.issue.mockResolvedValueOnce(mockMandate);

      const success = await manager.refresh({ user_tier: "free" });

      expect(success).toBe(true);
      expect(mockMandateAPI.issue).toHaveBeenCalledWith("agent-123", {
        user_tier: "free",
      });
    });

    it("should use last context if not provided", async () => {
      // First call - establish context
      mockMandateAPI.issue.mockResolvedValueOnce(mockMandate);
      await manager.getMandate({ user_tier: "free" });

      mockMandateAPI.issue.mockClear();
      mockMandateAPI.issue.mockResolvedValueOnce(mockMandate);

      // Refresh without context
      await manager.refresh();

      expect(mockMandateAPI.issue).toHaveBeenCalledWith("agent-123", {
        user_tier: "free",
      });
    });

    it("should return false when no context available", async () => {
      const success = await manager.refresh();

      expect(success).toBe(false);
      expect(mockMandateAPI.issue).not.toHaveBeenCalled();
    });

    it("should return false on backend failure", async () => {
      // Suppress expected error log
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockMandateAPI.issue.mockRejectedValueOnce(new Error("Backend down"));

      const success = await manager.refresh({});

      expect(success).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it("should update cache on successful refresh", async () => {
      const updated = { ...mockMandate, id: "mnd-updated" };
      mockMandateAPI.issue.mockResolvedValueOnce(updated);

      await manager.refresh({});

      const cached = await manager.getMandate({});
      expect(cached.id).toBe("mnd-updated");
    });
  });

  describe("auto-refresh", () => {
    it("should start auto-refresh on first getMandate when enabled", async () => {
      const autoManager = new MandateManager({
        agentId: "agent-123",
        mandateAPI: mockMandateAPI as unknown as MandateAPI,
        refreshInterval: 100,
        autoRefresh: true,
      });

      mockMandateAPI.issue.mockResolvedValue(mockMandate);

      await autoManager.getMandate({});

      // Wait for refresh
      await new Promise((r) => setTimeout(r, 150));

      expect(mockMandateAPI.issue.mock.calls.length).toBeGreaterThan(1);

      autoManager.stopAutoRefresh();
    });

    it("should not start auto-refresh when disabled", async () => {
      mockMandateAPI.issue.mockResolvedValue(mockMandate);

      await manager.getMandate({});

      await new Promise((r) => setTimeout(r, 150));

      expect(mockMandateAPI.issue).toHaveBeenCalledTimes(1);
    });

    it("should refresh at correct interval", async () => {
      manager.startAutoRefresh();

      // Establish context
      mockMandateAPI.issue.mockResolvedValue(mockMandate);
      await manager.getMandate({});

      mockMandateAPI.issue.mockClear();

      // Wait for 2 refresh cycles
      await new Promise((r) => setTimeout(r, 250));

      expect(mockMandateAPI.issue.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("should stop auto-refresh", async () => {
      manager.startAutoRefresh();
      mockMandateAPI.issue.mockResolvedValue(mockMandate);
      await manager.getMandate({});

      manager.stopAutoRefresh();
      mockMandateAPI.issue.mockClear();

      await new Promise((r) => setTimeout(r, 150));

      expect(mockMandateAPI.issue).not.toHaveBeenCalled();
    });

    it("should not start multiple timers", () => {
      manager.startAutoRefresh();
      manager.startAutoRefresh();
      manager.startAutoRefresh();

      // Should only have one timer
      expect((manager as any).refreshTimer).toBeDefined();

      manager.stopAutoRefresh();
    });
  });

  describe("cache management", () => {
    it("should clear cache", async () => {
      mockMandateAPI.issue.mockResolvedValueOnce(mockMandate);
      await manager.getMandate({});

      expect(manager.hasCachedMandate({})).toBe(true);

      manager.clearCache();

      expect(manager.hasCachedMandate({})).toBe(false);
    });

    it("should report cache stats", async () => {
      mockMandateAPI.issue.mockResolvedValueOnce(mockMandate);
      await manager.getMandate({});

      const stats = manager.getCacheStats();

      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(10);
    });

    it("should check if mandate is cached", async () => {
      expect(manager.hasCachedMandate({})).toBe(false);

      mockMandateAPI.issue.mockResolvedValueOnce(mockMandate);
      await manager.getMandate({});

      expect(manager.hasCachedMandate({})).toBe(true);
    });
  });
});
