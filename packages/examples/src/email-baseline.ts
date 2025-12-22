/**
 * Baseline: Agent Without Authority Enforcement
 *
 * This example shows what happens WITHOUT Mandate SDK:
 * - No tool permission checks
 * - No rate limiting
 * - No cost limits
 * - No argument validation
 * - No audit trail
 *
 * This is the baseline for comparison with authority-enforced examples.
 */

import OpenAI from "openai";

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
      // deliveryConfirmed is missing - this is the bug
    };
  },
};

// OpenAI function definition for the tool
const SEND_EMAIL_TOOL = {
  type: "function" as const,
  function: {
    name: "send_email",
    description: "Send an email to a recipient",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Email address of the recipient" },
        subject: { type: "string", description: "Subject line of the email" },
        body: { type: "string", description: "Body content of the email" },
      },
      required: ["to", "subject", "body"],
    },
  },
};

// The agent (uses qwen2.5:3b via Ollama)
async function runEmailAgent(task: string) {
  const client = new OpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "user", content: task },
  ];

  console.log(`[AGENT] Task: ${task}\n`);

  const model = "qwen2.5:3b";
  let iteration = 0;
  const maxIterations = 10;

  while (iteration < maxIterations) {
    iteration++;

    const response = await client.chat.completions.create({
      model,
      messages,
      tools: [SEND_EMAIL_TOOL],
      tool_choice: "auto",
    });

    const message = response.choices[0]?.message;
    if (!message) {
      console.log("[AGENT] No message in response");
      break;
    }

    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log(
        `[AGENT] Tool calls requested: ${message.tool_calls.length}\n`
      );

      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") continue;

        if (toolCall.function.name === "send_email") {
          let toolArgs: { to: string; subject: string; body: string };
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            toolArgs = { to: "", subject: "", body: "" };
          }

          console.log(`[AGENT] Calling tool: send_email`);
          console.log(`[AGENT] With args:`, toolArgs);

          const result = await sendEmail.execute(toolArgs);

          console.log(`[TOOL] Result:`, result);
          const resultAny = result as any;
          console.log(
            `[TOOL] Status: ${result.status} (deliveryConfirmed: ${
              resultAny.deliveryConfirmed || "undefined"
            })\n`
          );

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      }
    } else {
      const finalContent = message.content;
      console.log(`[AGENT] Final response: ${finalContent}\n`);
      break;
    }
  }

  if (iteration >= maxIterations) {
    console.log("[AGENT] Max iterations reached\n");
  }
}

// Run it
const task =
  'Send an email to user@example.com with subject "Invoice" and body "Payment due"';

runEmailAgent(task).catch((error) => {
  console.error("[ERROR]", error);
  throw error;
});
