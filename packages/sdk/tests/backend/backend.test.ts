import { describe, it, expect, vi, beforeEach } from "vitest";
import { MandateBackend } from "../../src/backend/backend";
import type { BackendClient } from "../../src/backend/client";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("MandateBackend", () => {
  let backend: MandateBackend;

  beforeEach(() => {
    mockFetch.mockClear();

    backend = new MandateBackend({
      apiKey: "sk-org-abc-xxx",
      backendUrl: "http://localhost:3000",
      agentId: "agent-123",
    });
  });

  describe("initialization", () => {
    it("should create backend with config", () => {
      expect(backend).toBeDefined();
      expect(backend.agentId).toBe("agent-123");
    });

    it("should initialize all APIs", () => {
      expect(backend.mandates).toBeDefined();
      expect(backend.audit).toBeDefined();
      expect(backend.killSwitch).toBeDefined();
    });

    it("should handle optional agentId", () => {
      const backendWithoutAgent = new MandateBackend({
        apiKey: "sk-org-abc-xxx",
        backendUrl: "http://localhost:3000",
      });

      expect(backendWithoutAgent.agentId).toBeUndefined();
    });
  });

  describe("health check", () => {
    it("should check backend health", async () => {
      const response = {
        status: "ok",
        timestamp: "2025-12-28T10:00:00.000Z",
        version: "1.0.0",
        uptime: 86400,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      } as Response);

      const health = await backend.health();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/health",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-org-abc-xxx",
          }),
        })
      );
      expect(health.status).toBe("ok");
      expect(health.version).toBe("1.0.0");
    });

    it("should handle degraded status", async () => {
      const response = {
        status: "degraded",
        timestamp: "2025-12-28T10:00:00.000Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      } as Response);

      const health = await backend.health();

      expect(health.status).toBe("degraded");
    });

    it("should throw on backend down", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(backend.health()).rejects.toThrow();
    });
  });

  describe("isAvailable", () => {
    it("should return true when backend is healthy", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: "ok",
          timestamp: "2025-12-28T10:00:00.000Z",
        }),
      } as Response);

      const available = await backend.isAvailable();

      expect(available).toBe(true);
    });

    it("should return true when backend is degraded", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: "degraded",
          timestamp: "2025-12-28T10:00:00.000Z",
        }),
      } as Response);

      const available = await backend.isAvailable();

      expect(available).toBe(true);
    });

    it("should return false when backend is down", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: "down",
          timestamp: "2025-12-28T10:00:00.000Z",
        }),
      } as Response);

      const available = await backend.isAvailable();

      expect(available).toBe(false);
    });

    it("should return false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const available = await backend.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe("mandates API", () => {
    it("should issue mandate via mandates API", async () => {
      const response = {
        mandateId: "mnd-abc123",
        effectiveAuthority: {
          allowedTools: ["web_search"],
          maxCostTotal: 10.0,
        },
        expiresAt: "2025-12-28T10:30:00.000Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      } as Response);

      const mandate = await backend.mandates.issue("agent-123", {
        user_tier: "free",
      });

      expect(mandate.id).toBe("mnd-abc123");
      expect(mandate.allowedTools).toEqual(["web_search"]);
    });
  });

  describe("audit API", () => {
    it("should sync logs via audit API", async () => {
      const logs = [
        {
          id: "audit-1",
          timestamp: Date.now(),
          agentId: "agent-123",
          mandateId: "mnd-abc",
          actionId: "action-1",
          action: "tool_call" as const,
          decision: "ALLOW" as const,
          reason: "OK",
        },
      ];

      const response = {
        inserted: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      } as Response);

      const result = await backend.audit.bulkCreate(logs);

      expect(result.inserted).toBe(1);
    });
  });

  describe("kill switch API", () => {
    it("should check kill status via killSwitch API", async () => {
      const response = {
        agentId: "agent-123",
        killed: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      } as Response);

      const status = await backend.killSwitch.check("agent-123");

      expect(status.killed).toBe(false);
    });

    it("should kill agent via killSwitch API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          agentId: "agent-123",
          killed: true,
          killedAt: "2025-12-28T10:30:00.000Z",
          reason: "Test",
        }),
      } as Response);

      const result = await backend.killSwitch.kill("agent-123", "Test");

      expect(result.killed).toBe(true);
    });
  });

  describe("getBaseUrl", () => {
    it("should return backend base URL", () => {
      const url = backend.getBaseUrl();

      expect(url).toBe("http://localhost:3000");
    });
  });
});
