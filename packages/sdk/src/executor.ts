import type { Action, Mandate, AuditEntry, BlockCode } from "./types";
import { MandateBlockedError } from "./types";
import type { PolicyEngine } from "./policy";
import type { StateManager } from "./state";
import { evaluateChargingPolicy } from "./charging";
import type { ChargingContext } from "./charging";
import type { AuditLogger } from "./audit";

/**
 * Execute an action with mandate enforcement.
 *
 * @param action - The action to execute
 * @param executor - Function that executes the action
 * @param mandate - Mandate defining authority
 * @param policy - PolicyEngine instance
 * @param stateManager - StateManager instance
 * @param auditLogger - Optional audit logger (logs all decisions)
 * @returns Execution result
 */
export async function executeWithMandate<T>(
  action: Action,
  executor: () => Promise<T>,
  mandate: Mandate,
  policy: PolicyEngine,
  stateManager: StateManager,
  auditLogger?: AuditLogger
): Promise<T> {
  const startTime = Date.now();

  // Get current state
  const state = stateManager.get(action.agentId, mandate.id);

  // Phase 1: Authorize (pure evaluation, no mutation)
  const decision = policy.evaluate(action, mandate, state);

  if (decision.type === "BLOCK") {
    // Log block decision
    if (auditLogger) {
      const auditEntry = createAuditEntry(
        action,
        mandate,
        decision.type,
        decision.reason,
        decision.code,
        undefined,
        undefined,
        state.cumulativeCost,
        Date.now() - startTime
      );
      await Promise.resolve(auditLogger.log(auditEntry));
    }

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
  let error: Error | undefined;

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
    error = executionError as Error;

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

    // Log execution failure
    if (auditLogger) {
      const auditEntry = createAuditEntry(
        action,
        mandate,
        "BLOCK",
        `Execution failed: ${error.message}`,
        undefined,
        action.estimatedCost,
        cost > 0 ? cost : undefined,
        state.cumulativeCost,
        Date.now() - startTime
      );
      await Promise.resolve(auditLogger.log(auditEntry));
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

      // Log verification failure
      if (auditLogger) {
        const auditEntry = createAuditEntry(
          action,
          mandate,
          "BLOCK",
          `Verification failed: ${verification.reason}`,
          undefined,
          action.estimatedCost,
          cost > 0 ? cost : undefined,
          state.cumulativeCost,
          Date.now() - startTime
        );
        await Promise.resolve(auditLogger.log(auditEntry));
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

  // Log success
  if (auditLogger) {
    const auditEntry = createAuditEntry(
      action,
      mandate,
      "ALLOW",
      decision.reason,
      undefined,
      action.estimatedCost,
      cost,
      state.cumulativeCost,
      Date.now() - startTime
    );
    await Promise.resolve(auditLogger.log(auditEntry));
  }

  return result;
}

/**
 * Create an audit entry from execution details.
 */
function createAuditEntry(
  action: Action,
  mandate: Mandate,
  decision: "ALLOW" | "BLOCK",
  reason: string,
  blockCode?: BlockCode, // ← Changed from string to BlockCode
  estimatedCost?: number,
  actualCost?: number,
  cumulativeCost?: number,
  durationMs?: number
): AuditEntry {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    timestamp: Date.now(),
    agentId: action.agentId,
    mandateId: mandate.id,
    actionId: action.id,
    traceId: action.traceId,
    parentActionId: action.parentActionId,
    action: action.type,
    tool: action.type === "tool_call" ? action.tool : undefined,
    provider: action.type === "llm_call" ? action.provider : undefined,
    model: action.type === "llm_call" ? action.model : undefined,
    decision,
    reason,
    blockCode,
    estimatedCost,
    actualCost,
    cumulativeCost,
    metadata: durationMs ? { durationMs } : undefined,
  };
}

// ... rest of file (getChargingPolicy, getToolRateLimit unchanged)
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
