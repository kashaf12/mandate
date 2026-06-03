import type { Mandate } from "../types";
import type { MandateAPI } from "./mandate-api";
import { MandateCache } from "./mandate-cache";
import type { MandateCacheConfig } from "./mandate-cache";

/**
 * Configuration for MandateManager.
 */
export interface MandateManagerConfig {
  /** Agent identifier */
  agentId: string;

  /** Mandate API for backend operations */
  mandateAPI: MandateAPI;

  /** Cache configuration (optional) */
  cacheConfig?: MandateCacheConfig;

  /**
   * Background refresh interval in milliseconds.
   * Default: 240000 (4 minutes)
   *
   * Should be less than cache TTL to ensure fresh mandates.
   */
  refreshInterval?: number;

  /**
   * Enable automatic background refresh.
   * Default: false
   *
   * When enabled, starts refreshing on first getMandate() call.
   */
  autoRefresh?: boolean;
}

/**
 * Mandate Manager - Orchestrates cache and backend for mandate operations.
 *
 * Features:
 * - Cache-first lookup (fast path)
 * - Backend fetch on cache miss (slow path)
 * - Graceful degradation (stale cache on backend failure)
 * - Background refresh (auto-refresh mode)
 * - Manual refresh
 * - Cache management
 *
 * @example
 * ```typescript
 * const manager = new MandateManager({
 *   agentId: 'agent-123',
 *   mandateAPI: backend.mandates,
 *   autoRefresh: true,
 * });
 *
 * // Get mandate (cache or backend)
 * const mandate = await manager.getMandate({
 *   user_tier: 'free',
 *   environment: 'production'
 * });
 * ```
 */
export class MandateManager {
  private agentId: string;
  private mandateAPI: MandateAPI;
  private cache: MandateCache;
  private refreshInterval: number;
  private autoRefresh: boolean;
  private refreshTimer?: NodeJS.Timeout;
  private lastContext?: Record<string, string>;

  constructor(config: MandateManagerConfig) {
    this.agentId = config.agentId;
    this.mandateAPI = config.mandateAPI;
    this.cache = new MandateCache(config.cacheConfig);
    this.refreshInterval = config.refreshInterval ?? 240000; // 4 minutes default
    this.autoRefresh = config.autoRefresh ?? false;
  }

  /**
   * Get mandate for given context.
   *
   * Flow:
   * 1. Check cache (fast path)
   * 2. If miss, fetch from backend (slow path)
   * 3. Cache the result
   * 4. Start auto-refresh if enabled
   * 5. On backend failure, use stale cache if available
   *
   * @param context - Context for mandate issuance
   * @returns Mandate (from cache or backend)
   * @throws Error if backend fails and no cache available
   */
  async getMandate(context: Record<string, string>): Promise<Mandate> {
    // 1. Check for stale cache FIRST (before cache.get() deletes expired entries)
    // This allows us to use stale cache even if TTL expired
    const staleCache = this.getStaleCache(context);
    if (staleCache) {
      // Re-cache the stale mandate (refresh TTL)
      this.cache.set(this.agentId, context, staleCache);
      this.lastContext = context;
      return staleCache;
    }

    // 2. Check cache (fast path) - only if no stale cache
    const cached = this.cache.get(this.agentId, context);
    if (cached) {
      this.lastContext = context;
      return cached;
    }

    // 3. Fetch from backend (slow path)
    try {
      const mandate = await this.mandateAPI.issue(this.agentId, context);
      this.cache.set(this.agentId, context, mandate);
      this.lastContext = context;

      // Start auto-refresh on first call
      if (this.autoRefresh && !this.refreshTimer) {
        this.startAutoRefresh();
      }

      return mandate;
    } catch (error) {
      // Final fallback: check stale cache again (in case it was added between checks)
      const finalStaleCache = this.getStaleCache(context);
      if (finalStaleCache) {
        console.warn(
          `Backend unavailable, using stale mandate: ${finalStaleCache.id}`
        );
        this.cache.set(this.agentId, context, finalStaleCache);
        return finalStaleCache;
      }
      throw error;
    }
  }

  /**
   * Manually refresh mandate from backend.
   *
   * @param context - Context to refresh (uses last context if not provided)
   * @returns true if refresh succeeded, false otherwise
   */
  async refresh(context?: Record<string, string>): Promise<boolean> {
    const contextToUse = context ?? this.lastContext;
    if (!contextToUse) {
      return false;
    }

    try {
      const mandate = await this.mandateAPI.issue(this.agentId, contextToUse);
      this.cache.set(this.agentId, contextToUse, mandate);
      return true;
    } catch (error) {
      console.error("Failed to refresh mandate:", error);
      return false;
    }
  }

  /**
   * Start automatic background refresh.
   *
   * Refreshes mandate at configured interval using last context.
   * Safe to call multiple times (idempotent).
   */
  startAutoRefresh(): void {
    if (this.refreshTimer) {
      return; // Already started
    }

    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, this.refreshInterval);

    // Allow process to exit even if timer is running
    if (typeof this.refreshTimer.unref === "function") {
      this.refreshTimer.unref();
    }
  }

  /**
   * Stop automatic background refresh.
   *
   * Clears the refresh timer. Safe to call even if not started.
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Clear all cached mandates.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  getCacheStats() {
    return this.cache.stats();
  }

  /**
   * Check if mandate is cached for given context.
   *
   * @param context - Context to check
   * @returns true if valid cached mandate exists
   */
  hasCachedMandate(context: Record<string, string>): boolean {
    return this.cache.has(this.agentId, context);
  }

  /**
   * Get stale cache entry (even if TTL expired, as long as mandate is valid).
   * Used for graceful degradation when backend fails.
   *
   * @param context - Context to check
   * @returns Stale mandate or null
   */
  private getStaleCache(context: Record<string, string>): Mandate | null {
    // Build cache key (same logic as MandateCache.buildKey)
    const sortedContext = Object.keys(context)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = context[key];
          return acc;
        },
        {} as Record<string, string>
      );

    const contextJson = JSON.stringify(sortedContext);
    const key = `${this.agentId}:${contextJson}`;

    // Access cache internals to check for stale entries
    const cacheMap = (this.cache as any).cache as Map<
      string,
      { mandate: Mandate; cachedAt: number; expiresAt: number }
    >;
    const entry = cacheMap.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();

    // Check if mandate itself has expired (not just cache TTL)
    if (entry.mandate.expiresAt && now > entry.mandate.expiresAt) {
      return null; // Mandate expired, can't use
    }

    // Even if cache TTL expired, mandate is still valid
    return entry.mandate;
  }
}
