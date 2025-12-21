import { getPricing, estimateCost, calculateCost } from "./pricing";
import { executeWithMandate } from "./executor";
import type { Action, Mandate, TokenUsage } from "./types";
import type { PolicyEngine } from "./policy";
import type { StateManager } from "./state";

/**
 * Generate a unique action ID.
 */
function generateActionId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Create an LLM action with automatic cost estimation.
 *
 * @param agentId - Agent identifier
 * @param provider - LLM provider (openai, anthropic, ollama, etc.)
 * @param model - Model name
 * @param estimatedInputTokens - Estimated input tokens
 * @param estimatedOutputTokens - Estimated output tokens
 * @returns LLM action ready for execution
 *
 * @example
 * ```typescript
 * const action = createLLMAction('agent-1', 'openai', 'gpt-4o', 1000, 500);
 * const result = await executeLLM(action, () => openai.chat.completions.create({...}));
 * ```
 */
export function createLLMAction(
  agentId: string,
  provider: "openai" | "anthropic" | "ollama" | string,
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number
): Action {
  const pricing = getPricing(provider, model);

  return {
    type: "llm_call",
    id: generateActionId("llm"),
    agentId,
    timestamp: Date.now(),
    provider: provider as any,
    model,
    estimatedCost: pricing
      ? estimateCost(estimatedInputTokens, estimatedOutputTokens, pricing)
      : 0,
    costType: "COGNITION",
  };
}

/**
 * Create a tool action.
 *
 * @param agentId - Agent identifier
 * @param tool - Tool name
 * @param args - Tool arguments
 * @param estimatedCost - Estimated cost (optional)
 * @returns Tool action ready for execution
 *
 * @example
 * ```typescript
 * const action = createToolAction('agent-1', 'send_email', { to: 'user@example.com' }, 0.01);
 * const result = await executeTool(action, () => sendEmail(action.args));
 * ```
 */
export function createToolAction(
  agentId: string,
  tool: string,
  args?: Record<string, unknown>,
  estimatedCost?: number
): Action {
  return {
    type: "tool_call",
    id: generateActionId("tool"),
    agentId,
    timestamp: Date.now(),
    tool,
    args,
    estimatedCost,
    costType: "EXECUTION",
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
  stateManager: StateManager
): Promise<T> {
  const result = await executeWithMandate(
    action,
    fn,
    mandate,
    policy,
    stateManager
  );

  // Extract actual cost from response (only for LLM calls)
  if (action.type === "llm_call") {
    const usage = extractUsage(result);
    if (usage && action.provider && action.model) {
      const pricing = getPricing(action.provider, action.model);

      if (pricing) {
        (result as any).actualCost = calculateCost(usage, pricing);
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
  stateManager: StateManager
): Promise<T> {
  return executeWithMandate(action, fn, mandate, policy, stateManager);
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
