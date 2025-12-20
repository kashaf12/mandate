import type { Action, ChargingPolicy } from "./types";

/**
 * Context for charging policy evaluation
 */
export interface ChargingContext {
  action: Action;
  executed: boolean; // Did execution attempt happen?
  executionSuccess: boolean; // Did execution succeed (no throw)?
  verificationSuccess: boolean; // Did verification pass?
  estimatedCost?: number;
  actualCost?: number;
}

/**
 * Evaluate charging policy to determine actual cost to charge.
 *
 * This is called AFTER execution (successful or failed) to determine
 * how much to charge the agent.
 *
 * @param policy - The charging policy to apply
 * @param ctx - Context about what happened
 * @returns Actual cost to charge (0 = free)
 */
export function evaluateChargingPolicy(
  policy: ChargingPolicy | undefined,
  ctx: ChargingContext
): number {
  // Default policy: SUCCESS_BASED (only charge on full success)
  if (!policy) {
    policy = { type: "SUCCESS_BASED" };
  }

  switch (policy.type) {
    case "ATTEMPT_BASED":
      // Charge if execution was attempted, regardless of outcome
      return ctx.executed ? ctx.actualCost ?? ctx.estimatedCost ?? 0 : 0;

    case "SUCCESS_BASED":
      // Only charge if execution succeeded AND verification passed
      return ctx.executionSuccess && ctx.verificationSuccess
        ? ctx.actualCost ?? ctx.estimatedCost ?? 0
        : 0;

    case "TIERED":
      let cost = 0;

      // Charge attempt cost if execution started
      if (ctx.executed) {
        cost += policy.attemptCost;
      }

      // Add success cost if execution succeeded
      if (ctx.executionSuccess) {
        cost += policy.successCost;
      }

      // Add verification cost if verification passed
      if (ctx.verificationSuccess && policy.verificationCost) {
        cost += policy.verificationCost;
      }

      return cost;

    case "CUSTOM":
      // User-defined logic
      return policy.compute(ctx);

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = policy;
      return 0;
  }
}
