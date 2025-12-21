// Complete Mandate SDK integration - all 7 layers
import OpenAI from "openai";
import {
  PolicyEngine,
  StateManager,
  ConsoleAuditLogger,
  MemoryAuditLogger,
  MultiAuditLogger,
  KillSwitch,
  createToolAction,
  executeTool,
  type Mandate,
} from "@mandate/sdk";

// The broken tool (simulates real-world API that lies about success)
const sendEmail = {
  name: "send_email",
  description: "Send an email to a recipient",
  execute: async (args: { to: string; subject: string; body: string }) => {
    console.log(`[TOOL] send_email called with:`, args);

    // Simulate API returning 202 Accepted
    // But email is never delivered (spam filter, invalid domain, etc.)
    return {
      status: "accepted",
      messageId: "fake-" + Math.random().toString(36).substring(7),
      deliveryConfirmed: false, // This is the failure
    };
  },
};

const SEND_EMAIL_TOOL = {
  type: "function" as const,
  function: {
    name: "send_email",
    description: "Send an email to a recipient",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
};

// Real Mandate SDK configuration with all features
const mandate: Mandate = {
  version: 1,
  id: "mandate-email-1",
  agentId: "email-agent",
  issuedAt: Date.now(),

  // Authority (Layer 1)
  issuer: {
    type: "human",
    id: "kashaf@mandate.dev",
  },

  // Scope
  scope: {
    environment: "dev",
    service: "email-demo",
  },

  // Permissions
  allowedTools: ["send_email"],
  deniedTools: [],

  // Limits (Layer 1)
  maxCostTotal: 1.0,
  maxCostPerCall: 0.1,

  // Charging Policy (Layer 2)
  defaultChargingPolicy: {
    type: "SUCCESS_BASED", // Only charge for successful executions
  },

  // Tool-specific policies with verification (Layer 1)
  toolPolicies: {
    send_email: {
      maxCostPerCall: 0.05,
      chargingPolicy: {
        type: "ATTEMPT_BASED", // Charge even if verification fails
      },
      verifyResult: (ctx) => {
        const result = ctx.result as any;
        if (!result.deliveryConfirmed) {
          return {
            ok: false,
            reason:
              "EMAIL_NOT_CONFIRMED: Email accepted but delivery not confirmed",
          };
        }
        return { ok: true };
      },
    },
  },
};

// Initialize all SDK components
const policyEngine = new PolicyEngine(); // Layer 1
const stateManager = new StateManager(); // Layer 2
const memoryLogger = new MemoryAuditLogger(); // Layer 6 (for inspection)
const consoleLogger = new ConsoleAuditLogger(); // Layer 6 (for output)
const auditLogger = new MultiAuditLogger([memoryLogger, consoleLogger]); // Layer 6
const killSwitch = new KillSwitch(stateManager); // Layer 7

async function runEmailAgentWithFullSDK(task: string) {
  const client = new OpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "user", content: task },
  ];

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📧 EMAIL AGENT WITH FULL MANDATE SDK (All 7 Layers)`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Task: ${task}`);
  console.log(`Mandate: ${mandate.id}`);
  console.log(`Authority: ${mandate.issuer?.type} (${mandate.issuer?.id})`);
  console.log(
    `Scope: ${mandate.scope?.environment} / ${mandate.scope?.service}`
  );
  console.log(
    `Budget: $${mandate.maxCostTotal} total, $${mandate.maxCostPerCall} per call`
  );
  console.log(`Charging: ${mandate.defaultChargingPolicy?.type}`);
  console.log(`Audit: Console + Memory (${memoryLogger.count()} entries)`);
  console.log(`${"=".repeat(80)}\n`);

  const model = "functiongemma";
  let iteration = 0;
  const maxIterations = 10;

  while (iteration < maxIterations) {
    iteration++;

    // Check if agent was killed
    if (killSwitch.isKilled(mandate.agentId, mandate.id)) {
      console.log(`\n[AGENT] 🛑 Agent was killed. Stopping.\n`);
      break;
    }

    const response = await client.chat.completions.create({
      model,
      messages,
      tools: [SEND_EMAIL_TOOL],
      tool_choice: "auto",
    });

    const message = response.choices[0]?.message;
    if (!message) break;

    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") continue;

        if (toolCall.function.name === "send_email") {
          let toolArgs: { to: string; subject: string; body: string };
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            toolArgs = { to: "", subject: "", body: "" };
          }

          console.log(`\n[AGENT] 📤 Calling tool: send_email`);
          console.log(`[AGENT] Args:`, toolArgs);

          // Create action using helper (Layer 5)
          const action = createToolAction(
            mandate.agentId,
            "send_email",
            toolArgs,
            0.01 // Estimated cost
          );

          console.log(`[ACTION] ID: ${action.id}`);
          console.log(
            `[ACTION] Type: ${action.type}, Cost Type: ${action.costType}`
          );

          try {
            // Execute with full SDK (Layers 1-7 integrated)
            const result = await executeTool(
              action,
              () => sendEmail.execute(toolArgs),
              mandate,
              policyEngine,
              stateManager,
              auditLogger // Layer 6: Audit all decisions
            );

            console.log(`[TOOL] ✅ Result:`, result);

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.log(`\n[ERROR] 🚫 ${error.message}\n`);

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: error.message }),
            });

            // Uncomment to test kill switch:
            killSwitch.kill(mandate.agentId, mandate.id, "Too many failures");
          }
        }
      }
    } else {
      console.log(`\n[AGENT] 💬 Final response: ${message.content}\n`);
      break;
    }
  }

  // Show final state (Layer 2)
  const finalState = stateManager.get(mandate.agentId, mandate.id);

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 FINAL STATE (StateManager - Layer 2)`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Agent ID: ${finalState.agentId}`);
  console.log(`Mandate ID: ${finalState.mandateId}`);
  console.log(`Cumulative cost: $${finalState.cumulativeCost.toFixed(2)}`);
  console.log(`  - Cognition: $${finalState.cognitionCost.toFixed(2)}`);
  console.log(`  - Execution: $${finalState.executionCost.toFixed(2)}`);
  console.log(`Total calls: ${finalState.callCount}`);
  console.log(`Actions executed: ${finalState.seenActionIds.size}`);
  console.log(`Idempotency keys: ${finalState.seenIdempotencyKeys.size}`);
  console.log(`Agent killed: ${finalState.killed}`);
  console.log(`${"=".repeat(80)}\n`);

  // Show audit trail (Layer 6)
  console.log(`${"=".repeat(80)}`);
  console.log(`📝 AUDIT TRAIL (MemoryAuditLogger - Layer 6)`);
  console.log(`${"=".repeat(80)}`);
  const auditEntries = memoryLogger.getEntries();
  console.log(`Total audit entries: ${auditEntries.length}\n`);

  auditEntries.forEach((entry, index) => {
    console.log(`[${index + 1}] ${entry.decision} - ${entry.reason}`);
    console.log(`    Tool: ${entry.tool || "N/A"}`);
    console.log(
      `    Cost: estimated=$${
        entry.estimatedCost?.toFixed(3) || "0"
      }, actual=$${entry.actualCost?.toFixed(3) || "0"}`
    );
    console.log(`    Cumulative: $${entry.cumulativeCost?.toFixed(3) || "0"}`);
    if (entry.metadata?.durationMs) {
      console.log(`    Duration: ${entry.metadata.durationMs}ms`);
    }
    console.log();
  });
  console.log(`${"=".repeat(80)}\n`);
}

const task =
  'Send an email to user@example.com with subject "Invoice" and body "Payment due"';

runEmailAgentWithFullSDK(task).catch((error) => {
  console.error("[FATAL ERROR]", error);
  process.exit(1);
});
