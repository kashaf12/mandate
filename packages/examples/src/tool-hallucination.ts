/**
 * Example: Tool Hallucination Protection
 *
 * Real failure mode:
 * - LLM hallucinates tools that don't exist
 * - Agent tries to call "delete_database" or "execute_shell"
 * - Without enforcement, code would crash or do dangerous things
 *
 * With Mandate:
 * - Only allowed tools can execute
 * - Hallucinated tools blocked immediately
 * - Fail-closed (unknown = denied)
 */

import OpenAI from "openai";
import { MandateClient, createToolAction, type Mandate } from "@mandate/sdk";

// Safe tools
const AVAILABLE_TOOLS = {
  read_file: {
    definition: {
      type: "function" as const,
      function: {
        name: "read_file",
        description: "Read contents of a file",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
      },
    },
    execute: async (args: { path: string }) => {
      return { content: `Contents of ${args.path}` };
    },
  },

  search_web: {
    definition: {
      type: "function" as const,
      function: {
        name: "search_web",
        description: "Search the web",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
    },
    execute: async (args: { query: string }) => {
      return { results: [`Result for: ${args.query}`] };
    },
  },

  // DANGEROUS - but we'll tell LLM it exists
  delete_database: {
    definition: {
      type: "function" as const,
      function: {
        name: "delete_database",
        description: "Delete entire database (DANGEROUS)",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        },
      },
    },
    execute: async (args: { name: string }) => {
      console.log(`\n💀 DANGER: Would have deleted database '${args.name}'\n`);
      return { deleted: true };
    },
  },
};

async function withoutMandate() {
  console.log("\n" + "=".repeat(70));
  console.log("❌ WITHOUT MANDATE - Dangerous Tools Can Execute");
  console.log("=".repeat(70) + "\n");

  const openai = new OpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "user",
      content:
        "First read the file config.json, then delete the 'test' database to clean up.",
    },
  ];

  const response = await openai.chat.completions.create({
    model: "qwen2.5:3b",
    messages,
    tools: Object.values(AVAILABLE_TOOLS).map((t) => t.definition),
    temperature: 0.1,
  });

  const message = response.choices[0]?.message;
  if (message?.tool_calls) {
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name as keyof typeof AVAILABLE_TOOLS;
      const args = JSON.parse(toolCall.function.arguments);

      console.log(`\n[AGENT] Calling tool: ${toolName}`);
      console.log(`  Args:`, args);

      if (AVAILABLE_TOOLS[toolName]) {
        await AVAILABLE_TOOLS[toolName].execute(args);
        console.log(`  ✅ Executed (no protection!)`);
      }
    }
  }

  console.log(`\n⚠️  Agent could call ANY tool - including dangerous ones\n`);
}

async function withMandate() {
  console.log("\n" + "=".repeat(70));
  console.log("✅ WITH MANDATE - Only Safe Tools Allowed");
  console.log("=".repeat(70) + "\n");

  const mandate: Mandate = {
    version: 1,
    id: "mandate-safe-tools",
    agentId: "safe-agent",
    issuedAt: Date.now(),

    maxCostTotal: 1.0,

    // CRITICAL: Only allow safe read operations
    allowedTools: ["read_*", "search_*"],
    deniedTools: ["delete_*", "execute_*", "drop_*"],
  };

  const client = new MandateClient({ mandate, auditLogger: "memory" });

  const openai = new OpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "user",
      content:
        "First read the file config.json, then delete the 'test' database to clean up.",
    },
  ];

  // 🛡️ ENFORCE LLM CALL
  const response = await client.executeLLMWithBudget(
    "ollama",
    "qwen2.5:3b",
    messages,
    (maxTokens) =>
      openai.chat.completions.create({
        model: "qwen2.5:3b",
        messages,
        tools: Object.values(AVAILABLE_TOOLS).map((t) => t.definition),
        temperature: 0.1,
        max_tokens: maxTokens,
      })
  );

  const message = response.choices[0]?.message;
  if (message?.tool_calls) {
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name as keyof typeof AVAILABLE_TOOLS;
      const args = JSON.parse(toolCall.function.arguments);

      console.log(`\n[AGENT] Attempting tool: ${toolName}`);
      console.log(`  Args:`, args);

      const action = createToolAction("safe-agent", toolName, args, 0.01);

      try {
        // 🛡️ ENFORCED EXECUTION
        if (AVAILABLE_TOOLS[toolName]) {
          // Properly await and forward the tool's actual return value,
          // but discard it here since the client handles result shape.
          await client.executeTool(action, async () => {
            return await AVAILABLE_TOOLS[toolName].execute(args);
          });
          console.log(`  ✅ ALLOWED - Tool executed`);
        }
      } catch (error: any) {
        if (error.name === "MandateBlockedError") {
          console.log(`  🛑 BLOCKED: ${error.reason}`);
          console.log(`  🛡️  Mandate prevented dangerous operation`);
        }
      }
    }
  }

  console.log(`\n✅ Mandate enforced both LLM and tool calls\n`);
  console.log(`💰 Total cost: $${client.getCost().total.toFixed(2)}`);

  // Show audit trail
  const entries = client.getAuditEntries();
  console.log("📝 Audit Trail:");
  entries.forEach((entry, i) => {
    const action = entry.action === "llm_call" ? "🧠 LLM" : "📤 Tool";
    const name = entry.tool || entry.model || "N/A";
    console.log(
      `  [${i + 1}] ${action} ${entry.decision}: ${name} - ${entry.reason}`
    );
  });
  console.log();
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🚨 TOOL HALLUCINATION PROTECTION - Real LLM Agent Demo");
  console.log("=".repeat(70));
  console.log(
    "\nScenario: LLM tries to call dangerous tools (delete_database)"
  );
  console.log("Without Mandate: Tools execute unchecked");
  console.log("With Mandate: Dangerous tools blocked mechanically\n");
  console.log("Model: qwen2.5:3b (Ollama)");
  console.log("=".repeat(70));

  await withoutMandate();
  await withMandate();

  console.log("\n" + "=".repeat(70));
  console.log("🎯 Key Takeaways");
  console.log("=".repeat(70));
  console.log("✅ LLMs WILL try to call tools you didn't intend");
  console.log("✅ Allowlist/denylist is MECHANICAL enforcement");
  console.log("✅ Fail-closed: unknown tool = blocked");
  console.log("✅ Glob patterns (*) for flexible policies");
  console.log("=".repeat(70) + "\n");
}

main().catch(console.error);
