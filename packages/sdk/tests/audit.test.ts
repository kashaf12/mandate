import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ConsoleAuditLogger,
  MemoryAuditLogger,
  FileAuditLogger,
  NoOpAuditLogger,
  MultiAuditLogger,
} from "../src/audit";
import type { AuditEntry } from "../src/types";
import * as fs from "fs";
import * as path from "path";

describe("Audit Loggers", () => {
  const mockEntry: AuditEntry = {
    id: "audit-1",
    timestamp: Date.now(),
    agentId: "agent-1",
    mandateId: "mandate-1",
    actionId: "action-1",
    action: "tool_call",
    tool: "send_email",
    decision: "ALLOW",
    reason: "All checks passed",
    estimatedCost: 0.01,
    actualCost: 0.01,
    cumulativeCost: 0.01,
  };

  describe("ConsoleAuditLogger", () => {
    let originalLog: typeof console.log;
    let logs: string[];

    beforeEach(() => {
      logs = [];
      originalLog = console.log;
      console.log = (msg: string) => {
        logs.push(msg);
      };
    });

    afterEach(() => {
      console.log = originalLog;
    });

    it("logs to console as JSON", () => {
      const logger = new ConsoleAuditLogger();
      logger.log(mockEntry);

      expect(logs).toHaveLength(1);
      const parsed = JSON.parse(logs[0]);
      expect(parsed.id).toBe("audit-1");
      expect(parsed.agentId).toBe("agent-1");
      expect(parsed.decision).toBe("ALLOW");
    });

    it("does not throw on logging errors", () => {
      const logger = new ConsoleAuditLogger();

      // Create an object that can't be JSON stringified
      const circularEntry = { ...mockEntry } as any;
      circularEntry.circular = circularEntry;

      // Should not throw
      expect(() => logger.log(circularEntry)).not.toThrow();
    });
  });

  describe("MemoryAuditLogger", () => {
    it("stores entries in memory", () => {
      const logger = new MemoryAuditLogger();

      logger.log(mockEntry);
      logger.log({ ...mockEntry, id: "audit-2" });

      const entries = logger.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe("audit-1");
      expect(entries[1].id).toBe("audit-2");
    });

    it("returns copy of entries (not reference)", () => {
      const logger = new MemoryAuditLogger();
      logger.log(mockEntry);

      const entries1 = logger.getEntries();
      const entries2 = logger.getEntries();

      expect(entries1).not.toBe(entries2); // Different arrays
      expect(entries1).toEqual(entries2); // Same content
    });

    it("clears entries", () => {
      const logger = new MemoryAuditLogger();
      logger.log(mockEntry);
      logger.log(mockEntry);

      expect(logger.count()).toBe(2);

      logger.clear();

      expect(logger.count()).toBe(0);
      expect(logger.getEntries()).toHaveLength(0);
    });

    it("counts entries", () => {
      const logger = new MemoryAuditLogger();

      expect(logger.count()).toBe(0);

      logger.log(mockEntry);
      expect(logger.count()).toBe(1);

      logger.log(mockEntry);
      expect(logger.count()).toBe(2);
    });
  });

  describe("FileAuditLogger", () => {
    const testFile = path.join(__dirname, "test-audit.log");

    afterEach(async () => {
      // Clean up test file
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    });

    it("writes entries to file as JSON lines", async () => {
      const logger = new FileAuditLogger(testFile);

      await logger.log(mockEntry);
      await logger.log({ ...mockEntry, id: "audit-2" });
      await logger.close();

      // Read file
      const content = fs.readFileSync(testFile, "utf-8");
      const lines = content.trim().split("\n");

      expect(lines).toHaveLength(2);

      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);

      expect(entry1.id).toBe("audit-1");
      expect(entry2.id).toBe("audit-2");
    });

    it("appends to existing file", async () => {
      // First logger
      const logger1 = new FileAuditLogger(testFile);
      await logger1.log(mockEntry);
      await logger1.close();

      // Second logger (appends)
      const logger2 = new FileAuditLogger(testFile);
      await logger2.log({ ...mockEntry, id: "audit-2" });
      await logger2.close();

      // Read file
      const content = fs.readFileSync(testFile, "utf-8");
      const lines = content.trim().split("\n");

      expect(lines).toHaveLength(2);
    });

    it("does not throw on write errors", async () => {
      const logger = new FileAuditLogger("/invalid/path/audit.log");

      // Should not throw (errors are swallowed)
      await expect(logger.log(mockEntry)).resolves.toBeUndefined();

      // Give it time to fail initialization
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Try again - should still not throw
      await expect(logger.log(mockEntry)).resolves.toBeUndefined();
    });
  });

  describe("NoOpAuditLogger", () => {
    it("discards all entries", () => {
      const logger = new NoOpAuditLogger();

      // Should not throw and should do nothing
      expect(() => logger.log(mockEntry)).not.toThrow();
      expect(() => logger.log(mockEntry)).not.toThrow();
    });
  });

  describe("MultiAuditLogger", () => {
    it("logs to multiple destinations", async () => {
      const memory1 = new MemoryAuditLogger();
      const memory2 = new MemoryAuditLogger();

      const multi = new MultiAuditLogger([memory1, memory2]);

      await multi.log(mockEntry);

      expect(memory1.count()).toBe(1);
      expect(memory2.count()).toBe(1);
      expect(memory1.getEntries()[0]).toEqual(mockEntry);
      expect(memory2.getEntries()[0]).toEqual(mockEntry);
    });

    it("continues logging even if one logger fails", async () => {
      const memory = new MemoryAuditLogger();
      const failing = new FileAuditLogger("/invalid/path/audit.log");

      const multi = new MultiAuditLogger([memory, failing]);

      await multi.log(mockEntry);

      // Memory logger should have received the entry
      expect(memory.count()).toBe(1);
    });

    it("works with empty logger array", async () => {
      const multi = new MultiAuditLogger([]);

      // Should not throw
      await expect(multi.log(mockEntry)).resolves.toBeUndefined();
    });
  });
});
