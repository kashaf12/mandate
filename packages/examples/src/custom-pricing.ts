/**
 * Example: Custom Pricing
 *
 * Shows how to define custom pricing for:
 * - Proprietary models
 * - Local models with cost attribution
 * - Custom providers
 */

import { MandateClient, type Mandate } from "@mandate/sdk";

async function example1_LocalModelWithCost() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 1: Local Model with Cost Attribution");
  console.log("=".repeat(60) + "\n");

  const mandate: Mandate = {
    version: 1,
    id: "mandate-custom-local",
    agentId: "agent-1",
    issuedAt: Date.now(),

    maxCostTotal: 1.0,

    // Attribute cost to local Ollama model (for budgeting/tracking)
    customPricing: {
      ollama: {
        "llama3.1:8b": {
          inputTokenPrice: 0.01, // $0.01 per 1M tokens (internal cost)
          outputTokenPrice: 0.02, // $0.02 per 1M tokens
        },
      },
    },
  };

  void new MandateClient({ mandate });

  console.log("Local Ollama model with custom internal pricing");
  console.log("Useful for: cost attribution, budget tracking, chargeback\n");
  console.log(
    "Custom pricing:",
    JSON.stringify(mandate.customPricing, null, 2)
  );
}

async function example2_ProprietaryModel() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 2: Proprietary/Custom Model");
  console.log("=".repeat(60) + "\n");

  const mandate: Mandate = {
    version: 1,
    id: "mandate-custom-model",
    agentId: "agent-1",
    issuedAt: Date.now(),

    maxCostTotal: 10.0,

    // Your own model or provider
    customPricing: {
      "my-company": {
        "proprietary-model-v1": {
          inputTokenPrice: 5.0,
          outputTokenPrice: 15.0,
        },
      },
    },
  };

  void new MandateClient({ mandate });

  console.log("Proprietary model with custom pricing");
  console.log(
    "Useful for: internal models, fine-tuned models, custom providers\n"
  );
  console.log(
    "Custom pricing:",
    JSON.stringify(mandate.customPricing, null, 2)
  );
}

async function example3_OverrideDefaultPricing() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 3: Override Default Pricing");
  console.log("=".repeat(60) + "\n");

  const mandate: Mandate = {
    version: 1,
    id: "mandate-override",
    agentId: "agent-1",
    issuedAt: Date.now(),

    maxCostTotal: 5.0,

    // Override built-in pricing (e.g., negotiated rates, regional pricing)
    customPricing: {
      openai: {
        "gpt-4o": {
          inputTokenPrice: 2.0, // Negotiated rate (vs 2.5 default)
          outputTokenPrice: 8.0, // Negotiated rate (vs 10.0 default)
        },
      },
    },
  };

  void new MandateClient({ mandate });

  console.log("Override default pricing with negotiated rates");
  console.log(
    "Useful for: volume discounts, regional pricing, enterprise agreements\n"
  );
  console.log(
    "Custom pricing:",
    JSON.stringify(mandate.customPricing, null, 2)
  );
}

async function example4_WildcardPricing() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 4: Wildcard Pricing (All Models Same Price)");
  console.log("=".repeat(60) + "\n");

  const mandate: Mandate = {
    version: 1,
    id: "mandate-wildcard",
    agentId: "agent-1",
    issuedAt: Date.now(),

    maxCostTotal: 10.0,

    // All models from provider have same pricing
    customPricing: {
      "custom-provider": {
        "*": {
          // Wildcard - applies to all models
          inputTokenPrice: 1.0,
          outputTokenPrice: 3.0,
        },
      },
    },
  };

  void new MandateClient({ mandate });

  console.log("Wildcard pricing for all models from a provider");
  console.log("Useful for: flat-rate providers, internal APIs\n");
  console.log(
    "Custom pricing:",
    JSON.stringify(mandate.customPricing, null, 2)
  );
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("💰 CUSTOM PRICING EXAMPLES");
  console.log("=".repeat(60));
  console.log("\nMandate SDK supports flexible pricing:");
  console.log("1. Built-in pricing (major providers)");
  console.log("2. Custom pricing (your models/rates)");
  console.log("3. Wildcard pricing (provider-wide)");
  console.log("4. No pricing = $0 (free/local)\n");

  await example1_LocalModelWithCost();
  await example2_ProprietaryModel();
  await example3_OverrideDefaultPricing();
  await example4_WildcardPricing();

  console.log("\n" + "=".repeat(60));
  console.log("Key Takeaways");
  console.log("=".repeat(60));
  console.log("✅ customPricing in Mandate overrides defaults");
  console.log("✅ Missing pricing defaults to $0 (not an error)");
  console.log("✅ Wildcard (*) supported for provider-wide pricing");
  console.log("✅ Pricing is per 1M tokens (input/output)");
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);
