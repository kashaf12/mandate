/**
 * Example: Budget Runaway Prevention
 *
 * Problem:
 * - Agent enters infinite loop
 * - Each iteration calls expensive LLM
 * - Budget burns through before anyone notices
 *
 * Solution:
 * - Mandate enforces maxCostTotal
 * - Agent blocked when budget exhausted
 * - Cost is mechanically capped
 */

import { MandateClient, createLLMAction, MandateTemplates } from "@mandate/sdk";
import { isMandateBlockedError } from "./helpers/error-guards.js";

// Simulated LLM that costs money
const expensiveLLM = {
  async generate(prompt: string) {
    // Simulate processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      text: `Response to: ${prompt}`,
      usage: {
        prompt_tokens: 100,
        completion_tokens: 500,
        total_tokens: 600,
      },
    };
  },
};

// WITHOUT Mandate - burns money
async function withoutMandate() {
  console.log("\n" + "=".repeat(60));
  console.log("❌ WITHOUT MANDATE - Budget Runaway");
  console.log("=".repeat(60) + "\n");

  let totalCost = 0;
  let iterations = 0;
  const costPerCall = 0.5; // $0.50 per call

  // Simulated infinite loop (stopped at arbitrary limit)
  while (iterations < 50) {
    iterations++;

    await expensiveLLM.generate(`Iteration ${iterations}`);
    totalCost += costPerCall;

    console.log(`[Iteration ${iterations}] Cost: $${totalCost.toFixed(2)}`);

    if (totalCost > 10) {
      console.log(`\n❌ Burned through $${totalCost.toFixed(2)}`);
      console.log(`⚠️  No mechanical stop - relies on external monitoring\n`);
      break;
    }
  }
}

// WITH Mandate - budget enforced
async function withMandate() {
  console.log("\n" + "=".repeat(60));
  console.log("✅ WITH MANDATE - Budget Enforced");
  console.log("=".repeat(60) + "\n");

  // Phase 2: Using MandateTemplates
  const mandate = MandateTemplates.production("user@example.com", {
    description: "Budget-protected agent",
    // Key enforcement: budget cap
    maxCostTotal: 2.0, // $2 total budget

    defaultChargingPolicy: {
      type: "SUCCESS_BASED",
    },
  });

  const client = new MandateClient({
    mandate,
    auditLogger: "console",
  });

  let iterations = 0;

  while (true) {
    iterations++;

    const action = createLLMAction(
      "expensive-agent",
      "openai",
      "gpt-4",
      100, // input tokens
      500 // output tokens
    );

    // Override estimatedCost for demo
    action.estimatedCost = 0.5;

    try {
      console.log(`\n[Iteration ${iterations}] Attempting LLM call...`);
      const remaining = await client.getRemainingBudget();
      console.log(`  Budget remaining: $${remaining?.toFixed(2) || "∞"}`);

      const result = await client.executeLLM(action, async () => {
        const response = await expensiveLLM.generate(`Iteration ${iterations}`);
        return { ...response, actualCost: 0.5 };
      });
      void result;

      const cost = await client.getCost();
      console.log(`  ✅ Success - Cost: $${cost.total.toFixed(2)}`);
    } catch (error: unknown) {
      if (isMandateBlockedError(error)) {
        const cost = await client.getCost();
        console.log(`\n🛑 BLOCKED: ${error.reason}`);
        console.log(`💰 Final cost: $${cost.total.toFixed(2)}`);
        console.log(`📊 Iterations completed: ${iterations - 1}`);
        console.log(`\n✅ Budget enforcement prevented runaway costs\n`);
        break;
      }
      throw error;
    }
  }
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("💸 BUDGET RUNAWAY PREVENTION DEMO");
  console.log("=".repeat(60));
  console.log("\nProblem: Agent in loop burns through budget");
  console.log("Solution: Mandate enforces maxCostTotal mechanically\n");

  await withoutMandate();
  await withMandate();

  console.log("=".repeat(60));
  console.log("Key Takeaway:");
  console.log("=".repeat(60));
  console.log("✅ Budget is hard limit, not suggestion");
  console.log("✅ Enforced BEFORE execution (fail-closed)");
  console.log("✅ No external monitoring required");
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);
