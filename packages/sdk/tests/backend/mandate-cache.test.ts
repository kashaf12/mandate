import { describe, it, expect, beforeEach } from "vitest";
import { MandateCache } from "../../src/backend/mandate-cache";
import type { Mandate } from "../../src/types";

describe("MandateCache", () => {
  let cache: MandateCache;
  let mockMandate: Mandate;

  beforeEach(() => {
    cache = new MandateCache({ ttl: 1000, maxSize: 3 });

    mockMandate = {
      id: "mnd-123",
      version: 1,
      agentId: "agent-123",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 5000, // 5 seconds from now
      allowedTools: ["web_search"],
      deniedTools: [],
      toolPolicies: {},
    };
  });

  describe("set and get", () => {
    it("should store and retrieve mandate", () => {
      cache.set("agent-123", { user_tier: "free" }, mockMandate);

      const result = cache.get("agent-123", { user_tier: "free" });

      expect(result).toEqual(mockMandate);
    });

    it("should return null for cache miss", () => {
      const result = cache.get("agent-123", { user_tier: "free" });

      expect(result).toBeNull();
    });

    it("should handle different agent IDs", () => {
      const mandate1 = { ...mockMandate, agentId: "agent-1" };
      const mandate2 = { ...mockMandate, agentId: "agent-2" };

      cache.set("agent-1", {}, mandate1);
      cache.set("agent-2", {}, mandate2);

      expect(cache.get("agent-1", {})).toEqual(mandate1);
      expect(cache.get("agent-2", {})).toEqual(mandate2);
    });

    it("should handle different contexts", () => {
      const freeMandate = { ...mockMandate, id: "mnd-free" };
      const proMandate = { ...mockMandate, id: "mnd-pro" };

      cache.set("agent-123", { user_tier: "free" }, freeMandate);
      cache.set("agent-123", { user_tier: "pro" }, proMandate);

      expect(cache.get("agent-123", { user_tier: "free" })?.id).toBe(
        "mnd-free"
      );
      expect(cache.get("agent-123", { user_tier: "pro" })?.id).toBe("mnd-pro");
    });
  });

  describe("context key generation", () => {
    it("should generate same key for same context (different order)", () => {
      cache.set("agent-123", { a: "1", b: "2" }, mockMandate);

      const result = cache.get("agent-123", { b: "2", a: "1" });

      expect(result).toEqual(mockMandate);
    });

    it("should generate different keys for different contexts", () => {
      cache.set("agent-123", { user_tier: "free" }, mockMandate);

      const result = cache.get("agent-123", { user_tier: "pro" });

      expect(result).toBeNull();
    });

    it("should handle empty context", () => {
      cache.set("agent-123", {}, mockMandate);

      const result = cache.get("agent-123", {});

      expect(result).toEqual(mockMandate);
    });

    it("should handle complex context values", () => {
      const context = {
        user_tier: "free",
        environment: "production",
        session_id: "sess-xyz789",
      };

      cache.set("agent-123", context, mockMandate);

      const result = cache.get("agent-123", context);

      expect(result).toEqual(mockMandate);
    });
  });

  describe("TTL expiration", () => {
    it("should return null after TTL expires", async () => {
      cache.set("agent-123", {}, mockMandate);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = cache.get("agent-123", {});

      expect(result).toBeNull();
    });

    it("should remove expired entry from cache", async () => {
      cache.set("agent-123", {}, mockMandate);

      expect(cache.size()).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      cache.get("agent-123", {}); // Triggers cleanup

      expect(cache.size()).toBe(0);
    });

    it("should respect custom TTL", async () => {
      const shortCache = new MandateCache({ ttl: 100 });

      shortCache.set("agent-123", {}, mockMandate);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = shortCache.get("agent-123", {});

      expect(result).toBeNull();
    });
  });

  describe("mandate expiration", () => {
    it("should return null if mandate expired", () => {
      const expiredMandate = {
        ...mockMandate,
        expiresAt: Date.now() - 1000, // 1 second ago
      };

      cache.set("agent-123", {}, expiredMandate);

      const result = cache.get("agent-123", {});

      expect(result).toBeNull();
    });

    it("should remove expired mandate from cache", () => {
      const expiredMandate = {
        ...mockMandate,
        expiresAt: Date.now() - 1000,
      };

      cache.set("agent-123", {}, expiredMandate);
      expect(cache.size()).toBe(1);

      cache.get("agent-123", {}); // Triggers cleanup

      expect(cache.size()).toBe(0);
    });
  });

  describe("has", () => {
    it("should return true for valid cached mandate", () => {
      cache.set("agent-123", {}, mockMandate);

      expect(cache.has("agent-123", {})).toBe(true);
    });

    it("should return false for cache miss", () => {
      expect(cache.has("agent-123", {})).toBe(false);
    });

    it("should return false for expired entry", async () => {
      cache.set("agent-123", {}, mockMandate);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(cache.has("agent-123", {})).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete cached mandate", () => {
      cache.set("agent-123", {}, mockMandate);

      const deleted = cache.delete("agent-123", {});

      expect(deleted).toBe(true);
      expect(cache.get("agent-123", {})).toBeNull();
    });

    it("should return false if entry not found", () => {
      const deleted = cache.delete("agent-123", {});

      expect(deleted).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all cached mandates", () => {
      cache.set("agent-1", {}, mockMandate);
      cache.set("agent-2", {}, mockMandate);
      cache.set("agent-3", {}, mockMandate);

      expect(cache.size()).toBe(3);

      cache.clear();

      expect(cache.size()).toBe(0);
    });
  });

  describe("LRU eviction", () => {
    it("should evict oldest entry when max size exceeded", () => {
      const mandate1 = { ...mockMandate, id: "mnd-1" };
      const mandate2 = { ...mockMandate, id: "mnd-2" };
      const mandate3 = { ...mockMandate, id: "mnd-3" };
      const mandate4 = { ...mockMandate, id: "mnd-4" };

      cache.set("agent-1", {}, mandate1);
      cache.set("agent-2", {}, mandate2);
      cache.set("agent-3", {}, mandate3);

      expect(cache.size()).toBe(3);

      // This should evict agent-1 (oldest)
      cache.set("agent-4", {}, mandate4);

      expect(cache.size()).toBe(3);
      expect(cache.get("agent-1", {})).toBeNull(); // Evicted
      expect(cache.get("agent-4", {})).toEqual(mandate4); // New entry
    });

    it("should not evict when updating existing entry", () => {
      cache.set("agent-1", {}, mockMandate);
      cache.set("agent-2", {}, mockMandate);
      cache.set("agent-3", {}, mockMandate);

      expect(cache.size()).toBe(3);

      // Update existing entry (should not evict)
      const updated = { ...mockMandate, id: "mnd-updated" };
      cache.set("agent-1", {}, updated);

      expect(cache.size()).toBe(3);
      expect(cache.get("agent-1", {})?.id).toBe("mnd-updated");
    });
  });

  describe("stats", () => {
    it("should return cache statistics", () => {
      cache.set("agent-1", {}, mockMandate);

      const stats = cache.stats();

      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(3);
      expect(stats.ttl).toBe(1000);
      expect(stats.oldestEntry).toBeGreaterThanOrEqual(0);
    });

    it("should track oldest entry age", async () => {
      cache.set("agent-1", {}, mockMandate);

      await new Promise((resolve) => setTimeout(resolve, 100));

      cache.set("agent-2", {}, mockMandate);

      const stats = cache.stats();

      expect(stats.oldestEntry).toBeGreaterThanOrEqual(100);
    });

    it("should handle empty cache", () => {
      const stats = cache.stats();

      expect(stats.size).toBe(0);
      expect(stats.oldestEntry).toBeUndefined();
    });
  });
});
