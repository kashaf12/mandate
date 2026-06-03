import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditAPI } from "../../src/backend/audit-api";
import type { BackendClient } from "../../src/backend/client";
import type { AuditEntry } from "../../src/types";
import type {
  BulkCreateAuditLogsResponse,
  BackendAuditLogResponse,
} from "../../src/backend/audit-types";

describe("AuditAPI", () => {
  let api: AuditAPI;
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

    api = new AuditAPI(mockClient as unknown as BackendClient);
  });

  describe("bulkCreate", () => {
    it("should sync audit logs to backend", async () => {
      const logs: AuditEntry[] = [
        {
          id: "audit-1",
          timestamp: 1735384500000,
          agentId: "agent-123",
          mandateId: "mnd-abc",
          actionId: "action-1",
          action: "tool_call",
          tool: "web_search",
          decision: "ALLOW",
          reason: "Within limits",
          estimatedCost: 0.05,
          actualCost: 0.05,
          cumulativeCost: 0.05,
        },
        {
          id: "audit-2",
          timestamp: 1735384501000,
          agentId: "agent-123",
          mandateId: "mnd-abc",
          actionId: "action-2",
          action: "tool_call",
          tool: "read_file",
          decision: "BLOCK",
          reason: "Tool not allowed",
          blockCode: "TOOL_NOT_ALLOWED",
        },
      ];

      const response: BulkCreateAuditLogsResponse = {
        inserted: 2,
      };

      mockClient.post.mockResolvedValueOnce(response);

      const result = await api.bulkCreate(logs);

      expect(result.inserted).toBe(2);
      expect(mockClient.post).toHaveBeenCalledWith("/audit/bulk", {
        logs: expect.arrayContaining([
          expect.objectContaining({
            actionId: "action-1",
            actionType: "tool_call",
            toolName: "web_search",
            decision: "ALLOW",
          }),
          expect.objectContaining({
            actionId: "action-2",
            actionType: "tool_call",
            toolName: "read_file",
            decision: "BLOCK",
          }),
        ]),
      });
    });

    it("should handle empty array", async () => {
      const result = await api.bulkCreate([]);

      expect(result.inserted).toBe(0);
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it("should convert timestamp to ISO 8601", async () => {
      const epochTimestamp = 1735384500000; // Epoch ms
      const expectedISO = new Date(epochTimestamp).toISOString();

      const logs: AuditEntry[] = [
        {
          id: "audit-1",
          timestamp: epochTimestamp,
          agentId: "agent-123",
          mandateId: "mnd-abc",
          actionId: "action-1",
          action: "tool_call",
          decision: "ALLOW",
          reason: "OK",
        },
      ];

      mockClient.post.mockResolvedValueOnce({ inserted: 1 });

      await api.bulkCreate(logs);

      expect(mockClient.post).toHaveBeenCalledWith(
        "/audit/bulk",
        expect.objectContaining({
          logs: [
            expect.objectContaining({
              timestamp: expectedISO, // ISO 8601
            }),
          ],
        })
      );
    });

    it("should include context fields", async () => {
      const logs: AuditEntry[] = [
        {
          id: "audit-1",
          timestamp: Date.now(),
          agentId: "agent-123",
          mandateId: "mnd-abc",
          actionId: "action-1",
          action: "llm_call",
          provider: "openai",
          model: "gpt-4",
          traceId: "trace-123",
          parentActionId: "parent-456",
          idempotencyKey: "idem-789",
          decision: "ALLOW",
          reason: "OK",
        },
      ];

      mockClient.post.mockResolvedValueOnce({ inserted: 1 });

      await api.bulkCreate(logs);

      expect(mockClient.post).toHaveBeenCalledWith(
        "/audit/bulk",
        expect.objectContaining({
          logs: [
            expect.objectContaining({
              context: {
                traceId: "trace-123",
                parentActionId: "parent-456",
                idempotencyKey: "idem-789",
                provider: "openai",
                model: "gpt-4",
              },
            }),
          ],
        })
      );
    });

    it("should include metadata fields", async () => {
      const logs: AuditEntry[] = [
        {
          id: "audit-1",
          timestamp: Date.now(),
          agentId: "agent-123",
          mandateId: "mnd-abc",
          actionId: "action-1",
          action: "tool_call",
          decision: "BLOCK",
          reason: "Blocked",
          blockCode: "COST_LIMIT_EXCEEDED",
          hash: "abc123",
          previousHash: "def456",
          metadata: {
            customField: "custom-value",
            nested: { data: "value" },
          },
        },
      ];

      mockClient.post.mockResolvedValueOnce({ inserted: 1 });

      await api.bulkCreate(logs);

      expect(mockClient.post).toHaveBeenCalledWith(
        "/audit/bulk",
        expect.objectContaining({
          logs: [
            expect.objectContaining({
              metadata: {
                blockCode: "COST_LIMIT_EXCEEDED",
                hash: "abc123",
                previousHash: "def456",
                customField: "custom-value",
                nested: { data: "value" },
              },
            }),
          ],
        })
      );
    });

    it("should map DEFER to BLOCK", async () => {
      const logs: AuditEntry[] = [
        {
          id: "audit-1",
          timestamp: Date.now(),
          agentId: "agent-123",
          mandateId: "mnd-abc",
          actionId: "action-1",
          action: "tool_call",
          decision: "DEFER" as any,
          reason: "Deferred",
        },
      ];

      mockClient.post.mockResolvedValueOnce({ inserted: 1 });

      await api.bulkCreate(logs);

      expect(mockClient.post).toHaveBeenCalledWith(
        "/audit/bulk",
        expect.objectContaining({
          logs: [
            expect.objectContaining({
              decision: "BLOCK", // DEFER mapped to BLOCK
            }),
          ],
        })
      );
    });

    it("should map action types correctly", async () => {
      const logs: AuditEntry[] = [
        {
          id: "audit-1",
          timestamp: Date.now(),
          agentId: "agent-123",
          mandateId: "mnd-abc",
          actionId: "action-1",
          action: "llm_call",
          decision: "ALLOW",
          reason: "OK",
        },
      ];

      mockClient.post.mockResolvedValueOnce({ inserted: 1 });

      await api.bulkCreate(logs);

      expect(mockClient.post).toHaveBeenCalledWith(
        "/audit/bulk",
        expect.objectContaining({
          logs: [
            expect.objectContaining({
              actionType: "llm_call",
            }),
          ],
        })
      );
    });
  });

  describe("query", () => {
    it("should query audit logs with filters", async () => {
      const response: BackendAuditLogResponse[] = [
        {
          id: "log-1",
          agentId: "agent-123",
          actionId: "action-1",
          timestamp: "2025-12-28T10:00:00.000Z",
          actionType: "tool_call",
          toolName: "web_search",
          decision: "BLOCK",
          reason: "Tool not allowed",
          createdAt: "2025-12-28T10:00:01.000Z",
        },
      ];

      mockClient.get.mockResolvedValueOnce(response);

      const result = await api.query({
        decision: "BLOCK",
        from: new Date("2025-12-28T09:00:00Z"),
        to: new Date("2025-12-28T11:00:00Z"),
        limit: 100,
      });

      expect(result).toEqual(response);
      expect(mockClient.get).toHaveBeenCalledWith(
        "/audit?decision=BLOCK&from=2025-12-28T09%3A00%3A00.000Z&to=2025-12-28T11%3A00%3A00.000Z&limit=100"
      );
    });

    it("should query without filters", async () => {
      const response: BackendAuditLogResponse[] = [];

      mockClient.get.mockResolvedValueOnce(response);

      const result = await api.query();

      expect(result).toEqual(response);
      expect(mockClient.get).toHaveBeenCalledWith("/audit");
    });

    it("should query with partial filters", async () => {
      const response: BackendAuditLogResponse[] = [];

      mockClient.get.mockResolvedValueOnce(response);

      await api.query({ decision: "ALLOW" });

      expect(mockClient.get).toHaveBeenCalledWith("/audit?decision=ALLOW");
    });
  });
});
