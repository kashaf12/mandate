// Simplified example using MandateClient (Phase 2)
import OpenAI from "openai";
import {
  MandateClient,
  createToolAction,
  MandateTemplates,
  ValidationPatterns,
  CommonSchemas,
} from "@mandate/sdk";

// The broken tool (same as before)
const sendEmail = {
  name: "send_email",
  description: "Send an email to a recipient",
  execute: async (args: { to: string; subject: string; body: string }) => {
    console.log(`[TOOL] send_email called with:`, args);
    return {
      status: "accepted",
      messageId: "fake-" + Math.random().toString(36).substring(7),
      deliveryConfirmed: false, // Delivery failed
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

// Simplified mandate configuration (Phase 2: Using MandateTemplates)
const mandate = MandateTemplates.production("user@example.com", {
  description: "Email automation agent",
  allowedTools: ["send_email"],
  maxCostTotal: 1.0,

  // Verification with attempt-based charging
  toolPolicies: {
    send_email: {
      maxCostPerCall: 0.05,
      chargingPolicy: { type: "ATTEMPT_BASED" },

      // NEW: Phase 2 argument validation
      argumentValidation: {
        schema: CommonSchemas.email,
        validate: ValidationPatterns.internalEmailOnly("example.com"),
      },

      verifyResult: (ctx) => {
        const result = ctx.result as any;
        if (!result.deliveryConfirmed) {
          return {
            ok: false,
            reason: "EMAIL_NOT_CONFIRMED: Email not delivered",
          };
        }
        return { ok: true };
      },
    },
  },
});

// ✨ ONE LINE - Create client with all features
const client = new MandateClient({
  mandate,
  auditLogger: "memory", // Could be 'console', 'none', or { file: 'audit.log' }
});

async function runSimpleEmailAgent(task: string) {
  const openai = new OpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "user", content: task },
  ];

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📧 SIMPLIFIED EMAIL AGENT (Phase 2)`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Task: ${task}`);
  console.log(`\nAgent Identity:`);
  console.log(`  ID: ${mandate.identity?.agentId}`);
  console.log(`  Principal: ${mandate.identity?.principal}`);
  console.log(`  Description: ${mandate.identity?.description}`);
  console.log(`\nBudget: $${mandate.maxCostTotal}`);
  console.log(`${"=".repeat(60)}\n`);

  let iteration = 0;
  const maxIterations = 10;

  while (iteration < maxIterations) {
    iteration++;

    if (client.isKilled()) {
      console.log(`\n[AGENT] 🛑 Agent was killed. Stopping.\n`);
      break;
    }

    console.log(
      `[AGENT] 🧠 LLM call (budget: $${client
        .getRemainingBudget()
        ?.toFixed(2)})`
    );

    // ✨ ONE LINE - client handles everything
    const response = await client.executeLLMWithBudget(
      "ollama",
      "qwen2.5:3b",
      messages,
      (maxTokens) =>
        openai.chat.completions.create({
          model: "qwen2.5:3b",
          messages,
          tools: [SEND_EMAIL_TOOL],
          tool_choice: "auto",
          max_tokens: maxTokens, // Automatically calculated
        })
    );

    const message = response.choices[0]?.message;
    if (!message) break;

    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") continue;

        if (toolCall.function.name === "send_email") {
          const toolArgs = JSON.parse(toolCall.function.arguments);

          console.log(`\n[AGENT] 📤 Calling: send_email`);

          // Create action
          const action = createToolAction(
            mandate.agentId,
            "send_email",
            toolArgs,
            0.01
          );

          try {
            // ✨ SIMPLE EXECUTION - client handles everything
            const result = await client.executeTool(action, () =>
              sendEmail.execute(toolArgs)
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
          }
        }
      }
    } else {
      console.log(`\n[AGENT] 💬 ${message.content}\n`);
      break;
    }
  }

  // ✨ SIMPLE STATE QUERIES
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 FINAL STATE`);
  console.log(`${"=".repeat(60)}`);
  const cost = client.getCost();
  console.log(
    `Cost: $${cost.total.toFixed(2)} (cognition: $${cost.cognition.toFixed(
      2
    )}, execution: $${cost.execution.toFixed(2)})`
  );
  console.log(`Remaining budget: $${client.getRemainingBudget()?.toFixed(2)}`);
  console.log(`Calls: ${client.getCallCount()}`);
  console.log(`Killed: ${client.isKilled()}`);
  console.log(`${"=".repeat(60)}\n`);

  // ✨ SIMPLE AUDIT ACCESS
  console.log(`${"=".repeat(60)}`);
  console.log(`📝 AUDIT TRAIL`);
  console.log(`${"=".repeat(60)}`);
  const entries = client.getAuditEntries();
  console.log(`Total entries: ${entries.length}\n`);
  entries.forEach((entry, i) => {
    console.log(`[${i + 1}] ${entry.decision}: ${entry.reason}`);
    console.log(`    Cost: $${entry.actualCost?.toFixed(3) || "0.000"}`);
  });
  console.log(`${"=".repeat(60)}\n`);
}

const task =
  'Send email to user@example.com with subject "Invoice" and body "Payment due"';

runSimpleEmailAgent(task).catch((error) => {
  console.error("[FATAL]", error);
  process.exit(1);
});
