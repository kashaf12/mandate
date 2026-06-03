import type { AuditEntry } from "../types";
import type { AuditAPI } from "./audit-api";

/**
 * Configuration for AuditBatcher.
 */
export interface AuditBatcherConfig {
  /**
   * Audit API client for syncing to backend.
   */
  auditAPI: AuditAPI;

  /**
   * Batch size - flush when this many logs accumulated.
   * Default: 100
   */
  batchSize?: number;

  /**
   * Flush interval in milliseconds - flush periodically.
   * Default: 30000 (30 seconds)
   */
  flushInterval?: number;

  /**
   * Maximum buffer size - drop oldest logs if exceeded.
   * Default: 1000
   *
   * Prevents memory leaks on persistent backend failures.
   */
  maxBufferSize?: number;
}

/**
 * Statistics for monitoring batcher health.
 */
export interface BatcherStats {
  bufferedLogs: number;
  totalAdded: number;
  totalFlushed: number;
  totalDropped: number;
  failedFlushes: number;
  lastFlushAt?: number;
  lastFlushSize?: number;
}

/**
 * Audit log batcher with automatic flushing and failure handling.
 *
 * Features:
 * - Batch logs (default: 100 entries)
 * - Auto-flush (default: 30 seconds)
 * - Re-queue on failure (with max buffer limit)
 * - Memory-safe (drops oldest logs when buffer exceeds 1000)
 * - Manual flush support
 * - Statistics tracking
 *
 * Use cases:
 * - Reduce backend API calls (batch 100 logs → 1 API call)
 * - Handle temporary network failures (re-queue + retry)
 * - Prevent memory leaks (cap buffer at 1000 logs)
 * - Graceful shutdown (flush on close)
 *
 * @example
 * ```typescript
 * const batcher = new AuditBatcher({
 *   auditAPI: backend.audit,
 *   batchSize: 100,
 *   flushInterval: 30000
 * });
 *
 * // Add logs (buffers automatically)
 * batcher.add(auditEntry);
 *
 * // Auto-flush happens every 30s or when 100 logs buffered
 *
 * // Manual flush (e.g., on shutdown)
 * await batcher.flush();
 *
 * // Cleanup
 * batcher.stop();
 * ```
 */
export class AuditBatcher {
  private auditAPI: AuditAPI;
  private batchSize: number;
  private flushInterval: number;
  private maxBufferSize: number;

  private buffer: AuditEntry[] = [];
  private flushTimer?: NodeJS.Timeout;

  // Statistics
  private stats: BatcherStats = {
    bufferedLogs: 0,
    totalAdded: 0,
    totalFlushed: 0,
    totalDropped: 0,
    failedFlushes: 0,
  };

  constructor(config: AuditBatcherConfig) {
    this.auditAPI = config.auditAPI;
    this.batchSize = config.batchSize ?? 100;
    this.flushInterval = config.flushInterval ?? 30000;
    this.maxBufferSize = config.maxBufferSize ?? 1000;

    this.startFlushTimer();
  }

  /**
   * Add audit log to buffer.
   *
   * Automatically flushes when batch size reached.
   * Drops oldest logs if buffer exceeds max size.
   *
   * @param entry - Audit log entry
   */
  add(entry: AuditEntry): void {
    // Drop oldest logs if buffer full
    if (this.buffer.length >= this.maxBufferSize) {
      this.buffer.shift(); // Remove oldest
      this.stats.totalDropped++;
    }

    this.buffer.push(entry);
    this.stats.totalAdded++;
    this.stats.bufferedLogs = this.buffer.length;

    // Auto-flush when batch size reached
    if (this.buffer.length >= this.batchSize) {
      this.flush().catch((error) => {
        console.error("Auto-flush failed:", error);
      });
    }
  }

  /**
   * Flush buffered logs to backend.
   *
   * Returns immediately if buffer is empty.
   * Re-queues logs on failure (with max buffer limit).
   *
   * @returns Number of logs flushed
   */
  async flush(): Promise<number> {
    if (this.buffer.length === 0) {
      return 0;
    }

    // Extract batch (all buffered logs)
    const batch = [...this.buffer];
    this.buffer = [];
    this.stats.bufferedLogs = 0;

    try {
      // Send to backend
      const result = await this.auditAPI.bulkCreate(batch);

      // Success
      this.stats.totalFlushed += result.inserted;
      this.stats.lastFlushAt = Date.now();
      this.stats.lastFlushSize = result.inserted;

      return result.inserted;
    } catch (error) {
      // Failure - re-queue logs
      this.stats.failedFlushes++;

      // Re-queue at front (preserve order)
      this.buffer = [...batch, ...this.buffer];

      // Trim to max buffer size (drop oldest)
      if (this.buffer.length > this.maxBufferSize) {
        const dropped = this.buffer.length - this.maxBufferSize;
        this.buffer = this.buffer.slice(-this.maxBufferSize);
        this.stats.totalDropped += dropped;
      }

      this.stats.bufferedLogs = this.buffer.length;

      throw error;
    }
  }

  /**
   * Get batcher statistics.
   */
  getStats(): BatcherStats {
    return { ...this.stats };
  }

  /**
   * Start automatic flush timer.
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        console.error("Periodic flush failed:", error);
      });
    }, this.flushInterval);

    // Unref to allow process to exit
    if (typeof this.flushTimer.unref === "function") {
      this.flushTimer.unref();
    }
  }

  /**
   * Stop automatic flush timer.
   *
   * Call this on shutdown to cleanup.
   * Does NOT flush buffered logs - call flush() manually first.
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Get number of buffered logs.
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Clear buffer without flushing.
   *
   * WARNING: This discards all buffered logs.
   * Use flush() first if you want to preserve them.
   */
  clear(): void {
    const dropped = this.buffer.length;
    this.buffer = [];
    this.stats.bufferedLogs = 0;
    this.stats.totalDropped += dropped;
  }
}
