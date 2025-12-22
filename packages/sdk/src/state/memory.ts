import type { StateManager } from "./types";
import type { Action, AgentState, RateLimit, Mandate } from "../types";

/**
 * In-memory StateManager (Phase 2).
 *
 * Limitations:
 * - Not shared across processes
 * - Lost on restart
 * - No distributed coordination
 *
 * Use for:
 * - Single-process deployment
 * - Development/testing
 * - Low-latency requirements
 */
export class MemoryStateManager implements StateManager {
  private states = new Map<string, AgentState>();
  private killCallbacks = new Map<string, (reason: string) => void>();

  /**
   * GAP 1: Reconcile expired execution leases.
   * Called passively on state access to clean up hung executions.
   */
  private reconcileExpiredLeases(state: AgentState): void {
    if (!state.executionLeases || state.executionLeases.size === 0) {
      return;
    }

    const now = Date.now();
    for (const [actionId, leaseExpiresAt] of state.executionLeases.entries()) {
      if (leaseExpiresAt < now) {
        // Lease expired - remove from tracking
        // Note: Actual authority rollback would require knowing the reserved cost
        // For now, we just clean up the lease tracking
        state.executionLeases.delete(actionId);
      }
    }
  }

  async get(agentId: string, mandateId: string): Promise<AgentState> {
    const key = `${agentId}:${mandateId}`;

    if (!this.states.has(key)) {
      this.states.set(key, this.createDefault(agentId, mandateId));
    }

    const state = this.states.get(key)!;

    // GAP 1: Reconcile expired leases on state access
    this.reconcileExpiredLeases(state);

    return state;
  }

  async commitSuccess(
    action: Action,
    state: AgentState,
    result?: { actualCost?: number },
    agentRateLimit?: RateLimit,
    toolRateLimit?: RateLimit,
    _mandate?: Mandate // Accept for interface compatibility, not used in memory
  ): Promise<void> {
    const actualCost = result?.actualCost ?? action.estimatedCost ?? 0;

    // Update cumulative cost
    state.cumulativeCost += actualCost;

    // Update cost by type
    if (action.costType === "COGNITION") {
      state.cognitionCost += actualCost;
    } else if (action.costType === "EXECUTION") {
      state.executionCost += actualCost;
    }

    // Record action ID for replay protection
    state.seenActionIds.add(action.id);

    // Record idempotency key if present
    if (action.idempotencyKey) {
      state.seenIdempotencyKeys.add(action.idempotencyKey);
    }

    // GAP 1: Clear execution lease on successful commit
    if (state.executionLeases) {
      state.executionLeases.delete(action.id);
    }

    // Update agent-level rate limit
    if (agentRateLimit) {
      const windowEnd = state.windowStart + agentRateLimit.windowMs;

      if (action.timestamp >= windowEnd) {
        // Window expired - reset
        state.windowStart = action.timestamp;
        state.callCount = 1;
      } else {
        // Window active - increment
        state.callCount += 1;
      }
    } else {
      // No rate limit - just increment for tracking
      state.callCount += 1;
    }

    // Update tool-specific rate limit
    if (action.type === "tool_call" && toolRateLimit) {
      const tool = action.tool;
      const toolCount = state.toolCallCounts[tool];

      if (!toolCount) {
        state.toolCallCounts[tool] = {
          count: 1,
          windowStart: action.timestamp,
        };
      } else {
        const windowEnd = toolCount.windowStart + toolRateLimit.windowMs;

        if (action.timestamp >= windowEnd) {
          // Window expired - reset
          state.toolCallCounts[tool] = {
            count: 1,
            windowStart: action.timestamp,
          };
        } else {
          // Window active - increment
          toolCount.count += 1;
        }
      }
    } else if (action.type === "tool_call") {
      // Track tool calls even without rate limit
      const tool = action.tool;
      if (!state.toolCallCounts[tool]) {
        state.toolCallCounts[tool] = {
          count: 1,
          windowStart: action.timestamp,
        };
      } else {
        state.toolCallCounts[tool].count += 1;
      }
    }
  }

  async kill(state: AgentState, reason?: string): Promise<void> {
    state.killed = true;
    state.killedAt = Date.now();
    state.killedReason = reason || "Kill switch activated";

    // Trigger callback (local only)
    const callback = this.killCallbacks.get(state.agentId);
    if (callback) {
      callback(state.killedReason);
    }
  }

  onKill(agentId: string, callback: (reason: string) => void): void {
    this.killCallbacks.set(agentId, callback);
  }

  offKill(agentId: string): void {
    this.killCallbacks.delete(agentId);
  }

  async remove(agentId: string): Promise<void> {
    // Remove all states for this agent (across all mandates)
    for (const key of this.states.keys()) {
      if (key.startsWith(`${agentId}:`)) {
        this.states.delete(key);
      }
    }
  }

  async isKilled(agentId: string, mandateId: string): Promise<boolean> {
    const state = await this.get(agentId, mandateId);
    return state.killed;
  }

  async close(): Promise<void> {
    // No-op for memory backend
  }

  /**
   * Clear all states (for testing).
   */
  clear(): void {
    this.states.clear();
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
      executionLeases: new Map(), // GAP 1: Track execution leases
      killed: false,
    };
  }
}
