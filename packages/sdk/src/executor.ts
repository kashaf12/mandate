import type { Action, Mandate } from "./types";
import { MandateBlockedError } from "./types";
import type { PolicyEngine } from "./policy";
import type { StateManager } from "./state";
import { evaluateChargingPolicy } from "./charging";
import type { ChargingContext } from "./charging";

/**
 * Execute an action with mandate enforcement.
 *
 * This is the core primitive of the SDK. It implements:
 *
 * Phase 1: Authorize (PolicyEngine evaluation, no state mutation)
 * Phase 2: Execute (run the actual function, can fail)
 * Phase 3: Verify (optional result validation)
 * Phase 4: Compute Cost (apply charging policy based on outcomes)
 * Phase 5: Commit (StateManager mutation, only if charging policy says to charge)
 *
 * CRITICAL INVARIANTS:
 * - PolicyEngine.evaluate() NEVER mutates state
 * - State is ONLY committed if charging policy returns cost > 0
 * - Retries are safe (replay protection via action IDs)
 * - Execution failures are handled per charging policy
 * - Verification failures are handled per charging policy
 */
export async function executeWithMandate<T>(
  action: Action,
  executor: () => Promise<T>,
  mandate: Mandate,
  policy: PolicyEngine,
  stateManager: StateManager
): Promise<T> {
  // Get current state
  const state = stateManager.get(action.agentId, mandate.id);

  // Phase 1: Authorize (pure evaluation, no mutation)
  const decision = policy.evaluate(action, mandate, state);

  if (decision.type === "BLOCK") {
    // Block before execution
    throw new MandateBlockedError(
      decision.code,
      decision.reason,
      action.agentId,
      action,
      decision
    );
  }

  // Track execution outcomes for charging policy
  let executed = false;
  let executionSuccess = false;
  let verificationSuccess = false;
  let result: T;
  let actualCost: number | undefined;

  // Phase 2: Execute (can fail)
  try {
    result = await executor();
    executed = true;
    executionSuccess = true;

    // Extract actual cost if present in result
    actualCost = (result as any)?.actualCost;
  } catch (executionError) {
    executed = true;
    executionSuccess = false;

    // Compute cost for failed execution
    const chargingPolicy = getChargingPolicy(action, mandate);
    const chargingCtx: ChargingContext = {
      action,
      executed,
      executionSuccess,
      verificationSuccess: false,
      estimatedCost: action.estimatedCost,
      actualCost,
    };

    const cost = evaluateChargingPolicy(chargingPolicy, chargingCtx);

    // Commit state if charging policy says to charge
    if (cost > 0) {
      stateManager.commitSuccess(
        action,
        state,
        cost,
        mandate.rateLimit,
        getToolRateLimit(action, mandate)
      );
    }

    // Re-throw execution error
    throw executionError;
  }

  // Phase 3: Verify (optional)
  const toolPolicy =
    action.type === "tool_call"
      ? mandate.toolPolicies?.[action.tool]
      : undefined;

  if (toolPolicy?.verifyResult) {
    const verification = toolPolicy.verifyResult({
      action,
      result,
      mandate,
    });

    if (!verification.ok) {
      verificationSuccess = false;

      // Compute cost for failed verification
      const chargingPolicy = getChargingPolicy(action, mandate);
      const chargingCtx: ChargingContext = {
        action,
        executed,
        executionSuccess,
        verificationSuccess,
        estimatedCost: action.estimatedCost,
        actualCost,
      };

      const cost = evaluateChargingPolicy(chargingPolicy, chargingCtx);

      // Commit state if charging policy says to charge
      if (cost > 0) {
        stateManager.commitSuccess(
          action,
          state,
          cost,
          mandate.rateLimit,
          getToolRateLimit(action, mandate)
        );
      }

      // Throw verification error
      throw new Error(`Verification failed: ${verification.reason}`);
    }

    verificationSuccess = true;
  } else {
    // No verifier = consider it passed
    verificationSuccess = true;
  }

  // Phase 4: Compute Cost (success path)
  const chargingPolicy = getChargingPolicy(action, mandate);
  const chargingCtx: ChargingContext = {
    action,
    executed,
    executionSuccess,
    verificationSuccess,
    estimatedCost: action.estimatedCost,
    actualCost,
  };

  const cost = evaluateChargingPolicy(chargingPolicy, chargingCtx);

  // Phase 5: Commit (success path)
  if (cost > 0) {
    stateManager.commitSuccess(
      action,
      state,
      cost,
      mandate.rateLimit,
      getToolRateLimit(action, mandate)
    );
  }

  return result;
}

/**
 * Get the charging policy for an action.
 * Tool-specific policy takes precedence over mandate default.
 */
function getChargingPolicy(action: Action, mandate: Mandate) {
  if (action.type === "tool_call") {
    const toolPolicy = mandate.toolPolicies?.[action.tool];
    if (toolPolicy?.chargingPolicy) {
      return toolPolicy.chargingPolicy;
    }
  }

  return mandate.defaultChargingPolicy;
}

/**
 * Get the tool-specific rate limit for an action.
 */
function getToolRateLimit(action: Action, mandate: Mandate) {
  if (action.type === "tool_call") {
    return mandate.toolPolicies?.[action.tool]?.rateLimit;
  }
  return undefined;
}
