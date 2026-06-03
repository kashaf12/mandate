import { describe, it, expect, vi, beforeEach } from "vitest";
import { KillSwitchAPI } from "../../src/backend/killswitch-api";
import type { BackendClient } from "../../src/backend/client";
import type {
  KillStatusResponse,
  KillAgentResponse,
} from "../../src/backend/killswitch-types";

describe("KillSwitchAPI", () => {
  let api: KillSwitchAPI;
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    api = new KillSwitchAPI(mockClient as unknown as BackendClient);
  });

  describe("check", () => {
    it("should check kill status for active agent", async () => {
      const response: KillStatusResponse = {
        agentId: "agent-123",
        killed: false,
      };

      mockClient.get.mockResolvedValueOnce(response);

      const status = await api.check("agent-123");

      expect(mockClient.get).toHaveBeenCalledWith(
        "/agents/agent-123/kill-status"
      );
      expect(status.killed).toBe(false);
      expect(status.agentId).toBe("agent-123");
    });

    it("should check kill status for killed agent", async () => {
      const response: KillStatusResponse = {
        agentId: "agent-123",
        killed: true,
        killedAt: "2025-12-28T10:30:00.000Z",
        reason: "Runaway costs",
        killedBy: "admin@company.com",
      };

      mockClient.get.mockResolvedValueOnce(response);

      const status = await api.check("agent-123");

      expect(status.killed).toBe(true);
      expect(status.killedAt).toBe("2025-12-28T10:30:00.000Z");
      expect(status.reason).toBe("Runaway costs");
      expect(status.killedBy).toBe("admin@company.com");
    });

    it("should handle different agent IDs", async () => {
      const response: KillStatusResponse = {
        agentId: "agent-456",
        killed: false,
      };

      mockClient.get.mockResolvedValueOnce(response);

      await api.check("agent-456");

      expect(mockClient.get).toHaveBeenCalledWith(
        "/agents/agent-456/kill-status"
      );
    });
  });

  describe("kill", () => {
    it("should kill an agent with reason", async () => {
      const response: KillAgentResponse = {
        agentId: "agent-123",
        killed: true,
        killedAt: "2025-12-28T10:30:00.000Z",
        reason: "Security incident",
      };

      mockClient.post.mockResolvedValueOnce(response);

      const result = await api.kill("agent-123", "Security incident");

      expect(mockClient.post).toHaveBeenCalledWith("/agents/agent-123/kill", {
        reason: "Security incident",
      });
      expect(result.killed).toBe(true);
      expect(result.reason).toBe("Security incident");
    });

    it("should kill an agent with reason and killedBy", async () => {
      const response: KillAgentResponse = {
        agentId: "agent-123",
        killed: true,
        killedAt: "2025-12-28T10:30:00.000Z",
        reason: "Runaway costs",
        killedBy: "admin@company.com",
      };

      mockClient.post.mockResolvedValueOnce(response);

      const result = await api.kill(
        "agent-123",
        "Runaway costs",
        "admin@company.com"
      );

      expect(mockClient.post).toHaveBeenCalledWith("/agents/agent-123/kill", {
        reason: "Runaway costs",
        killedBy: "admin@company.com",
      });
      expect(result.killedBy).toBe("admin@company.com");
    });

    it("should return kill timestamp", async () => {
      const timestamp = "2025-12-28T10:30:00.000Z";
      const response: KillAgentResponse = {
        agentId: "agent-123",
        killed: true,
        killedAt: timestamp,
        reason: "Test",
      };

      mockClient.post.mockResolvedValueOnce(response);

      const result = await api.kill("agent-123", "Test");

      expect(result.killedAt).toBe(timestamp);
    });

    it("should handle different reasons", async () => {
      const reasons = [
        "Runaway costs: infinite loop detected",
        "Security breach: unauthorized access",
        "Deployment rollback: reverting to v1.2.3",
        "Manual termination by operator",
      ];

      for (const reason of reasons) {
        const response: KillAgentResponse = {
          agentId: "agent-123",
          killed: true,
          killedAt: "2025-12-28T10:30:00.000Z",
          reason,
        };

        mockClient.post.mockResolvedValueOnce(response);

        const result = await api.kill("agent-123", reason);

        expect(result.reason).toBe(reason);
      }
    });
  });

  describe("isKilled", () => {
    it("should return false for active agent", async () => {
      const response: KillStatusResponse = {
        agentId: "agent-123",
        killed: false,
      };

      mockClient.get.mockResolvedValueOnce(response);

      const isKilled = await api.isKilled("agent-123");

      expect(isKilled).toBe(false);
    });

    it("should return true for killed agent", async () => {
      const response: KillStatusResponse = {
        agentId: "agent-123",
        killed: true,
        killedAt: "2025-12-28T10:30:00.000Z",
        reason: "Test",
      };

      mockClient.get.mockResolvedValueOnce(response);

      const isKilled = await api.isKilled("agent-123");

      expect(isKilled).toBe(true);
    });

    it("should call check method", async () => {
      const response: KillStatusResponse = {
        agentId: "agent-123",
        killed: false,
      };

      mockClient.get.mockResolvedValueOnce(response);

      await api.isKilled("agent-123");

      expect(mockClient.get).toHaveBeenCalledWith(
        "/agents/agent-123/kill-status"
      );
    });
  });
});
