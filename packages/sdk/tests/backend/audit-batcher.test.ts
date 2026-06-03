import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuditBatcher } from "../../src/backend/audit-batcher";
import type { AuditAPI } from "../../src/backend/audit-api";
import type { AuditEntry } from "../../src/types";

describe("AuditBatcher", () => {
  let batcher: AuditBatcher;
  let mockAuditAPI: {
    bulkCreate: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
  let mockEntry: AuditEntry;

  beforeEach(() => {
    mockAuditAPI = {
      bulkCreate: vi.fn(),
      query: vi.fn(),
    };

    mockEntry = {
      id: "audit-1",
      timestamp: Date.now(),
      agentId: "agent-123",
      mandateId: "mnd-abc",
      actionId: "action-1",
      action: "tool_call",
      decision: "ALLOW",
      reason: "OK",
    };

    batcher = new AuditBatcher({
      auditAPI: mockAuditAPI as unknown as AuditAPI,
      batchSize: 3,
      flushInterval: 100,
      maxBufferSize: 10,
    });
  });

  afterEach(() => {
    batcher.stop();
  });

  describe("add", () => {
    it("should buffer audit logs", () => {
      mockAuditAPI.bulkCreate.mockResolvedValue({ inserted: 1 });
      batcher.add(mockEntry);

      expect(batcher.size()).toBe(1);
    });

    it("should buffer multiple logs", async () => {
      mockAuditAPI.bulkCreate.mockResolvedValue({ inserted: 3 });
      batcher.add(mockEntry);
      batcher.add(mockEntry);
      batcher.add(mockEntry); // Triggers auto-flush

      // Wait for auto-flush to complete
      await new Promise((r) => setTimeout(r, 10));

      // After auto-flush, buffer should be empty
      expect(batcher.size()).toBe(0);
      expect(mockAuditAPI.bulkCreate).toHaveBeenCalled();
    });

    it("should auto-flush when batch size reached", async () => {
      mockAuditAPI.bulkCreate.mockResolvedValueOnce({ inserted: 3 });

      batcher.add(mockEntry);
      batcher.add(mockEntry);
      batcher.add(mockEntry); // Triggers flush

      await new Promise((r) => setTimeout(r, 10));

      expect(mockAuditAPI.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([mockEntry, mockEntry, mockEntry])
      );
      expect(batcher.size()).toBe(0);
    });

    it("should drop oldest logs when buffer full", async () => {
      // Create a batcher with larger batch size to prevent auto-flush
      const largeBatchBatcher = new AuditBatcher({
        auditAPI: mockAuditAPI as unknown as AuditAPI,
        batchSize: 20, // Larger than what we'll add
        flushInterval: 1000,
        maxBufferSize: 10,
      });

      // Add more than maxBufferSize
      for (let i = 0; i < 15; i++) {
        largeBatchBatcher.add({ ...mockEntry, id: `audit-${i}` });
      }

      // Buffer should be capped at maxBufferSize
      expect(largeBatchBatcher.size()).toBe(10); // maxBufferSize
      const stats = largeBatchBatcher.getStats();
      expect(stats.totalDropped).toBe(5); // 15 - 10 = 5 dropped

      largeBatchBatcher.stop();
    });

    it("should update statistics", () => {
      batcher.add(mockEntry);
      batcher.add(mockEntry);

      const stats = batcher.getStats();

      expect(stats.totalAdded).toBe(2);
      expect(stats.bufferedLogs).toBe(2);
    });
  });

  describe("flush", () => {
    it("should flush buffered logs to backend", async () => {
      mockAuditAPI.bulkCreate.mockResolvedValueOnce({ inserted: 2 });

      batcher.add(mockEntry);
      batcher.add(mockEntry);

      const flushed = await batcher.flush();

      expect(flushed).toBe(2);
      expect(mockAuditAPI.bulkCreate).toHaveBeenCalledWith([
        mockEntry,
        mockEntry,
      ]);
      expect(batcher.size()).toBe(0);
    });

    it("should return 0 for empty buffer", async () => {
      const flushed = await batcher.flush();

      expect(flushed).toBe(0);
      expect(mockAuditAPI.bulkCreate).not.toHaveBeenCalled();
    });

    it("should update statistics on successful flush", async () => {
      mockAuditAPI.bulkCreate.mockResolvedValueOnce({ inserted: 2 });

      batcher.add(mockEntry);
      batcher.add(mockEntry);

      await batcher.flush();

      const stats = batcher.getStats();

      expect(stats.totalFlushed).toBe(2);
      expect(stats.lastFlushSize).toBe(2);
      expect(stats.lastFlushAt).toBeGreaterThan(0);
    });

    it("should re-queue logs on failure", async () => {
      mockAuditAPI.bulkCreate.mockRejectedValueOnce(new Error("Backend down"));

      batcher.add(mockEntry);
      batcher.add(mockEntry);

      await expect(batcher.flush()).rejects.toThrow("Backend down");

      // Logs should be re-queued
      expect(batcher.size()).toBe(2);
    });

    it("should increment failed flush count on failure", async () => {
      mockAuditAPI.bulkCreate.mockRejectedValueOnce(new Error("Backend down"));

      batcher.add(mockEntry);

      await expect(batcher.flush()).rejects.toThrow();

      const stats = batcher.getStats();
      expect(stats.failedFlushes).toBe(1);
    });

    it("should trim re-queued logs to max buffer size", async () => {
      // Create a batcher with larger batch size to prevent auto-flush
      const largeBatchBatcher = new AuditBatcher({
        auditAPI: mockAuditAPI as unknown as AuditAPI,
        batchSize: 20, // Larger than what we'll add
        flushInterval: 1000,
        maxBufferSize: 10,
      });

      // Fill buffer to max
      for (let i = 0; i < 10; i++) {
        largeBatchBatcher.add({ ...mockEntry, id: `audit-${i}` });
      }

      expect(largeBatchBatcher.size()).toBe(10);

      // Set up failure mock
      mockAuditAPI.bulkCreate.mockRejectedValueOnce(new Error("Backend down"));

      // Try to flush (will fail and re-queue)
      await expect(largeBatchBatcher.flush()).rejects.toThrow();

      // Should still be at max size after re-queue
      expect(largeBatchBatcher.size()).toBe(10);

      // Add more logs - should drop oldest
      largeBatchBatcher.add(mockEntry);
      expect(largeBatchBatcher.size()).toBe(10);

      const stats = largeBatchBatcher.getStats();
      expect(stats.totalDropped).toBeGreaterThan(0);

      largeBatchBatcher.stop();
    });

    it("should preserve log order on re-queue", async () => {
      const log1 = { ...mockEntry, id: "audit-1" };
      const log2 = { ...mockEntry, id: "audit-2" };

      batcher.add(log1);
      batcher.add(log2);

      mockAuditAPI.bulkCreate.mockRejectedValueOnce(new Error("Backend down"));

      await expect(batcher.flush()).rejects.toThrow();

      // Flush again (should succeed)
      mockAuditAPI.bulkCreate.mockResolvedValueOnce({ inserted: 2 });

      await batcher.flush();

      expect(mockAuditAPI.bulkCreate).toHaveBeenLastCalledWith([log1, log2]);
    });
  });

  describe("periodic flush", () => {
    it("should flush periodically", async () => {
      mockAuditAPI.bulkCreate.mockResolvedValue({ inserted: 1 });

      batcher.add(mockEntry);

      // Wait for flush timer
      await new Promise((r) => setTimeout(r, 150));

      expect(mockAuditAPI.bulkCreate).toHaveBeenCalled();
      expect(batcher.size()).toBe(0);
    });

    it("should handle flush errors gracefully", async () => {
      // Suppress expected error log
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockAuditAPI.bulkCreate.mockRejectedValue(new Error("Backend down"));

      batcher.add(mockEntry);

      // Wait for flush timer
      await new Promise((r) => setTimeout(r, 150));

      // Should not crash - logs re-queued
      expect(batcher.size()).toBe(1);

      consoleErrorSpy.mockRestore();
    });
  });

  describe("stop", () => {
    it("should stop periodic flush", async () => {
      mockAuditAPI.bulkCreate.mockResolvedValue({ inserted: 1 });

      batcher.add(mockEntry);
      batcher.stop();

      // Wait past flush interval
      await new Promise((r) => setTimeout(r, 150));

      // Should not have flushed
      expect(mockAuditAPI.bulkCreate).not.toHaveBeenCalled();
    });

    it("should be safe to call multiple times", () => {
      batcher.stop();
      batcher.stop();
      batcher.stop();

      // Should not throw
    });
  });

  describe("clear", () => {
    it("should clear buffer without flushing", () => {
      batcher.add(mockEntry);
      batcher.add(mockEntry);

      expect(batcher.size()).toBe(2);

      batcher.clear();

      expect(batcher.size()).toBe(0);
      expect(mockAuditAPI.bulkCreate).not.toHaveBeenCalled();
    });

    it("should update dropped count", () => {
      batcher.add(mockEntry);
      batcher.add(mockEntry);

      batcher.clear();

      const stats = batcher.getStats();
      expect(stats.totalDropped).toBe(2);
    });
  });

  describe("getStats", () => {
    it("should return statistics", () => {
      const stats = batcher.getStats();

      expect(stats).toEqual({
        bufferedLogs: 0,
        totalAdded: 0,
        totalFlushed: 0,
        totalDropped: 0,
        failedFlushes: 0,
      });
    });

    it("should track all statistics", async () => {
      mockAuditAPI.bulkCreate.mockResolvedValueOnce({ inserted: 2 });

      batcher.add(mockEntry);
      batcher.add(mockEntry);

      await batcher.flush();

      const stats = batcher.getStats();

      expect(stats.totalAdded).toBe(2);
      expect(stats.totalFlushed).toBe(2);
      expect(stats.bufferedLogs).toBe(0);
      expect(stats.lastFlushSize).toBe(2);
      expect(stats.lastFlushAt).toBeDefined();
    });

    it("should be read-only copy", () => {
      const stats = batcher.getStats();
      stats.totalAdded = 999;

      const stats2 = batcher.getStats();
      expect(stats2.totalAdded).toBe(0);
    });
  });
});
