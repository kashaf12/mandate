import { describe, it, expect } from "vitest";
import {
  calculateCost,
  estimateCost,
  getPricing,
  estimateTokens,
  DEFAULT_PRICING,
} from "../src/pricing";
import type { TokenUsage, ModelPricing } from "../src/types";

describe("Cost Estimation", () => {
  describe("calculateCost", () => {
    it("calculates cost for GPT-4", () => {
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      const pricing = DEFAULT_PRICING.openai["gpt-4"];
      const cost = calculateCost(usage, pricing);

      // (1000/1M * 30) + (500/1M * 60) = 0.03 + 0.03 = 0.06
      expect(cost).toBeCloseTo(0.06, 4);
    });

    it("calculates cost for Claude Sonnet", () => {
      const usage: TokenUsage = {
        inputTokens: 10000,
        outputTokens: 2000,
        totalTokens: 12000,
      };

      const pricing = DEFAULT_PRICING.anthropic["claude-3-5-sonnet-20241022"];
      const cost = calculateCost(usage, pricing);

      // (10000/1M * 3) + (2000/1M * 15) = 0.03 + 0.03 = 0.06
      expect(cost).toBeCloseTo(0.06, 4);
    });

    it("calculates zero cost for free models", () => {
      const usage: TokenUsage = {
        inputTokens: 10000,
        outputTokens: 5000,
        totalTokens: 15000,
      };

      const pricing = DEFAULT_PRICING.ollama["*"];
      const cost = calculateCost(usage, pricing);

      expect(cost).toBe(0);
    });

    it("handles large token counts", () => {
      const usage: TokenUsage = {
        inputTokens: 1_000_000, // 1M tokens
        outputTokens: 500_000,
        totalTokens: 1_500_000,
      };

      const pricing = DEFAULT_PRICING.openai["gpt-4o-mini"];
      const cost = calculateCost(usage, pricing);

      // (1M/1M * 0.15) + (500k/1M * 0.60) = 0.15 + 0.30 = 0.45
      expect(cost).toBeCloseTo(0.45, 4);
    });
  });

  describe("estimateCost", () => {
    it("estimates cost before execution", () => {
      const pricing = DEFAULT_PRICING.openai["gpt-4o"];
      const cost = estimateCost(5000, 2000, pricing);

      // (5000/1M * 2.5) + (2000/1M * 10) = 0.0125 + 0.02 = 0.0325
      expect(cost).toBeCloseTo(0.0325, 4);
    });
  });

  describe("getPricing", () => {
    it("gets pricing for OpenAI model", () => {
      const pricing = getPricing("openai", "gpt-4o");

      expect(pricing).toBeDefined();
      expect(pricing?.inputTokenPrice).toBe(2.5);
      expect(pricing?.outputTokenPrice).toBe(10.0);
    });

    it("gets pricing for Anthropic model", () => {
      const pricing = getPricing("anthropic", "claude-3-5-sonnet-20241022");

      expect(pricing).toBeDefined();
      expect(pricing?.inputTokenPrice).toBe(3.0);
      expect(pricing?.outputTokenPrice).toBe(15.0);
    });

    it("handles case-insensitive provider names", () => {
      const pricing1 = getPricing("OpenAI", "gpt-4");
      const pricing2 = getPricing("openai", "gpt-4");

      expect(pricing1).toEqual(pricing2);
    });

    it("returns undefined for unknown provider", () => {
      const pricing = getPricing("unknown", "model");
      expect(pricing).toBeUndefined();
    });

    it("returns undefined for unknown model", () => {
      const pricing = getPricing("openai", "unknown-model");
      expect(pricing).toBeUndefined();
    });

    it("uses wildcard for Ollama models", () => {
      const pricing1 = getPricing("ollama", "llama2");
      const pricing2 = getPricing("ollama", "mistral");

      expect(pricing1).toBeDefined();
      expect(pricing2).toBeDefined();
      expect(pricing1).toEqual(pricing2);
      expect(pricing1?.inputTokenPrice).toBe(0);
    });

    it("uses custom pricing when provided", () => {
      const customPricing = {
        custom: {
          "my-model": {
            inputTokenPrice: 5.0,
            outputTokenPrice: 10.0,
          },
        },
      };

      const pricing = getPricing("custom", "my-model", customPricing);

      expect(pricing).toBeDefined();
      expect(pricing?.inputTokenPrice).toBe(5.0);
    });
  });

  describe("estimateTokens", () => {
    it("estimates tokens for short text", () => {
      const text = "Hello, world!";
      const tokens = estimateTokens(text);

      // 13 chars / 4 = 3.25 → 4 tokens
      expect(tokens).toBe(4);
    });

    it("estimates tokens for longer text", () => {
      const text =
        "This is a longer piece of text that should have more tokens.";
      const tokens = estimateTokens(text);

      // 60 chars / 4 = 15 tokens
      expect(tokens).toBe(15);
    });

    it("handles empty string", () => {
      const tokens = estimateTokens("");
      expect(tokens).toBe(0);
    });
  });

  describe("Pricing Database Coverage", () => {
    it("has pricing for major OpenAI models", () => {
      expect(DEFAULT_PRICING.openai["gpt-4"]).toBeDefined();
      expect(DEFAULT_PRICING.openai["gpt-4o"]).toBeDefined();
      expect(DEFAULT_PRICING.openai["gpt-4o-mini"]).toBeDefined();
      expect(DEFAULT_PRICING.openai["gpt-3.5-turbo"]).toBeDefined();
    });

    it("has pricing for major Anthropic models", () => {
      expect(
        DEFAULT_PRICING.anthropic["claude-3-5-sonnet-20241022"]
      ).toBeDefined();
      expect(DEFAULT_PRICING.anthropic["claude-3-opus-20240229"]).toBeDefined();
      expect(
        DEFAULT_PRICING.anthropic["claude-3-haiku-20240307"]
      ).toBeDefined();
    });

    it("has free pricing for Ollama", () => {
      expect(DEFAULT_PRICING.ollama["*"]).toBeDefined();
      expect(DEFAULT_PRICING.ollama["*"].inputTokenPrice).toBe(0);
      expect(DEFAULT_PRICING.ollama["*"].outputTokenPrice).toBe(0);
    });
  });
});
