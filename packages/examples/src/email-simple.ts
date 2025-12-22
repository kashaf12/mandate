/**
 * Example: Authority Enforcement for Bulk Email
 *
 * Demonstrates:
 * - Tool permission enforcement (allowlist)
 * - Rate limiting (prevent spam/abuse)
 * - Cost limits (prevent budget runaway)
 * - Argument validation (restrict recipients)
 *
 * This example focuses on AUTHORITY enforcement, not business outcomes.
 * The SDK enforces mechanical limits (rate, cost, scope), not delivery success.
 */
import OpenAI from "openai";
import {
  MandateClient,
  createToolAction,
  MandateTemplates,
  ValidationPatterns,
  CommonSchemas,
} from "@mandate/sdk";
import { validateDependencies } from "./helpers/validate-deps.js";
import { isError } from "./helpers/error-guards.js";

// Simulated email API
const sendEmail = {
  name: "send_email",
  description: "Send an email to a recipient",
  execute: async (args: { to: string; subject: string; body: string }) => {
    console.log(`[TOOL] send_email called with:`, args);
    return {
      status: "accepted",
      messageId: "msg-" + Math.random().toString(36).substring(7),
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

// Authority-focused mandate: enforce limits, not business outcomes
const mandate = MandateTemplates.production("user@example.com", {
  description: "Bulk email agent with authority limits",
  allowedTools: ["send_email"], // Only this tool allowed
  maxCostTotal: 1.0, // Total budget cap

  toolPolicies: {
    send_email: {
      maxCostPerCall: 0.05, // Per-email cost limit
      chargingPolicy: { type: "ATTEMPT_BASED" }, // Charge on attempt

      // Rate limiting: prevent spam/abuse
      rateLimit: {
        maxCalls: 10, // Max 10 emails
        windowMs: 60_000, // Per minute
      },

      // Argument validation: restrict recipients (authority scope)
      argumentValidation: {
        schema: CommonSchemas.email,
        validate: ValidationPatterns.internalEmailOnly("example.com"), // Only internal emails
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
  // Validate LLM is available (OpenAI or Ollama)
  const hasOpenAI = process.env.OPENAI_API_KEY;
  await validateDependencies({
    llm: hasOpenAI ? "openai" : "ollama",
  });

  const openai = new OpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "user", content: task },
  ];

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📧 AUTHORITY ENFORCEMENT: BULK EMAIL`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Task: ${task}`);
  console.log(`\nAgent Identity:`);
  console.log(`  ID: ${mandate.identity?.agentId}`);
  console.log(`  Principal: ${mandate.identity?.principal}`);
  console.log(`  Description: ${mandate.identity?.description}`);
  console.log(`\nAuthority Limits:`);
  console.log(`  Budget: $${mandate.maxCostTotal}`);
  console.log(
    `  Rate: ${
      mandate.toolPolicies?.send_email?.rateLimit?.maxCalls
    } emails per ${
      (mandate.toolPolicies?.send_email?.rateLimit?.windowMs || 0) / 1000
    }s`
  );
  console.log(`  Scope: Internal emails only (example.com)`);
  console.log(`${"=".repeat(60)}\n`);

  let iteration = 0;
  const maxIterations = 10;

  while (iteration < maxIterations) {
    iteration++;

    if (await client.isKilled()) {
      console.log(`\n[AGENT] 🛑 Agent was killed. Stopping.\n`);
      break;
    }

    const remaining = await client.getRemainingBudget();
    console.log(
      `[AGENT] 🧠 LLM call (budget: $${remaining?.toFixed(2) || "∞"})`
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
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            console.log(`\n[ERROR] 🚫 ${message}\n`);

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error: isError(error) ? error.message : String(error),
              }),
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
  const cost = await client.getCost();
  console.log(
    `Cost: $${cost.total.toFixed(2)} (cognition: $${cost.cognition.toFixed(
      2
    )}, execution: $${cost.execution.toFixed(2)})`
  );
  const remaining = await client.getRemainingBudget();
  console.log(`Remaining budget: $${remaining?.toFixed(2) || "∞"}`);
  const callCount = await client.getCallCount();
  console.log(`Calls: ${callCount}`);
  const isKilled = await client.isKilled();
  console.log(`Killed: ${isKilled}`);
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
