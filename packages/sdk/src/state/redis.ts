import Redis from "ioredis";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { StateManager, RedisConfig } from "./types";
import type { Action, AgentState, RateLimit, Mandate } from "../types";

/**
 * Redis-backed StateManager (Phase 3).
 *
 * Features:
 * - Distributed state across multiple servers
 * - Atomic operations via Lua scripts
 * - Global per-agent limits
 * - Pub/sub kill switch
 *
 * Use for:
 * - Multi-process deployment
 * - Distributed agents
 * - Global enforcement
 */
export class RedisStateManager implements StateManager {
  private redis: Redis;
  private subscriber: Redis; // Separate connection for pub/sub
  private keyPrefix: string;
  private checkAndCommitSha: string | null = null;
  private killCallbacks: Map<string, (reason: string) => void> = new Map();

  constructor(config: RedisConfig) {
    this.keyPrefix = config.keyPrefix || "mandate:";

    // Create Redis client
    this.redis = new Redis({
      host: config.host || "localhost",
      port: config.port || 6379,
      password: config.password,
      db: config.db || 0,
      connectTimeout: config.connectTimeout || 5000,
      commandTimeout: config.commandTimeout || 1000,
      maxRetriesPerRequest: config.maxRetries || 3,
      keepAlive: config.keepAlive !== false ? 30000 : 0,

      // Retry strategy
      retryStrategy: (times: number) => {
        if (times > (config.maxRetries || 3)) {
          return null; // Stop retrying
        }
        return Math.min(times * 50, 2000); // Exponential backoff
      },

      // Error handling
      lazyConnect: true, // Don't connect until first command
    });

    // Error handling
    this.redis.on("error", (err) => {
      console.error("[RedisStateManager] Redis error:", err);
    });

    // Subscriber connection (pub/sub requires dedicated connection)
    this.subscriber = new Redis({
      host: config.host || "localhost",
      port: config.port || 6379,
      password: config.password,
      db: config.db || 0,
    });

    // Subscribe to kill broadcast channel
    this.setupKillSwitch();
  }

  /**
   * Setup global kill switch via pub/sub.
   */
  private setupKillSwitch(): void {
    const channel = `${this.keyPrefix}kill:broadcast`;

    this.subscriber.subscribe(channel, (err) => {
      if (err) {
        console.error(
          "[RedisStateManager] Failed to subscribe to kill channel:",
          err
        );
      }
    });

    this.subscriber.on("message", (ch, message) => {
      if (ch === channel) {
        try {
          const { agentId, reason } = JSON.parse(message);

          // Trigger callbacks
          const callback = this.killCallbacks.get(agentId);
          if (callback) {
            callback(reason);
          }
        } catch (err) {
          console.error("[RedisStateManager] Invalid kill message:", err);
        }
      }
    });
  }

  /**
   * Get state for an agent.
   *
   * Redis structure:
   * Key: mandate:state:{agentId}:{mandateId}
   * Type: Hash
   * Fields: cumulativeCost, cognitionCost, executionCost, callCount, etc.
   */
  async get(agentId: string, mandateId: string): Promise<AgentState> {
    const key = this.stateKey(agentId, mandateId);

    // Get all fields from hash
    const data = await this.redis.hgetall(key);

    // If doesn't exist, create default
    if (Object.keys(data).length === 0) {
      const defaultState = this.createDefault(agentId, mandateId);
      await this.saveState(key, defaultState);
      return defaultState;
    }

    // Parse from Redis
    return this.parseState(data);
  }

  async commitSuccess(
    action: Action,
    state: AgentState,
    result?: { actualCost?: number },
    _agentRateLimit?: RateLimit,
    _toolRateLimit?: RateLimit
  ): Promise<void> {
    // For now, use simple implementation (will be replaced with Lua in Task 2.3)
    const actualCost = result?.actualCost ?? action.estimatedCost ?? 0;
    const key = this.stateKey(state.agentId, state.mandateId);

    // Update state object
    state.cumulativeCost += actualCost;

    if (action.costType === "COGNITION") {
      state.cognitionCost += actualCost;
    } else if (action.costType === "EXECUTION") {
      state.executionCost += actualCost;
    }

    state.seenActionIds.add(action.id);
    if (action.idempotencyKey) {
      state.seenIdempotencyKeys.add(action.idempotencyKey);
    }

    // Update call count
    state.callCount += 1;

    // Save to Redis
    await this.saveState(key, state);
  }

  /**
   * Kill agent and broadcast to all servers.
   *
   * @param state - Agent state
   * @param reason - Kill reason
   */
  async kill(state: AgentState, reason?: string): Promise<void> {
    const killReason = reason || "Kill switch activated";

    // Update state
    state.killed = true;
    state.killedAt = Date.now();
    state.killedReason = killReason;

    const key = this.stateKey(state.agentId, state.mandateId);
    await this.saveState(key, state);

    // Broadcast kill to all servers
    const channel = `${this.keyPrefix}kill:broadcast`;
    await this.redis.publish(
      channel,
      JSON.stringify({
        agentId: state.agentId,
        mandateId: state.mandateId,
        reason: killReason,
        timestamp: Date.now(),
      })
    );
  }

  /**
   * Register callback for kill events.
   *
   * @param agentId - Agent to watch
   * @param callback - Called when agent is killed
   */
  onKill(agentId: string, callback: (reason: string) => void): void {
    this.killCallbacks.set(agentId, callback);
  }

  /**
   * Unregister kill callback.
   *
   * @param agentId - Agent to stop watching
   */
  offKill(agentId: string): void {
    this.killCallbacks.delete(agentId);
  }

  async remove(agentId: string): Promise<void> {
    // Find all keys for this agent
    const pattern = `${this.keyPrefix}state:${agentId}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async isKilled(agentId: string, mandateId: string): Promise<boolean> {
    const state = await this.get(agentId, mandateId);
    return state.killed;
  }

  async close(): Promise<void> {
    await this.subscriber.quit();
    await this.redis.quit();
  }

  /**
   * Load Lua scripts into Redis.
   * Called automatically on first use.
   */
  private async loadScripts(): Promise<void> {
    if (this.checkAndCommitSha) {
      return; // Already loaded
    }

    // Load check-and-commit script
    // Use fileURLToPath to handle ES modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const scriptPath = path.join(__dirname, "lua", "check-and-commit.lua");
    const script = fs.readFileSync(scriptPath, "utf-8");

    const sha = await this.redis.script("LOAD", script);
    this.checkAndCommitSha = sha as string;
  }

  /**
   * Atomic check and commit via Lua script.
   *
   * This replaces the non-atomic get() → evaluate() → commitSuccess() pattern
   * with a single atomic operation.
   */
  async checkAndCommit(
    action: Action,
    mandate: Mandate
  ): Promise<{
    allowed: boolean;
    reason: string;
    code?: string;
    remainingCost?: number;
    remainingCalls?: number;
  }> {
    await this.loadScripts();

    const stateKey = this.stateKey(action.agentId, mandate.id);
    const rateLimitKey = `${this.keyPrefix}ratelimit:${action.agentId}:${mandate.id}`;
    const toolRateLimitKey =
      action.type === "tool_call"
        ? `${this.keyPrefix}tool:ratelimit:${action.agentId}:${action.tool}`
        : "";

    const result = await this.redis.evalsha(
      this.checkAndCommitSha!,
      3, // number of keys
      stateKey,
      rateLimitKey,
      toolRateLimitKey,
      // ARGV
      action.id,
      action.idempotencyKey || "",
      (action.estimatedCost || 0).toString(),
      action.costType || "EXECUTION",
      mandate.maxCostPerCall?.toString() || "",
      mandate.maxCostTotal?.toString() || "",
      mandate.rateLimit?.maxCalls?.toString() || "",
      mandate.rateLimit?.windowMs?.toString() || "",
      (action.type === "tool_call" &&
        mandate.toolPolicies?.[action.tool]?.rateLimit?.maxCalls?.toString()) ||
        "",
      (action.type === "tool_call" &&
        mandate.toolPolicies?.[action.tool]?.rateLimit?.windowMs?.toString()) ||
        "",
      action.timestamp.toString()
    );

    return JSON.parse(result as string);
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private stateKey(agentId: string, mandateId: string): string {
    return `${this.keyPrefix}state:${agentId}:${mandateId}`;
  }

  private createDefault(agentId: string, mandateId: string): AgentState {
    return {
      agentId,
      mandateId,
      cumulativeCost: 0,
      cognitionCost: 0,
      executionCost: 0,
      callCount: 0,
      windowStart: Date.now(),
      toolCallCounts: {},
      seenActionIds: new Set(),
      seenIdempotencyKeys: new Set(),
      killed: false,
    };
  }

  private async saveState(key: string, state: AgentState): Promise<void> {
    // Convert state to Redis hash
    await this.redis.hset(key, {
      agentId: state.agentId,
      mandateId: state.mandateId,
      cumulativeCost: state.cumulativeCost.toString(),
      cognitionCost: state.cognitionCost.toString(),
      executionCost: state.executionCost.toString(),
      callCount: state.callCount.toString(),
      windowStart: state.windowStart.toString(),
      toolCallCounts: JSON.stringify(
        Object.fromEntries(Object.entries(state.toolCallCounts))
      ),
      seenActionIds: JSON.stringify(Array.from(state.seenActionIds)),
      seenIdempotencyKeys: JSON.stringify(
        Array.from(state.seenIdempotencyKeys)
      ),
      killed: state.killed ? "1" : "0",
      killedAt: state.killedAt?.toString() || "",
      killedReason: state.killedReason || "",
    });
  }

  private parseState(data: Record<string, string>): AgentState {
    return {
      agentId: data.agentId,
      mandateId: data.mandateId,
      cumulativeCost: parseFloat(data.cumulativeCost) || 0,
      cognitionCost: parseFloat(data.cognitionCost) || 0,
      executionCost: parseFloat(data.executionCost) || 0,
      callCount: parseInt(data.callCount, 10) || 0,
      windowStart: parseInt(data.windowStart, 10) || Date.now(),
      toolCallCounts: data.toolCallCounts
        ? JSON.parse(data.toolCallCounts)
        : {},
      seenActionIds: new Set(
        data.seenActionIds ? JSON.parse(data.seenActionIds) : []
      ),
      seenIdempotencyKeys: new Set(
        data.seenIdempotencyKeys ? JSON.parse(data.seenIdempotencyKeys) : []
      ),
      killed: data.killed === "1",
      killedAt: data.killedAt ? parseInt(data.killedAt, 10) : undefined,
      killedReason: data.killedReason || undefined,
    };
  }
}
