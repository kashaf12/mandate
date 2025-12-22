import type { Action, AgentState, RateLimit, Mandate } from "../types";

/**
 * StateManager Interface
 *
 * Manages mutable per-agent state.
 *
 * Implementations:
 * - MemoryStateManager: In-process, single-server (Phase 2)
 * - RedisStateManager: Distributed, multi-server (Phase 3)
 *
 * All methods are async to support distributed backends.
 */
export interface StateManager {
  /**
   * Get state for an agent.
   * Creates default state if not exists.
   *
   * @param agentId - Agent identifier
   * @param mandateId - Mandate identifier
   * @returns Agent state
   */
  get(agentId: string, mandateId: string): Promise<AgentState>;

  /**
   * Commit state changes after successful execution.
   *
   * CRITICAL: Only call after action succeeds.
   * If execution fails, state remains unchanged.
   *
   * @param action - The action that was executed
   * @param state - Current agent state
   * @param result - Execution result (optional actualCost)
   * @param agentRateLimit - Agent-level rate limit (optional)
   * @param toolRateLimit - Tool-specific rate limit (optional)
   * @param mandate - Mandate (optional, used for TTL management)
   */
  commitSuccess(
    action: Action,
    state: AgentState,
    result?: { actualCost?: number },
    agentRateLimit?: RateLimit,
    toolRateLimit?: RateLimit,
    mandate?: Mandate
  ): Promise<void>;

  /**
   * Mark agent as killed.
   *
   * @param state - Agent state
   * @param reason - Kill reason (optional)
   */
  kill(state: AgentState, reason?: string): Promise<void>;

  /**
   * Remove agent state (cleanup).
   *
   * @param agentId - Agent identifier
   */
  remove(agentId: string): Promise<void>;

  /**
   * Check if agent is killed.
   *
   * @param agentId - Agent identifier
   * @param mandateId - Mandate identifier
   * @returns true if killed
   */
  isKilled(agentId: string, mandateId: string): Promise<boolean>;

  /**
   * Close connections and cleanup resources.
   * Call this on shutdown.
   */
  close(): Promise<void>;

  /**
   * Register callback for kill events.
   * Called when agent is killed (local or remote).
   *
   * @param agentId - Agent to watch
   * @param callback - Called when killed
   */
  onKill?(agentId: string, callback: (reason: string) => void): void;

  /**
   * Unregister kill callback.
   *
   * @param agentId - Agent to stop watching
   */
  offKill?(agentId: string): void;
}

/**
 * StateManager configuration.
 */
export interface StateManagerConfig {
  /**
   * Backend type.
   *
   * - 'memory': In-process (single server)
   * - 'redis': Distributed (multi-server)
   */
  type: "memory" | "redis";

  /**
   * Redis configuration (required if type='redis').
   */
  redis?: RedisConfig;
}

/**
 * Redis configuration.
 */
export interface RedisConfig {
  /**
   * Redis host.
   * @default 'localhost'
   */
  host?: string;

  /**
   * Redis port.
   * @default 6379
   */
  port?: number;

  /**
   * Redis password (optional).
   */
  password?: string;

  /**
   * Redis database number.
   * @default 0
   */
  db?: number;

  /**
   * Key prefix for all Mandate keys.
   * @default 'mandate:'
   */
  keyPrefix?: string;

  /**
   * Enable Redis cluster mode.
   * @default false
   */
  cluster?: boolean;

  /**
   * Cluster nodes (required if cluster=true).
   */
  clusterNodes?: Array<{ host: string; port: number }>;

  /**
   * Connection timeout (ms).
   * @default 5000
   */
  connectTimeout?: number;

  /**
   * Command timeout (ms).
   * @default 1000
   */
  commandTimeout?: number;

  /**
   * Max retry attempts.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Enable keepAlive.
   * @default true
   */
  keepAlive?: boolean;
}
