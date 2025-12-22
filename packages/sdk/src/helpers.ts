import {
  getPricing,
  estimateCost,
  calculateCost,
  estimateTokens,
} from "./pricing";
import { executeWithMandate } from "./executor";
import type {
  Action,
  Mandate,
  ModelPricing,
  ProviderPricing,
  TokenUsage,
} from "./types";
import type { PolicyEngine } from "./policy";
import type { StateManager as IStateManager } from "./state/types";
import type { AuditLogger } from "./audit";

import { createHash, randomBytes } from "crypto";

/**
 * GAP 1: Generate a cryptographically strong action ID.
 *
 * If idempotencyKey is provided, generates a deterministic ID from it.
 * This ensures retries with the same idempotencyKey produce the same actionId.
 *
 * @param prefix - Action type prefix (e.g., "tool", "llm")
 * @param idempotencyKey - Optional key for deterministic ID generation
 * @returns Cryptographically strong action ID
 */
function generateActionId(prefix: string, idempotencyKey?: string): string {
  if (idempotencyKey) {
    // GAP 1: Deterministic ID from idempotencyKey (same key = same ID)
    const hash = createHash("sha256")
      .update(`${prefix}:${idempotencyKey}`)
      .digest("hex")
      .substring(0, 16);
    return `${prefix}-${hash}`;
  }

  // GAP 1: Cryptographically strong random ID for new intents
  // Use Node.js crypto.randomBytes for strong randomness
  const randomBytesHex = randomBytes(16).toString("hex");
  return `${prefix}-${randomBytesHex}`;
}

/**
 * GAP 1: Canonical factory for LLM actions.
 *
 * **CRITICAL**: Use this factory instead of manually constructing Action objects.
 * Manual construction bypasses replay protection and idempotency guarantees.
 *
 * Action ID generation:
 * - If idempotencyKey provided: Deterministic ID (same key = same ID)
 * - If actionId provided: Uses provided ID (for explicit control)
 * - Otherwise: Cryptographically strong random ID
 *
 * Retry semantics:
 * - Retries MUST reuse the same idempotencyKey to get the same actionId
 * - New intent MUST use a new idempotencyKey (or omit it for new random ID)
 *
 * @param agentId - Agent identifier
 * @param provider - LLM provider (openai, anthropic, ollama, etc.)
 * @param model - Model name
 * @param estimatedInputTokens - Estimated input tokens
 * @param estimatedOutputTokens - Estimated output tokens
 * @param customPricing - Optional custom pricing (overrides defaults)
 * @param options - Optional: actionId (explicit), idempotencyKey (deterministic)
 * @returns LLM action ready for execution
 *
 * @example
 * ```typescript
 * // New intent - random ID
 * const action1 = createLLMAction('agent-1', 'openai', 'gpt-4o', 1000, 500);
 *
 * // Retry - same idempotencyKey = same actionId
 * const action2 = createLLMAction('agent-1', 'openai', 'gpt-4o', 1000, 500, undefined, {
 *   idempotencyKey: 'retry-123'
 * });
 * const action3 = createLLMAction('agent-1', 'openai', 'gpt-4o', 1000, 500, undefined, {
 *   idempotencyKey: 'retry-123'
 * });
 * // action2.id === action3.id (deterministic)
 * ```
 */
export function createLLMAction(
  agentId: string,
  provider: "openai" | "anthropic" | "ollama" | string,
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  customPricing?: ProviderPricing,
  options?: {
    actionId?: string; // Explicit action ID (overrides idempotencyKey)
    idempotencyKey?: string; // Deterministic ID generation
  }
): Action {
  const pricing = getPricing(provider, model, customPricing);

  // GAP 1: Generate ID deterministically from idempotencyKey if provided
  const actionId =
    options?.actionId || generateActionId("llm", options?.idempotencyKey);

  return {
    type: "llm_call",
    id: actionId,
    agentId,
    timestamp: Date.now(),
    provider: provider as any,
    model,
    estimatedCost: pricing
      ? estimateCost(estimatedInputTokens, estimatedOutputTokens, pricing)
      : 0, // Default to $0 if no pricing found
    costType: "COGNITION",
    idempotencyKey: options?.idempotencyKey, // GAP 1: Store idempotencyKey
  };
}

/**
 * GAP 1: Canonical factory for tool actions.
 *
 * **CRITICAL**: Use this factory instead of manually constructing Action objects.
 * Manual construction bypasses replay protection and idempotency guarantees.
 *
 * Action ID generation:
 * - If idempotencyKey provided: Deterministic ID (same key = same ID)
 * - If actionId provided: Uses provided ID (for explicit control)
 * - Otherwise: Cryptographically strong random ID
 *
 * Retry semantics:
 * - Retries MUST reuse the same idempotencyKey to get the same actionId
 * - New intent MUST use a new idempotencyKey (or omit it for new random ID)
 *
 * @param agentId - Agent identifier
 * @param tool - Tool name
 * @param args - Tool arguments
 * @param estimatedCost - Estimated cost (optional)
 * @param options - Optional: actionId (explicit), idempotencyKey (deterministic)
 * @returns Tool action ready for execution
 *
 * @example
 * ```typescript
 * // New intent - random ID
 * const action1 = createToolAction('agent-1', 'send_email', { to: 'user@example.com' }, 0.01);
 *
 * // Retry - same idempotencyKey = same actionId
 * const action2 = createToolAction('agent-1', 'send_email', { to: 'user@example.com' }, 0.01, {
 *   idempotencyKey: 'retry-123'
 * });
 * const action3 = createToolAction('agent-1', 'send_email', { to: 'user@example.com' }, 0.01, {
 *   idempotencyKey: 'retry-123'
 * });
 * // action2.id === action3.id (deterministic)
 * ```
 */
export function createToolAction(
  agentId: string,
  tool: string,
  args?: Record<string, unknown>,
  estimatedCost?: number,
  options?: {
    actionId?: string; // Explicit action ID (overrides idempotencyKey)
    idempotencyKey?: string; // Deterministic ID generation
  }
): Action {
  // GAP 1: Generate ID deterministically from idempotencyKey if provided
  const actionId =
    options?.actionId || generateActionId("tool", options?.idempotencyKey);

  return {
    type: "tool_call",
    id: actionId,
    agentId,
    timestamp: Date.now(),
    tool,
    args,
    estimatedCost,
    costType: "EXECUTION",
    idempotencyKey: options?.idempotencyKey, // GAP 1: Store idempotencyKey
  };
}

/**
 * Execute an LLM call with automatic cost extraction.
 *
 * Automatically extracts actual cost from the response based on token usage.
 * Supports OpenAI and Anthropic response formats.
 *
 * @param action - LLM action (from createLLMAction)
 * @param fn - Function that calls the LLM
 * @param mandate - Mandate defining authority
 * @param policy - PolicyEngine instance
 * @param stateManager - StateManager instance
 * @returns LLM response with actualCost injected
 *
 * @example
 * ```typescript
 * const action = createLLMAction('agent-1', 'openai', 'gpt-4o', 1000, 500);
 *
 * const response = await executeLLM(
 *   action,
 *   () => openai.chat.completions.create({
 *     model: 'gpt-4o',
 *     messages: [{ role: 'user', content: 'Hello' }]
 *   }),
 *   mandate,
 *   policyEngine,
 *   stateManager
 * );
 *
 * console.log(response.actualCost); // Actual cost based on tokens
 * ```
 */
export async function executeLLM<T>(
  action: Action,
  fn: () => Promise<T>,
  mandate: Mandate,
  policy: PolicyEngine,
  stateManager: IStateManager,
  auditLogger?: AuditLogger
): Promise<T> {
  const result = await executeWithMandate(
    action,
    fn,
    mandate,
    policy,
    stateManager,
    auditLogger
  );

  // Extract actual cost from response (only for LLM calls)
  if (action.type === "llm_call") {
    const usage = extractUsage(result);
    if (usage && action.provider && action.model) {
      // Use custom pricing from mandate if available
      const pricing = getPricing(
        action.provider,
        action.model,
        mandate.customPricing
      );

      if (pricing) {
        const cost = calculateCost(usage, pricing);

        // Only set actualCost if it's a valid number
        if (!isNaN(cost) && isFinite(cost)) {
          (result as any).actualCost = cost;
        } else {
          // Free model or calculation error - set to 0
          (result as any).actualCost = 0;
        }
      }
    }
  }

  return result;
}

/**
 * Execute a tool call with mandate enforcement.
 *
 * This is a convenience wrapper around executeWithMandate for tool calls.
 *
 * @param action - Tool action (from createToolAction)
 * @param fn - Function that executes the tool
 * @param mandate - Mandate defining authority
 * @param policy - PolicyEngine instance
 * @param stateManager - StateManager instance
 * @returns Tool execution result
 *
 * @example
 * ```typescript
 * const action = createToolAction('agent-1', 'send_email', {
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   body: 'World'
 * }, 0.01);
 *
 * const result = await executeTool(
 *   action,
 *   () => emailService.send(action.args),
 *   mandate,
 *   policyEngine,
 *   stateManager
 * );
 * ```
 */
export async function executeTool<T>(
  action: Action,
  fn: () => Promise<T>,
  mandate: Mandate,
  policy: PolicyEngine,
  stateManager: IStateManager,
  auditLogger?: AuditLogger
): Promise<T> {
  return executeWithMandate(
    action,
    fn,
    mandate,
    policy,
    stateManager,
    auditLogger
  );
}

/**
 * Extract token usage from LLM response.
 * Supports OpenAI and Anthropic response formats.
 */
function extractUsage(result: unknown): TokenUsage | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const response = result as any;

  // OpenAI format: response.usage with prompt_tokens/completion_tokens
  if (response.usage?.prompt_tokens !== undefined) {
    const usage = response.usage;
    return {
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    };
  }

  // Anthropic format: response.usage with input_tokens/output_tokens
  if (response.usage?.input_tokens !== undefined) {
    const usage = response.usage;
    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    };
  }

  return null;
}

/**
 * Calculate max output tokens based on remaining budget.
 *
 * @param remainingBudget - Budget left
 * @param inputTokens - Input tokens for this call
 * @param pricing - Model pricing
 * @returns Max output tokens that fit in budget
 */
export function calculateMaxOutputTokens(
  remainingBudget: number,
  inputTokens: number,
  pricing: ModelPricing,
  defaultMax: number = 2000
): number {
  // Free model - use default
  if (pricing.inputTokenPrice === 0 && pricing.outputTokenPrice === 0) {
    return defaultMax;
  }

  // Cost for input tokens
  const inputCost = (inputTokens / 1_000_000) * pricing.inputTokenPrice;

  // Remaining budget for output
  const outputBudget = remainingBudget - inputCost;

  if (outputBudget <= 0) {
    return 0; // No budget for output
  }

  // Max output tokens
  const maxOutputTokens = Math.floor(
    (outputBudget / pricing.outputTokenPrice) * 1_000_000
  );

  return maxOutputTokens;
}

/**
 * Estimate tokens from chat messages (rough approximation).
 *
 * This is a simple heuristic based on JSON stringification.
 * For production, use tiktoken or the provider's tokenizer.
 *
 * @param messages - Array of chat messages
 * @returns Estimated token count
 *
 * @example
 * ```typescript
 * const messages = [
 *   { role: 'system', content: 'You are helpful.' },
 *   { role: 'user', content: 'Hello!' }
 * ];
 * const tokens = estimateTokensFromMessages(messages);
 * ```
 */
export function estimateTokensFromMessages(messages: any[]): number {
  const text = JSON.stringify(messages);
  return estimateTokens(text);
}
