/**
 * Example: Multi-Server Kill Switch (Phase 3)
 *
 * Demonstrates:
 * - Global kill switch propagation via Redis Pub/Sub
 * - Agent role: Runs tasks until killed
 * - Killer role: Broadcasts kill signal to all servers
 *
 * Run in multiple terminals:
 * Terminal 1 (Agent): ROLE=agent pnpm example:phase3-multiserver
 * Terminal 2 (Agent): ROLE=agent pnpm example:phase3-multiserver
 * Terminal 3 (Killer): ROLE=killer pnpm example:phase3-multiserver
 *
 * Watch the killer stop all agents instantly!
 */

import {
  MandateClient,
  createToolAction,
  MandateTemplates,
} from "@mandate/sdk";

// Simulated tool
async function simulateWork(): Promise<{ success: boolean }> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { success: true };
}

async function runAgent() {
  const agentId = `agent-${process.env.AGENT_ID || Date.now()}`;
  const mandateId = process.env.MANDATE_ID || "shared-mandate";

  console.log("\n" + "=".repeat(60));
  console.log(`🤖 AGENT MODE - ${agentId}`);
  console.log("=".repeat(60));
  console.log(`Waiting for kill signal from any server...`);
  console.log("=".repeat(60) + "\n");

  const mandate = MandateTemplates.production("user@example.com", {
    id: mandateId, // Explicit ID for distributed coordination
    agentId,
    maxCostTotal: 100.0,
    allowedTools: ["*"],
  });

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
    auditLogger: "none",
  });

  // Register kill callback
  await client.onKill((reason) => {
    console.log(`\n🛑 KILL SIGNAL RECEIVED: ${reason}`);
    console.log(`   Agent ${agentId} stopping immediately...\n`);
  });

  // Run tasks in a loop until killed
  let iteration = 0;
  const action = createToolAction(agentId, "work", {}, 0.1);

  while (true) {
    iteration++;
    const isKilled = await client.isKilled();

    if (isKilled) {
      console.log(`[Agent ${agentId}] Stopped after ${iteration} iterations`);
      break;
    }

    try {
      await client.executeTool(action, simulateWork);
      console.log(`[Agent ${agentId}] Iteration ${iteration}: Working...`);
    } catch (error: any) {
      if (error.name === "MandateBlockedError") {
        console.log(`[Agent ${agentId}] Blocked: ${error.reason}`);
        break;
      } else {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await client.close();
}

async function runKiller() {
  const mandateId = process.env.MANDATE_ID || "shared-mandate";
  const targetAgentId = process.env.TARGET_AGENT_ID || "agent-*";

  console.log("\n" + "=".repeat(60));
  console.log(`💀 KILLER MODE`);
  console.log("=".repeat(60));
  console.log(`Target: All agents with mandate ${mandateId}`);
  console.log(`Mandate: ${mandateId}`);
  console.log("=".repeat(60) + "\n");

  // Create a mandate with the same ID as the agents
  // This allows us to kill agents that share the same mandate
  const mandate = MandateTemplates.production("admin@example.com", {
    id: mandateId, // Explicit ID for distributed coordination
    agentId: targetAgentId, // Use target agent ID to kill the right agent
    maxCostTotal: 100.0,
    allowedTools: ["*"],
  });

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

  // Wait a bit to let agents start
  console.log("Waiting 3 seconds for agents to start...\n");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Kill agents with the same mandate
  // In distributed mode, this broadcasts to all servers
  const reason =
    process.env.KILL_REASON || "Emergency stop from killer process";
  console.log(`🚨 Broadcasting kill signal...`);
  console.log(`   Target: All agents with mandate ${mandateId}`);
  console.log(`   Reason: ${reason}\n`);

  await client.kill(reason);

  console.log("✅ Kill signal broadcasted to all servers!");
  console.log(
    "   All agents sharing this mandate should stop within 1 second.\n"
  );

  // Wait a bit to see the effect
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await client.close();
}

async function main() {
  const role = process.env.ROLE || "agent";

  if (role === "killer") {
    await runKiller();
  } else {
    await runAgent();
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
