/**
 * Example: Distributed Budget Enforcement (Phase 3)
 *
 * Demonstrates:
 * - Multiple processes sharing a single budget
 * - Atomic budget enforcement via Redis
 * - Global state coordination
 *
 * Run in multiple terminals:
 * Terminal 1: PROCESS_ID=1 pnpm example:phase3-budget
 * Terminal 2: PROCESS_ID=2 pnpm example:phase3-budget
 * Terminal 3: PROCESS_ID=3 pnpm example:phase3-budget
 *
 * Watch them compete for the shared $10 budget!
 */

import {
  MandateClient,
  createToolAction,
  MandateTemplates,
} from "@mandate/sdk";

// Simulated tool that costs money
async function simulateExpensiveTool(
  _cost: number
): Promise<{ success: boolean }> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { success: true };
}

async function main() {
  const processId = process.env.PROCESS_ID || "1";
  const agentId = `distributed-agent-${processId}`;
  const mandateId = process.env.MANDATE_ID || "shared-budget-mandate";

  console.log("\n" + "=".repeat(60));
  console.log(`🚀 PROCESS ${processId} - Distributed Budget Example`);
  console.log("=".repeat(60));
  console.log(`Agent ID: ${agentId}`);
  console.log(`Mandate ID: ${mandateId}`);
  console.log(`Shared Budget: $10.00`);
  console.log("=".repeat(60) + "\n");

  // Create mandate with shared budget
  const mandate = MandateTemplates.production("user@example.com", {
    agentId,
    maxCostTotal: 10.0,
    maxCostPerCall: 5.0,
    allowedTools: ["*"],
  });

  // Override mandate ID to ensure all processes share the same state
  mandate.id = mandateId;

  // Create client with Redis backend
  const client = new MandateClient({
    mandate,
    stateManager: {
      type: "redis",
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
        keyPrefix: "example:mandate:",
      },
    },
    auditLogger: "console",
  });

  // Try to spend money in a loop
  const costs = [3.5, 2.0, 4.0, 1.5, 2.5]; // Total: $13.5 (exceeds $10 budget)
  let iteration = 0;

  console.log(`[Process ${processId}] Starting to spend...\n`);

  for (const cost of costs) {
    iteration++;
    const action = createToolAction(agentId, "expensive_tool", {}, cost);

    try {
      console.log(
        `[Process ${processId}] Iteration ${iteration}: Attempting to spend $${cost.toFixed(
          2
        )}...`
      );

      await client.executeTool(action, () => simulateExpensiveTool(cost));

      const currentCost = await client.getCurrentCost();
      const remaining = await client.getRemainingBudget();

      console.log(
        `  ✅ Success! Total spent: $${currentCost.toFixed(2)}, Remaining: $${
          remaining?.toFixed(2) || "0.00"
        }`
      );
    } catch (error: any) {
      if (error.name === "MandateBlockedError") {
        const currentCost = await client.getCurrentCost();
        console.log(
          `  🚫 BLOCKED: ${error.reason} (Total spent: $${currentCost.toFixed(
            2
          )})`
        );
        break;
      } else {
        throw error;
      }
    }

    // Small delay between attempts
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Final state
  const finalCost = await client.getCurrentCost();
  const finalRemaining = await client.getRemainingBudget();
  const isKilled = await client.isKilled();

  console.log("\n" + "=".repeat(60));
  console.log(`[Process ${processId}] FINAL STATE`);
  console.log("=".repeat(60));
  console.log(`Total spent: $${finalCost.toFixed(2)}`);
  console.log(`Remaining budget: $${finalRemaining?.toFixed(2) || "0.00"}`);
  console.log(`Agent killed: ${isKilled}`);
  console.log("=".repeat(60) + "\n");

  // Cleanup
  await client.close();
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
