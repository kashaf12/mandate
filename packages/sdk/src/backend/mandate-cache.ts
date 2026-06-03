import type { Mandate } from "../types";

/**
 * Configuration for MandateCache.
 */
export interface MandateCacheConfig {
  /**
   * Time-to-live for cached mandates in milliseconds.
   * Default: 5 minutes (300000ms)
   *
   * Must be less than mandate expiration time (backend sets 5min).
   */
  ttl?: number;

  /**
   * Maximum cache size (number of mandates).
   * Default: 100
   *
   * LRU eviction when exceeded.
   */
  maxSize?: number;
}

/**
 * Cached mandate entry with metadata.
 */
interface CachedMandate {
  mandate: Mandate;
  cachedAt: number; // Epoch milliseconds when cached
  expiresAt: number; // Epoch milliseconds when cache entry expires
}

/**
 * TTL-based in-memory cache for mandates.
 *
 * Features:
 * - Context-aware cache keys (same context = cache hit)
 * - TTL expiration (default 5 minutes)
 * - Mandate expiration check (respects mandate.expiresAt)
 * - LRU eviction (when max size exceeded)
 * - Thread-safe (single-threaded Node.js, no locks needed)
 *
 * Cache key format: `agentId:contextJSON`
 * - agentId: agent identifier
 * - contextJSON: deterministic JSON (sorted keys)
 *
 * Example:
 * - agentId: "agent-123"
 * - context: { user_tier: "free", environment: "prod" }
 * - key: "agent-123:{"environment":"prod","user_tier":"free"}"
 *
 * @example
 * ```typescript
 * const cache = new MandateCache({ ttl: 300000 }); // 5 minutes
 *
 * // Store mandate
 * cache.set('agent-123', { user_tier: 'free' }, mandate);
 *
 * // Retrieve mandate
 * const cached = cache.get('agent-123', { user_tier: 'free' });
 * if (cached) {
 *   console.log('Cache hit:', cached.id);
 * }
 *
 * // Check if has valid cached mandate
 * if (cache.has('agent-123', { user_tier: 'free' })) {
 *   console.log('Valid mandate in cache');
 * }
 * ```
 */
export class MandateCache {
  private cache: Map<string, CachedMandate>;
  private ttl: number;
  private maxSize: number;

  constructor(config: MandateCacheConfig = {}) {
    this.cache = new Map();
    this.ttl = config.ttl ?? 300000; // 5 minutes default
    this.maxSize = config.maxSize ?? 100;
  }

  /**
   * Store mandate in cache.
   *
   * @param agentId - Agent identifier
   * @param context - Context used for mandate issuance
   * @param mandate - Mandate to cache
   */
  set(
    agentId: string,
    context: Record<string, string>,
    mandate: Mandate
  ): void {
    const key = this.buildKey(agentId, context);
    const now = Date.now();

    const entry: CachedMandate = {
      mandate,
      cachedAt: now,
      expiresAt: now + this.ttl,
    };

    // LRU eviction: delete oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, entry);
  }

  /**
   * Retrieve mandate from cache.
   *
   * Returns null if:
   * - Cache miss (not in cache)
   * - Cache entry expired (TTL exceeded)
   * - Mandate expired (mandate.expiresAt < now)
   *
   * @param agentId - Agent identifier
   * @param context - Context used for mandate issuance
   * @returns Cached mandate or null
   */
  get(agentId: string, context: Record<string, string>): Mandate | null {
    const key = this.buildKey(agentId, context);
    const entry = this.cache.get(key);

    if (!entry) {
      return null; // Cache miss
    }

    const now = Date.now();

    // Check cache entry expiration (TTL)
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null; // Cache entry expired
    }

    // Check mandate expiration
    if (entry.mandate.expiresAt && now > entry.mandate.expiresAt) {
      this.cache.delete(key);
      return null; // Mandate expired
    }

    return entry.mandate;
  }

  /**
   * Check if cache has valid mandate.
   *
   * @param agentId - Agent identifier
   * @param context - Context used for mandate issuance
   * @returns true if valid cached mandate exists
   */
  has(agentId: string, context: Record<string, string>): boolean {
    return this.get(agentId, context) !== null;
  }

  /**
   * Delete cached mandate.
   *
   * @param agentId - Agent identifier
   * @param context - Context used for mandate issuance
   * @returns true if entry was deleted, false if not found
   */
  delete(agentId: string, context: Record<string, string>): boolean {
    const key = this.buildKey(agentId, context);
    return this.cache.delete(key);
  }

  /**
   * Clear all cached mandates.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size (number of entries).
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics.
   */
  stats(): {
    size: number;
    maxSize: number;
    ttl: number;
    oldestEntry?: number; // Age in ms
  } {
    const now = Date.now();
    let oldestAge: number | undefined;

    for (const entry of this.cache.values()) {
      const age = now - entry.cachedAt;
      if (oldestAge === undefined || age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      oldestEntry: oldestAge,
    };
  }

  /**
   * Build deterministic cache key from agentId and context.
   *
   * Key format: `agentId:contextJSON`
   *
   * Context is serialized with sorted keys to ensure:
   * - { a: "1", b: "2" } === { b: "2", a: "1" }
   *
   * @param agentId - Agent identifier
   * @param context - Context object
   * @returns Cache key string
   */
  private buildKey(agentId: string, context: Record<string, string>): string {
    // Sort context keys for deterministic serialization
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
    return `${agentId}:${contextJson}`;
  }
}
