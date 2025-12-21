import type { ProviderPricing, ModelPricing, TokenUsage } from "./types";

/**
 * Default pricing database for major LLM providers.
 * Prices are per 1M tokens (as of December 2024).
 *
 * Sources:
 * - OpenAI: https://openai.com/pricing
 * - Anthropic: https://www.anthropic.com/pricing
 */
export const DEFAULT_PRICING: Record<string, ProviderPricing> = {
  openai: {
    // GPT-4 family
    "gpt-4": {
      inputTokenPrice: 30.0,
      outputTokenPrice: 60.0,
    },
    "gpt-4-turbo": {
      inputTokenPrice: 10.0,
      outputTokenPrice: 30.0,
    },
    "gpt-4-turbo-preview": {
      inputTokenPrice: 10.0,
      outputTokenPrice: 30.0,
    },
    "gpt-4o": {
      inputTokenPrice: 2.5,
      outputTokenPrice: 10.0,
    },
    "gpt-4o-mini": {
      inputTokenPrice: 0.15,
      outputTokenPrice: 0.6,
    },

    // GPT-3.5 family
    "gpt-3.5-turbo": {
      inputTokenPrice: 0.5,
      outputTokenPrice: 1.5,
    },
    "gpt-3.5-turbo-instruct": {
      inputTokenPrice: 1.5,
      outputTokenPrice: 2.0,
    },

    // O1 family
    o1: {
      inputTokenPrice: 15.0,
      outputTokenPrice: 60.0,
    },
    "o1-mini": {
      inputTokenPrice: 3.0,
      outputTokenPrice: 12.0,
    },
    "o1-preview": {
      inputTokenPrice: 15.0,
      outputTokenPrice: 60.0,
    },
  },

  anthropic: {
    // Claude 3.5 family
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

    // Claude 3 family
    "claude-3-opus-20240229": {
      inputTokenPrice: 15.0,
      outputTokenPrice: 75.0,
    },
    "claude-3-sonnet-20240229": {
      inputTokenPrice: 3.0,
      outputTokenPrice: 15.0,
    },
    "claude-3-haiku-20240307": {
      inputTokenPrice: 0.25,
      outputTokenPrice: 1.25,
    },
  },

  // Ollama models are free (local)
  ollama: {
    // Default pricing for any Ollama model
    "*": {
      inputTokenPrice: 0,
      outputTokenPrice: 0,
    },
  },
};

/**
 * Calculate cost based on token usage and model pricing.
 *
 * @param usage - Token usage (input, output, total)
 * @param pricing - Model pricing (per 1M tokens)
 * @returns Cost in dollars
 */
export function calculateCost(
  usage: TokenUsage,
  pricing: ModelPricing
): number {
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputTokenPrice;
  const outputCost =
    (usage.outputTokens / 1_000_000) * pricing.outputTokenPrice;
  return inputCost + outputCost;
}

/**
 * Estimate cost for a prompt based on estimated tokens.
 *
 * @param estimatedInputTokens - Estimated input tokens
 * @param estimatedOutputTokens - Estimated output tokens
 * @param pricing - Model pricing
 * @returns Estimated cost in dollars
 */
export function estimateCost(
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  pricing: ModelPricing
): number {
  return calculateCost(
    {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      totalTokens: estimatedInputTokens + estimatedOutputTokens,
    },
    pricing
  );
}

/**
 * Get pricing for a specific provider and model.
 *
 * @param provider - Provider name (openai, anthropic, etc.)
 * @param model - Model name
 * @param customPricing - Optional custom pricing database
 * @returns Model pricing or undefined if not found
 */
export function getPricing(
  provider: string,
  model: string,
  customPricing?: Record<string, ProviderPricing>
): ModelPricing | undefined {
  const pricingDb = customPricing || DEFAULT_PRICING;

  const providerPricing = pricingDb[provider.toLowerCase()];
  if (!providerPricing) {
    return undefined;
  }

  // Try exact match first
  if (providerPricing[model]) {
    return providerPricing[model];
  }

  // Try wildcard match (for providers like Ollama)
  if (providerPricing["*"]) {
    return providerPricing["*"];
  }

  return undefined;
}

/**
 * Estimate tokens in text (rough approximation).
 * Rule of thumb: ~4 characters per token for English text.
 *
 * This is a very rough estimate. For production, use a proper tokenizer
 * like tiktoken (OpenAI) or the provider's tokenizer API.
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
