import type { AgentState, Action, RateLimit } from "./types";

export class StateManager {
  private states = new Map<string, AgentState>();

  /**
   * Get state for an agent. Creates default state if not exists.
   */
  get(agentId: string, mandateId: string): AgentState {
    if (!this.states.has(agentId)) {
      this.states.set(agentId, this.createDefault(agentId, mandateId));
    }
    return this.states.get(agentId)!;
  }

  /**
   * Commit state changes after successful execution.
   *
   * CRITICAL: This must ONLY be called after action succeeds.
   * If execution fails, state remains unchanged.
   *
   * This implements the core invariant:
   * - Authorize → Execute → Commit (only if success)
   */
  commitSuccess(
    action: Action,
    state: AgentState,
    result?: { actualCost?: number },
    agentRateLimit?: RateLimit,
    toolRateLimit?: RateLimit
  ): void {
    const actualCost = result?.actualCost ?? action.estimatedCost ?? 0;

    // Update cumulative cost
    state.cumulativeCost += actualCost;

    // Track cost by type (COGNITION vs EXECUTION)
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

    // Update agent-level rate limit
    if (agentRateLimit) {
      const windowEnd = state.windowStart + agentRateLimit.windowMs;

      // Window expired - reset
      if (action.timestamp >= windowEnd) {
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

    // Update tool-specific rate limit (only for tool calls)
    if (action.type === "tool_call") {
      const tool = action.tool;

      if (toolRateLimit) {
        const toolCount = state.toolCallCounts[tool];

        if (!toolCount) {
          // First call for this tool
          state.toolCallCounts[tool] = {
            count: 1,
            windowStart: action.timestamp,
          };
        } else {
          const windowEnd = toolCount.windowStart + toolRateLimit.windowMs;

          // Window expired - reset
          if (action.timestamp >= windowEnd) {
            state.toolCallCounts[tool] = {
              count: 1,
              windowStart: action.timestamp,
            };
          } else {
            // Window active - increment
            toolCount.count += 1;
          }
        }
      } else {
        // Track tool calls even without rate limit
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
  }

  /**
   * Mark agent as killed.
   */
  kill(state: AgentState, reason?: string): void {
    state.killed = true;
    state.killedAt = Date.now();
    state.killedReason = reason || "Kill switch activated";
  }

  /**
   * Remove agent state (for cleanup).
   */
  remove(agentId: string): void {
    this.states.delete(agentId);
  }

  /**
   * Create default state for a new agent.
   */
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
}
