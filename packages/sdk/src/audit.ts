import type { AuditEntry } from "./types";

/**
 * Audit logger interface.
 *
 * Implementations must be non-blocking - they should never throw errors
 * that would interrupt execution.
 */
export interface AuditLogger {
  /**
   * Log an audit entry.
   *
   * CRITICAL: This must NEVER throw. If logging fails, swallow the error
   * and optionally log to stderr.
   */
  log(entry: AuditEntry): void | Promise<void>;
}

/**
 * Console logger - logs to stdout as JSON.
 */
export class ConsoleAuditLogger implements AuditLogger {
  log(entry: AuditEntry): void {
    try {
      console.log(JSON.stringify(entry));
    } catch (err) {
      // Swallow errors - never break execution due to logging failure
      console.error("[AUDIT ERROR]", err);
    }
  }
}

/**
 * Memory logger - stores entries in memory (for testing).
 */
export class MemoryAuditLogger implements AuditLogger {
  private entries: AuditEntry[] = [];

  log(entry: AuditEntry): void {
    this.entries.push(entry);
  }

  /**
   * Get all logged entries.
   */
  getEntries(): AuditEntry[] {
    return [...this.entries];
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get entries count.
   */
  count(): number {
    return this.entries.length;
  }
}

/**
 * File logger - appends to a file.
 */
export class FileAuditLogger implements AuditLogger {
  private writeStream: any = null;
  private initPromise: Promise<void> | null = null;

  constructor(private filePath: string) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      // Initialize stream on first write
      if (!this.writeStream && !this.initPromise) {
        this.initPromise = this.initStream();
      }

      if (this.initPromise) {
        await this.initPromise;
      }

      if (!this.writeStream) {
        // Stream failed to initialize
        return;
      }

      this.writeStream.write(JSON.stringify(entry) + "\n");
    } catch (err) {
      // Swallow errors - never break execution
      // Note: We don't log to console.error here because it might be async
    }
  }

  private async initStream(): Promise<void> {
    try {
      const fs = await import("fs");
      this.writeStream = fs.createWriteStream(this.filePath, { flags: "a" });

      // Handle stream errors
      this.writeStream.on("error", () => {
        // Swallow errors
        this.writeStream = null;
      });
    } catch (err) {
      // Failed to create stream - keep writeStream as null
      this.writeStream = null;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Close the file stream.
   */
  async close(): Promise<void> {
    if (this.writeStream) {
      return new Promise((resolve) => {
        this.writeStream!.end(() => resolve());
      });
    }
  }
}

/**
 * No-op logger - discards all entries (for production when you don't want logs).
 */
export class NoOpAuditLogger implements AuditLogger {
  log(_entry: AuditEntry): void {
    // Intentionally empty
  }
}

/**
 * Multi logger - logs to multiple destinations.
 */
export class MultiAuditLogger implements AuditLogger {
  constructor(private loggers: AuditLogger[]) {}

  async log(entry: AuditEntry): Promise<void> {
    // Log to all loggers in parallel, swallow individual errors
    await Promise.allSettled(
      this.loggers.map((logger) => Promise.resolve(logger.log(entry)))
    );
  }
}
