import type { Action, Mandate, AuditEntry, BlockCode, Decision } from "./types";
import { MandateBlockedError } from "./types";
import type { PolicyEngine } from "./policy";
import type { StateManager as IStateManager } from "./state/types";
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
  stateManager: IStateManager,
  auditLogger?: AuditLogger
): Promise<T> {
  const startTime = Date.now();

  // GAP 1: Get execution lease from tool policy
  const toolPolicy =
    action.type === "tool_call"
      ? mandate.toolPolicies?.[action.tool]
      : undefined;
  const executionLeaseMs = toolPolicy?.executionLeaseMs;
  // GAP 2: Default verification timeout to 50ms if not specified
  const verificationTimeoutMs = toolPolicy?.verificationTimeoutMs ?? 50;

  // GAP 1: Reconcile expired leases before execution (passive reconciliation in state manager)

  // Check if stateManager supports atomic check-and-commit (RedisStateManager)
  const hasAtomicCheck = "checkAndCommit" in stateManager;

  if (hasAtomicCheck) {
    // ATOMIC PATH: Use Lua script for atomic check + commit
    const atomicStateManager = stateManager as any;
    const checkResult = await atomicStateManager.checkAndCommit(
      action,
      mandate
    );

    if (!checkResult.allowed) {
      // Log block decision
      if (auditLogger) {
        const auditEntry = createAuditEntry(
          action,
          mandate,
          "BLOCK",
          checkResult.reason,
          checkResult.code,
          action.estimatedCost,
          undefined,
          0, // cumulativeCost not available in atomic path
          Date.now() - startTime
        );
        await Promise.resolve(auditLogger.log(auditEntry));
      }

      // Block before execution
      // Create a decision object for the error
      const decision: Extract<Decision, { type: "BLOCK" }> = {
        type: "BLOCK",
        reason: checkResult.reason,
        code: (checkResult.code || "BLOCKED") as BlockCode,
        hard: true, // Atomic checks are hard blocks
      };
      throw new MandateBlockedError(
        checkResult.code || "BLOCKED",
        checkResult.reason,
        action.agentId,
        action,
        decision
      );
    }

    // Budget already reserved atomically - proceed to execution
    let result: T;
    let actualCost: number | undefined;

    // GAP 1: Record execution lease if configured
    // Note: For atomic path (Redis), lease tracking would need to be added to Lua script
    // For now, we track it in state for reconciliation (passive cleanup)
    if (executionLeaseMs) {
      const atomicState = await stateManager.get(action.agentId, mandate.id);
      if (!atomicState.executionLeases) {
        atomicState.executionLeases = new Map();
      }
      const leaseExpiresAt = Date.now() + executionLeaseMs;
      atomicState.executionLeases.set(action.id, leaseExpiresAt);
    }

    // Phase 2: Execute (can fail)
    try {
      // GAP 1: Wrap executor with lease timeout
      if (executionLeaseMs) {
        result = await Promise.race([
          executor(),
          new Promise<T>((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(`Execution lease expired after ${executionLeaseMs}ms`)
              );
            }, executionLeaseMs);
          }),
        ]);
      } else {
        result = await executor();
      }

      // Extract actual cost if present in result
      actualCost = (result as any)?.actualCost;
    } catch (executionError) {
      const error = executionError as Error;

      // GAP 1: Check if this is a lease timeout
      const isLeaseTimeout = error.message.includes("Execution lease expired");

      // GAP 1: Clear lease on failure
      if (executionLeaseMs) {
        const atomicState = await stateManager.get(action.agentId, mandate.id);
        if (atomicState.executionLeases) {
          atomicState.executionLeases.delete(action.id);
        }
      }

      // Log execution failure
      if (auditLogger) {
        const auditEntry = createAuditEntry(
          action,
          mandate,
          "BLOCK",
          isLeaseTimeout
            ? `Execution lease expired after ${executionLeaseMs}ms`
            : `Execution failed: ${error.message}`,
          isLeaseTimeout ? "EXECUTION_TIMEOUT" : undefined,
          action.estimatedCost,
          undefined,
          0,
          Date.now() - startTime
        );
        await Promise.resolve(auditLogger.log(auditEntry));
      }

      // Re-throw execution error (or lease timeout error)
      if (isLeaseTimeout) {
        throw new MandateBlockedError(
          "EXECUTION_TIMEOUT",
          `Execution lease expired after ${executionLeaseMs}ms`,
          action.agentId,
          action,
          {
            type: "BLOCK",
            reason: `Execution lease expired after ${executionLeaseMs}ms`,
            code: "EXECUTION_TIMEOUT",
            hard: true,
          }
        );
      }
      throw executionError;
    }

    // GAP 1: Clear lease on successful execution
    if (executionLeaseMs) {
      const atomicState = await stateManager.get(action.agentId, mandate.id);
      if (atomicState.executionLeases) {
        atomicState.executionLeases.delete(action.id);
      }
    }

    // Phase 3: Verify (optional)
    if (toolPolicy?.verifyResult) {
      // GAP 2: Wrap verification in try-catch and timeout with audit metadata
      const verificationStartTime = Date.now();
      let verification: { ok: boolean; reason?: string };
      let verificationOutcome: "ok" | "failed" | "timeout" | "error" = "ok";

      try {
        // GAP 2: Always apply timeout (default 50ms)
        let timeoutOccurred = false;
        const timeoutPromise = new Promise<{ ok: false; reason: string }>(
          (resolve) => {
            setTimeout(() => {
              timeoutOccurred = true;
              resolve({
                ok: false,
                reason: `Verification exceeded timeout of ${verificationTimeoutMs}ms`,
              });
            }, verificationTimeoutMs);
          }
        );

        verification = await Promise.race([
          Promise.resolve(
            toolPolicy.verifyResult({
              action,
              result,
              mandate,
            })
          ),
          timeoutPromise,
        ]);

        if (timeoutOccurred) {
          verificationOutcome = "timeout";
        } else if (!verification.ok) {
          verificationOutcome = "failed";
        }
      } catch (verificationError) {
        // GAP 2: Catch all verification errors
        verificationOutcome = "error";
        const error = verificationError as Error;
        verification = {
          ok: false,
          reason: `Verification threw error: ${error.message}`,
        };
      }

      const verificationDurationMs = Date.now() - verificationStartTime;

      if (!verification.ok) {
        const isTimeout = verificationOutcome === "timeout";

        // Log verification failure with metadata
        if (auditLogger) {
          const auditEntry = createAuditEntry(
            action,
            mandate,
            "BLOCK",
            `Verification failed: ${verification.reason}`,
            isTimeout ? "VERIFICATION_TIMEOUT" : "VERIFICATION_FAILED",
            action.estimatedCost,
            undefined,
            0,
            Date.now() - startTime,
            {
              verificationDurationMs,
              verificationOutcome,
            }
          );
          await Promise.resolve(auditLogger.log(auditEntry));
        }

        // Throw verification error
        if (isTimeout) {
          throw new MandateBlockedError(
            "VERIFICATION_TIMEOUT",
            verification.reason || "Verification exceeded timeout",
            action.agentId,
            action,
            {
              type: "BLOCK",
              reason: verification.reason || "Verification exceeded timeout",
              code: "VERIFICATION_TIMEOUT",
              hard: true,
            }
          );
        }
        throw new Error(`Verification failed: ${verification.reason}`);
      }
    }

    // Log success
    if (auditLogger) {
      const auditEntry = createAuditEntry(
        action,
        mandate,
        "ALLOW",
        checkResult.reason || "All checks passed",
        undefined,
        action.estimatedCost,
        actualCost,
        0, // cumulativeCost not available in atomic path
        Date.now() - startTime
      );
      await Promise.resolve(auditLogger.log(auditEntry));
    }

    // Note: Budget already committed atomically in checkAndCommit
    // If actualCost differs from estimatedCost, we'd need to adjust,
    // but that breaks atomicity. For now, we use estimatedCost.
    return result;
  }

  // NON-ATOMIC PATH: Original implementation for MemoryStateManager
  // Get current state (GAP 1: reconciliation happens in get() if needed)
  let state = await stateManager.get(action.agentId, mandate.id);

  // Phase 1: Authorize (pure evaluation, no mutation)
  const decision = policy.evaluate(action, mandate, state);

  // GAP 3: DEFER is reserved for future use - defensive assertion
  if (decision.type === "DEFER") {
    throw new Error(
      "DEFER decision type is reserved for future async workflows. " +
        "Current executor does not support DEFER. " +
        "This indicates an internal error or future feature that is not yet implemented."
    );
  }

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

  // GAP 1: Record execution lease if configured
  if (executionLeaseMs) {
    if (!state.executionLeases) {
      state.executionLeases = new Map();
    }
    const leaseExpiresAt = Date.now() + executionLeaseMs;
    state.executionLeases.set(action.id, leaseExpiresAt);
  }

  // Phase 2: Execute (can fail)
  try {
    // GAP 1: Wrap executor with lease timeout
    if (executionLeaseMs) {
      result = await Promise.race([
        executor(),
        new Promise<T>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(`Execution lease expired after ${executionLeaseMs}ms`)
            );
          }, executionLeaseMs);
        }),
      ]);
    } else {
      result = await executor();
    }
    executed = true;
    executionSuccess = true;

    // GAP 1: Clear lease on successful execution
    if (executionLeaseMs && state.executionLeases) {
      state.executionLeases.delete(action.id);
    }

    // Extract actual cost if present in result
    actualCost = (result as any)?.actualCost;
  } catch (executionError) {
    executed = true;
    executionSuccess = false;
    error = executionError as Error;

    // GAP 1: Check if this is a lease timeout
    const isLeaseTimeout = error.message.includes("Execution lease expired");

    // GAP 1: Clear lease on failure
    if (executionLeaseMs && state.executionLeases) {
      state.executionLeases.delete(action.id);
    }

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
      await stateManager.commitSuccess(
        action,
        state,
        { actualCost: cost },
        mandate.rateLimit,
        getToolRateLimit(action, mandate),
        mandate
      );
    }

    // Log execution failure
    if (auditLogger) {
      const auditEntry = createAuditEntry(
        action,
        mandate,
        "BLOCK",
        isLeaseTimeout
          ? `Execution lease expired after ${executionLeaseMs}ms`
          : `Execution failed: ${error.message}`,
        isLeaseTimeout ? "EXECUTION_TIMEOUT" : undefined,
        action.estimatedCost,
        cost > 0 ? cost : undefined,
        state.cumulativeCost,
        Date.now() - startTime
      );
      await Promise.resolve(auditLogger.log(auditEntry));
    }

    // Re-throw execution error (or lease timeout error)
    if (isLeaseTimeout) {
      throw new MandateBlockedError(
        "EXECUTION_TIMEOUT",
        `Execution lease expired after ${executionLeaseMs}ms`,
        action.agentId,
        action,
        {
          type: "BLOCK",
          reason: `Execution lease expired after ${executionLeaseMs}ms`,
          code: "EXECUTION_TIMEOUT",
          hard: true,
        }
      );
    }
    throw executionError;
  }

  // Phase 3: Verify (optional)
  if (toolPolicy?.verifyResult) {
    // GAP 2: Wrap verification in try-catch and timeout with audit metadata
    const verificationStartTime = Date.now();
    let verification: { ok: boolean; reason?: string };
    let verificationOutcome: "ok" | "failed" | "timeout" | "error" = "ok";

    try {
      // GAP 2: Always apply timeout (default 50ms)
      let timeoutOccurred = false;
      const timeoutPromise = new Promise<{ ok: false; reason: string }>(
        (resolve) => {
          setTimeout(() => {
            timeoutOccurred = true;
            resolve({
              ok: false,
              reason: `Verification exceeded timeout of ${verificationTimeoutMs}ms`,
            });
          }, verificationTimeoutMs);
        }
      );

      verification = await Promise.race([
        Promise.resolve(
          toolPolicy.verifyResult({
            action,
            result,
            mandate,
          })
        ),
        timeoutPromise,
      ]);

      if (timeoutOccurred) {
        verificationOutcome = "timeout";
      } else if (!verification.ok) {
        verificationOutcome = "failed";
      }
    } catch (verificationError) {
      // GAP 2: Catch all verification errors
      verificationOutcome = "error";
      const error = verificationError as Error;
      verification = {
        ok: false,
        reason: `Verification threw error: ${error.message}`,
      };
    }

    const verificationDurationMs = Date.now() - verificationStartTime;

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
        await stateManager.commitSuccess(
          action,
          state,
          { actualCost: cost },
          mandate.rateLimit,
          getToolRateLimit(action, mandate)
        );
      }

      const isTimeout = verificationOutcome === "timeout";

      // Log verification failure with metadata
      if (auditLogger) {
        const auditEntry = createAuditEntry(
          action,
          mandate,
          "BLOCK",
          `Verification failed: ${verification.reason}`,
          isTimeout ? "VERIFICATION_TIMEOUT" : "VERIFICATION_FAILED",
          action.estimatedCost,
          cost > 0 ? cost : undefined,
          state.cumulativeCost,
          Date.now() - startTime,
          {
            verificationDurationMs,
            verificationOutcome,
          }
        );
        await Promise.resolve(auditLogger.log(auditEntry));
      }

      // Throw verification error
      if (isTimeout) {
        throw new MandateBlockedError(
          "VERIFICATION_TIMEOUT",
          verification.reason || "Verification exceeded timeout",
          action.agentId,
          action,
          {
            type: "BLOCK",
            reason: verification.reason || "Verification exceeded timeout",
            code: "VERIFICATION_TIMEOUT",
            hard: true,
          }
        );
      }
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
    await stateManager.commitSuccess(
      action,
      state,
      { actualCost: cost },
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
  blockCode?: BlockCode,
  estimatedCost?: number,
  actualCost?: number,
  cumulativeCost?: number,
  durationMs?: number,
  verificationMetadata?: {
    verificationDurationMs?: number;
    verificationOutcome?: "ok" | "failed" | "timeout" | "error";
  }
): AuditEntry {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    timestamp: Date.now(),
    agentId: action.agentId,
    mandateId: mandate.id,
    actionId: action.id,
    idempotencyKey: action.idempotencyKey, // GAP 1: Include idempotencyKey in audit
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
    metadata: {
      ...(durationMs ? { durationMs } : {}),
      ...(verificationMetadata?.verificationDurationMs
        ? {
            verificationDurationMs: verificationMetadata.verificationDurationMs,
          }
        : {}),
      ...(verificationMetadata?.verificationOutcome
        ? { verificationOutcome: verificationMetadata.verificationOutcome }
        : {}),
    },
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
