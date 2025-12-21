import type { ModelPricing, ProviderPricing } from "./types";

/**
 * Default pricing for major LLM providers.
 *
 * IMPORTANT: This is a convenience, not a complete database.
 *
 * For production:
 * 1. Use customPricing in Mandate for accurate costs
 * 2. Pricing changes frequently - verify with provider
 * 3. Missing models default to $0 (free/local assumed)
 *
 * Prices are per 1M tokens (input/output).
 * Last updated: December 2024
 */
export const DEFAULT_PRICING: ProviderPricing = {
  openai: {
    // GPT-4 family
    "gpt-4o": { inputTokenPrice: 2.5, outputTokenPrice: 10.0 },
    "gpt-4o-mini": { inputTokenPrice: 0.15, outputTokenPrice: 0.6 },
    "gpt-4-turbo": { inputTokenPrice: 10.0, outputTokenPrice: 30.0 },
    "gpt-4": { inputTokenPrice: 30.0, outputTokenPrice: 60.0 },

    // GPT-3.5
    "gpt-3.5-turbo": { inputTokenPrice: 0.5, outputTokenPrice: 1.5 },

    // O1 (reasoning models)
    o1: { inputTokenPrice: 15.0, outputTokenPrice: 60.0 },
    "o1-mini": { inputTokenPrice: 3.0, outputTokenPrice: 12.0 },
  },

  anthropic: {
    // Claude 3.5
    "claude-3-5-sonnet-20241022": {
      inputTokenPrice: 3.0,
      outputTokenPrice: 15.0,
    },
    "claude-3-5-sonnet-20240620": {
      inputTokenPrice: 3.0,
      outputTokenPrice: 15.0,
    },
    "claude-3-5-haiku-20241022": {
      inputTokenPrice: 0.8,
      outputTokenPrice: 4.0,
    },

    // Claude 3
    "claude-3-opus-20240229": { inputTokenPrice: 15.0, outputTokenPrice: 75.0 },
    "claude-3-sonnet-20240229": {
      inputTokenPrice: 3.0,
      outputTokenPrice: 15.0,
    },
    "claude-3-haiku-20240307": {
      inputTokenPrice: 0.25,
      outputTokenPrice: 1.25,
    },
  },

  // Local/free models - explicitly $0
  ollama: {
    "*": { inputTokenPrice: 0, outputTokenPrice: 0 }, // All Ollama models are free
  },

  // Groq (fast inference)
  groq: {
    "llama-3.1-70b-versatile": {
      inputTokenPrice: 0.59,
      outputTokenPrice: 0.79,
    },
    "llama-3.1-8b-instant": { inputTokenPrice: 0.05, outputTokenPrice: 0.08 },
    "mixtral-8x7b-32768": { inputTokenPrice: 0.24, outputTokenPrice: 0.24 },
  },
};

/**
 * Get pricing for a model.
 *
 * Priority:
 * 1. Custom pricing (from Mandate)
 * 2. Default pricing (built-in database)
 * 3. Wildcard pricing (e.g., ollama/*)
 * 4. undefined (caller should handle)
 *
 * @param provider - Provider name (case-insensitive)
 * @param model - Model name
 * @param customPricing - Custom pricing override (from Mandate)
 * @returns Pricing or undefined if not found
 */
export function getPricing(
  provider: string,
  model: string,
  customPricing?: ProviderPricing
): ModelPricing | undefined {
  const normalizedProvider = provider.toLowerCase();

  // 1. Check custom pricing first (highest priority)
  if (customPricing?.[normalizedProvider]) {
    const providerPricing = customPricing[normalizedProvider];

    // Exact model match
    if (providerPricing[model]) {
      return providerPricing[model];
    }

    // Wildcard match
    if (providerPricing["*"]) {
      return providerPricing["*"];
    }
  }

  // 2. Check default pricing
  const defaultProviderPricing = DEFAULT_PRICING[normalizedProvider];
  if (!defaultProviderPricing) {
    return undefined;
  }

  // Exact model match
  if (defaultProviderPricing[model]) {
    return defaultProviderPricing[model];
  }

  // Wildcard match (e.g., ollama/*)
  if (defaultProviderPricing["*"]) {
    return defaultProviderPricing["*"];
  }

  return undefined;
}

/**
 * Calculate cost from token usage.
 *
 * @param usage - Token usage
 * @param pricing - Model pricing
 * @returns Cost in USD
 */
export function calculateCost(
  usage: { inputTokens: number; outputTokens: number },
  pricing: ModelPricing
): number {
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputTokenPrice;
  const outputCost =
    (usage.outputTokens / 1_000_000) * pricing.outputTokenPrice;
  return inputCost + outputCost;
}

/**
 * Estimate cost before execution.
 *
 * @param inputTokens - Estimated input tokens
 * @param outputTokens - Estimated output tokens
 * @param pricing - Model pricing
 * @returns Estimated cost in USD
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing
): number {
  return calculateCost({ inputTokens, outputTokens }, pricing);
}

/**
 * Estimate tokens from text (rough approximation).
 *
 * Rule of thumb: ~4 characters per token for English text.
 * For production, use tiktoken or provider's tokenizer.
 *
 * @param text - Input text
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
