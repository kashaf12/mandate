import type { Action, Mandate, AgentState, Decision } from "./types";
import { isToolAllowed } from "./patterns";
import { validateSchema } from "./validation";
import type { ValidationContext } from "./validation";

export class PolicyEngine {
  /**
   * Evaluate an action against a mandate and current state.
   *
   * This is a PURE FUNCTION:
   * - No side effects
   * - No state mutation
   * - Same input = same output
   *
   * Precedence order (CRITICAL - DO NOT REORDER):
   * 1. Replay check (duplicate action ID or idempotency key)
   * 2. Kill switch
   * 3. Mandate expiration
   * 4. Tool permissions (deny > allow)
   * 5. Argument validation (NEW - Phase 2)
   * 6. Cost limits (per-call, then cumulative)
   * 7. Rate limits (agent-level, then tool-level)
   *
   * @param action - The action to evaluate
   * @param mandate - The authority envelope
   * @param state - Current agent state
   * @returns Decision (ALLOW or BLOCK)
   */
  evaluate(action: Action, mandate: Mandate, state: AgentState): Decision {
    // 1. Replay protection - check both action ID and idempotency key
    if (state.seenActionIds.has(action.id)) {
      return {
        type: "BLOCK",
        reason: `Action ${action.id} has already been executed (replay detected)`,
        code: "DUPLICATE_ACTION",
        hard: true,
      };
    }

    if (
      action.idempotencyKey &&
      state.seenIdempotencyKeys.has(action.idempotencyKey)
    ) {
      return {
        type: "BLOCK",
        reason: `Idempotency key ${action.idempotencyKey} has already been used (replay detected)`,
        code: "DUPLICATE_ACTION",
        hard: true,
      };
    }

    // 2. Kill switch
    if (state.killed) {
      return {
        type: "BLOCK",
        reason: `Agent killed: ${state.killedReason || "Manual termination"}`,
        code: "AGENT_KILLED",
        hard: true,
      };
    }

    // 3. Mandate expiration
    if (mandate.expiresAt && action.timestamp > mandate.expiresAt) {
      return {
        type: "BLOCK",
        reason: `Mandate expired at ${new Date(
          mandate.expiresAt
        ).toISOString()}`,
        code: "MANDATE_EXPIRED",
        hard: true,
      };
    }

    // 4. Tool permissions (only for tool calls)
    if (action.type === "tool_call") {
      const toolAllowed = isToolAllowed(
        action.tool,
        mandate.allowedTools || [],
        mandate.deniedTools || []
      );

      if (!toolAllowed) {
        // Check if explicitly denied or just not allowed
        const isDenied = (mandate.deniedTools || []).some((pattern) => {
          return this.matchesPattern(action.tool, pattern);
        });

        return {
          type: "BLOCK",
          reason: isDenied
            ? `Tool '${action.tool}' is explicitly denied`
            : `Tool '${action.tool}' is not in allowlist`,
          code: isDenied ? "TOOL_DENIED" : "TOOL_NOT_ALLOWED",
          hard: true,
        };
      }

      // 4b. Argument validation (NEW - Phase 2)
      const toolPolicy = mandate.toolPolicies?.[action.tool];
      if (toolPolicy?.argumentValidation) {
        const validation = toolPolicy.argumentValidation;

        // Schema validation (Zod)
        if (validation.schema && action.args) {
          const schemaResult = validateSchema(action.args, validation.schema);

          if (!schemaResult.allowed) {
            return {
              type: "BLOCK",
              reason: `Argument validation failed: ${schemaResult.reason}`,
              code: "ARGUMENT_VALIDATION_FAILED",
              hard: true,
            };
          }

          // Note: We don't mutate action.args here to keep the function pure
          // Transformed args would be used by the executor if needed
        }

        // Custom validation
        if (validation.validate && action.args) {
          const ctx: ValidationContext = {
            tool: action.tool,
            args: action.args,
            agentId: action.agentId,
          };

          const customResult = validation.validate(ctx);

          if (!customResult.allowed) {
            return {
              type: "BLOCK",
              reason: `Argument validation failed: ${customResult.reason}`,
              code: "ARGUMENT_VALIDATION_FAILED",
              hard: true,
            };
          }

          // Note: We don't mutate action.args here to keep the function pure
          // Transformed args would be used by the executor if needed
        }
      }

      // 4c. Tool-specific cost limit
      if (toolPolicy?.maxCostPerCall && action.estimatedCost) {
        if (action.estimatedCost > toolPolicy.maxCostPerCall) {
          return {
            type: "BLOCK",
            reason: `Tool '${action.tool}' cost ${action.estimatedCost} exceeds per-call limit ${toolPolicy.maxCostPerCall}`,
            code: "COST_LIMIT_EXCEEDED",
            hard: true,
          };
        }
      }

      // 4d. Tool-specific rate limit
      if (toolPolicy?.rateLimit) {
        const toolCount = state.toolCallCounts[action.tool];
        if (toolCount) {
          const windowEnd =
            toolCount.windowStart + toolPolicy.rateLimit.windowMs;

          // Window still active
          if (action.timestamp < windowEnd) {
            if (toolCount.count >= toolPolicy.rateLimit.maxCalls) {
              const retryAfterMs = windowEnd - action.timestamp;
              return {
                type: "BLOCK",
                reason: `Tool '${action.tool}' rate limit exceeded: ${toolCount.count}/${toolPolicy.rateLimit.maxCalls} in ${toolPolicy.rateLimit.windowMs}ms`,
                code: "RATE_LIMIT_EXCEEDED",
                retryAfterMs,
                hard: false,
              };
            }
          }
        }
      }
    }

    // 5. Cost limits
    const estimatedCost = action.estimatedCost || 0;

    // 5a. Per-call limit
    if (mandate.maxCostPerCall && estimatedCost > mandate.maxCostPerCall) {
      return {
        type: "BLOCK",
        reason: `Estimated cost ${estimatedCost} exceeds per-call limit ${mandate.maxCostPerCall}`,
        code: "COST_LIMIT_EXCEEDED",
        hard: true,
      };
    }

    // 5b. Cumulative limit
    if (mandate.maxCostTotal) {
      const newCumulative = state.cumulativeCost + estimatedCost;
      if (newCumulative > mandate.maxCostTotal) {
        return {
          type: "BLOCK",
          reason: `Cumulative cost ${newCumulative} would exceed limit ${mandate.maxCostTotal}`,
          code: "COST_LIMIT_EXCEEDED",
          hard: true,
        };
      }
    }

    // 6. Agent-level rate limits
    if (mandate.rateLimit) {
      const windowEnd = state.windowStart + mandate.rateLimit.windowMs;

      // Window still active
      if (action.timestamp < windowEnd) {
        if (state.callCount >= mandate.rateLimit.maxCalls) {
          const retryAfterMs = windowEnd - action.timestamp;
          return {
            type: "BLOCK",
            reason: `Rate limit exceeded: ${state.callCount}/${mandate.rateLimit.maxCalls} in ${mandate.rateLimit.windowMs}ms`,
            code: "RATE_LIMIT_EXCEEDED",
            retryAfterMs,
            hard: false,
          };
        }
      }
      // Window expired - will be reset by StateManager
    }

    // All checks passed - ALLOW
    const remainingCost = mandate.maxCostTotal
      ? mandate.maxCostTotal - (state.cumulativeCost + estimatedCost)
      : undefined;

    const remainingCalls = mandate.rateLimit
      ? mandate.rateLimit.maxCalls - state.callCount
      : undefined;

    return {
      type: "ALLOW",
      reason: "All policy checks passed",
      remainingCost,
      remainingCalls,
    };
  }

  /**
   * Internal pattern matching (duplicated from patterns.ts to avoid circular dependency)
   */
  private matchesPattern(str: string, pattern: string): boolean {
    if (pattern === "*") return true;
    if (!pattern.includes("*")) return str === pattern;

    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");

    return new RegExp(`^${regexPattern}$`).test(str);
  }
}
