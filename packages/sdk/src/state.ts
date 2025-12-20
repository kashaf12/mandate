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
   * Commit state changes after execution.
   *
   * CRITICAL: Can be called after success OR failure, depending on charging policy.
   * The cost parameter has already been computed by the charging policy evaluator.
   *
   * @param action - The action that was executed
   * @param state - Agent state to mutate
   * @param cost - Actual cost to charge (computed by charging policy)
   * @param agentRateLimit - Agent-level rate limit (optional)
   * @param toolRateLimit - Tool-level rate limit (optional)
   */
  commitSuccess(
    action: Action,
    state: AgentState,
    cost: number,
    agentRateLimit?: RateLimit,
    toolRateLimit?: RateLimit
  ): void {
    // Update cumulative cost with the computed cost
    state.cumulativeCost += cost;

    // Track cost by type (COGNITION vs EXECUTION)
    if (action.costType === "COGNITION") {
      state.cognitionCost += cost;
    } else if (action.costType === "EXECUTION") {
      state.executionCost += cost;
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
