/**
 * Example: Retry Storm with Real LLM Agent
 *
 * Real failure mode:
 * - Agent calls tool that fails (503, timeout, etc.)
 * - Agent sees error and decides to retry
 * - Loop continues until intervention
 *
 * With Mandate:
 * - Rate limit stops the loop mechanically
 * - Cost is capped (attempt-based charging)
 * - Agent can't burn money on retries
 */

import OpenAI from "openai";
import {
  MandateClient,
  createToolAction,
  MandateTemplates,
  CommonSchemas,
} from "@mandate/sdk";

// Simulated unreliable email API
let emailAttempts = 0;

const emailAPI = {
  name: "send_email",
  description: "Send an email (unreliable - fails often)",

  execute: async (_args: { to: string; subject: string; body: string }) => {
    emailAttempts++;
    console.log(`\n[EMAIL API] Attempt #${emailAttempts}`);

    // Fail first 25 attempts (simulating transient errors)
    if (emailAttempts <= 25) {
      throw new Error("503 Service Temporarily Unavailable");
    }

    return {
      status: "sent",
      messageId: `msg-${Date.now()}`,
      deliveryConfirmed: true,
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
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body" },
      },
      required: ["to", "subject", "body"],
    },
  },
};

async function withoutMandate() {
  console.log("\n" + "=".repeat(70));
  console.log("❌ WITHOUT MANDATE - Agent Can Retry Forever");
  console.log("=".repeat(70) + "\n");

  emailAttempts = 0;
  const openai = new OpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "user",
      content:
        "Send an email to user@example.com with subject 'Test' and body 'Hello'. If it fails, keep trying until it succeeds.",
    },
  ];

  let iteration = 0;
  const MAX_ITERATIONS = 20; // Safety limit

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n[Iteration ${iteration}]`);

    const response = await openai.chat.completions.create({
      model: "qwen2.5:3b",
      messages,
      tools: [SEND_EMAIL_TOOL],
      temperature: 0.1,
    });

    const message = response.choices[0]?.message;
    if (!message) break;

    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === "send_email") {
          const args = JSON.parse(toolCall.function.arguments);

          try {
            const result = await emailAPI.execute(args);
            console.log(`  ✅ Email sent: ${result.messageId}`);

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });

            console.log(`\n💸 Total attempts: ${emailAttempts}`);
            console.log(
              `⚠️  No mechanical limit - agent could have retried forever\n`
            );
            return;
          } catch (error: any) {
            console.log(`  ❌ Failed: ${error.message}`);

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: error.message }),
            });
          }
        }
      }
    } else if (message.content) {
      console.log(`  Agent: ${message.content}`);
      // Don't break - agent might say "I'll retry" and continue in next iteration
      // Only break if we hit MAX_ITERATIONS or email succeeds
    } else {
      // LLM returned message with no tool_calls and no content - continue loop
      // This can happen when LLM is "thinking" or returns empty response
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    console.log(`\n⚠️  Hit arbitrary iteration limit (${MAX_ITERATIONS})`);
    console.log(`💸 This could have been 1000+ attempts in production\n`);
  }
}

async function withMandate() {
  console.log("\n" + "=".repeat(70));
  console.log("✅ WITH MANDATE - Rate Limit Stops The Loop");
  console.log("=".repeat(70) + "\n");

  emailAttempts = 0;

  // Phase 2: Using MandateTemplates with argument validation
  const mandate = MandateTemplates.production("user@example.com", {
    description: "Retry-protected email agent",
    maxCostTotal: 5.0, // $5 total budget

    toolPolicies: {
      send_email: {
        // CRITICAL: Rate limit on tool calls
        rateLimit: {
          maxCalls: 5, // Max 5 attempts
          windowMs: 60_000, // Per minute
        },
        chargingPolicy: {
          type: "ATTEMPT_BASED", // Charge even on failure
        },
        maxCostPerCall: 0.01,

        // NEW: Phase 2 - Validate email format BEFORE retrying
        argumentValidation: {
          schema: CommonSchemas.email,
        },
      },
    },
  });

  const client = new MandateClient({
    mandate,
    auditLogger: "memory",
  });

  const openai = new OpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are a persistent email agent. You MUST keep retrying the send_email tool call until it succeeds. Never give up. Always call the send_email tool when the previous attempt fails.",
    },
    {
      role: "user",
      content:
        "Send an email to user@example.com with subject 'Test' and body 'Hello'. You MUST keep calling send_email until it succeeds. Do not stop trying.",
    },
  ];

  let iteration = 0;
  let iterationsSinceLastToolCall = 0;
  const RATE_LIMIT = 5;

  while (iteration < 50) {
    iteration++;
    const callCount = await client.getCallCount();
    const remaining = await client.getRemainingBudget();
    console.log(
      `\n[Iteration ${iteration}] Budget: $${
        remaining?.toFixed(2) || "∞"
      }, Calls: ${callCount}`
    );

    // If we've hit the rate limit and agent hasn't tried in 3 iterations, force it
    if (callCount >= RATE_LIMIT && iterationsSinceLastToolCall >= 3) {
      console.log(
        `  ⚠️  Rate limit reached (${RATE_LIMIT} calls). Forcing agent to attempt one more call to demonstrate mandate block...`
      );
      messages.push({
        role: "user",
        content:
          "The email still hasn't been sent. You MUST call send_email again right now. Do not give up.",
      });
      iterationsSinceLastToolCall = 0;
    }

    // 🛡️ ENFORCE LLM CALL
    console.log(`  🧠 LLM call (enforced by Mandate)`);

    const response = await client.executeLLMWithBudget(
      "ollama",
      "qwen2.5:3b",
      messages,
      (maxTokens) =>
        openai.chat.completions.create({
          model: "qwen2.5:3b",
          messages,
          tools: [SEND_EMAIL_TOOL],
          temperature: 0.1,
          max_tokens: maxTokens,
        })
    );

    const message = response.choices[0]?.message;
    if (!message) break;

    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      iterationsSinceLastToolCall = 0; // Reset counter when agent tries tool
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === "send_email") {
          const args = JSON.parse(toolCall.function.arguments);

          const action = createToolAction(
            "email-agent",
            "send_email",
            args,
            0.01 // $0.01 per attempt
          );

          console.log(`  📤 Tool call: send_email (enforced by Mandate)`);

          try {
            // 🛡️ ENFORCED TOOL EXECUTION
            const result = await client.executeTool(action, () =>
              emailAPI.execute(args)
            );

            console.log(`  ✅ Email sent: ${result.messageId}`);

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });

            console.log(`\n✅ Success! Mandate protected against retry storm`);
            const cost = await client.getCost();
            console.log(`💰 Total cost: $${cost.total.toFixed(2)}`);
            console.log(`  - Cognition (LLM): $${cost.cognition.toFixed(2)}`);
            console.log(`  - Execution (Tools): $${cost.execution.toFixed(2)}`);
            console.log(`📊 Total attempts: ${emailAttempts}`);
            console.log(`🛡️  Rate limit prevented infinite retries\n`);
            return;
          } catch (error: any) {
            if (error.name === "MandateBlockedError") {
              console.log(`\n🛑 MANDATE BLOCKED: ${error.reason}`);
              const finalCost = await client.getCost();
              console.log(`💰 Final cost: $${finalCost.total.toFixed(2)}`);
              console.log(
                `  - Cognition (LLM): $${finalCost.cognition.toFixed(2)}`
              );
              console.log(
                `  - Execution (Tools): $${finalCost.execution.toFixed(2)}`
              );
              console.log(`📊 Attempts made: ${emailAttempts}`);
              console.log(`\n✅ Rate limit prevented retry storm\n`);

              // Show audit trail
              const entries = client.getAuditEntries();
              console.log("📝 Audit Trail:");
              entries.forEach((entry, i) => {
                const action =
                  entry.action === "llm_call" ? "🧠 LLM" : "📤 Tool";
                const name = entry.tool || entry.model || "N/A";
                console.log(
                  `  [${i + 1}] ${action} ${entry.decision}: ${name} - ${
                    entry.reason
                  }`
                );
              });
              console.log();
              return;
            }

            console.log(`  ❌ Failed: ${error.message}`);

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: error.message }),
            });
          }
        }
      }
    } else if (message.content) {
      console.log(`  Agent: ${message.content}`);
      iterationsSinceLastToolCall++;
      // Don't break - let the mandate rate limit block it mechanically
      // Continue loop so agent can try again and hit the rate limit
    } else {
      iterationsSinceLastToolCall++;
      // If no tool_calls and no content, continue loop (LLM might be thinking)
    }
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔄 RETRY STORM PROTECTION - Real LLM Agent Demo");
  console.log("=".repeat(70));
  console.log("\nScenario: Agent calls unreliable API that fails with 503");
  console.log("Without Mandate: Agent retries indefinitely");
  console.log("With Mandate: Rate limit stops the loop\n");
  console.log("Model: qwen2.5:3b (Ollama)");
  console.log("=".repeat(70));

  await withoutMandate();
  await withMandate();

  console.log("\n" + "=".repeat(70));
  console.log("🎯 Key Takeaways");
  console.log("=".repeat(70));
  console.log("✅ Real LLM agent exhibits actual retry behavior");
  console.log("✅ Rate limiting is MECHANICAL, not prompt-based");
  console.log("✅ Attempt-based charging prevents cost manipulation");
  console.log("✅ Audit trail shows every decision");
  console.log("=".repeat(70) + "\n");
}

main().catch(console.error);
