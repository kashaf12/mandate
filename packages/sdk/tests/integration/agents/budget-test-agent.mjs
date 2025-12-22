// ES Module version - use .mjs extension
async function main() {
  try {
    // Use dynamic import for ES modules
    const { MandateClient, MandateTemplates, createToolAction } = await import(
      "../../../dist/index.js"
    );
    const agentId = process.env.AGENT_ID || "test-agent";
    const mandateId = process.env.MANDATE_ID || "test-mandate";

    // Use budget from env or default to 10.0
    const budget = parseFloat(process.env.MANDATE_BUDGET || "10.0");

    const mandate = MandateTemplates.production("test@example.com", {
      id: mandateId, // Explicit ID for distributed coordination
      agentId,
      maxCostTotal: budget,
      maxCostPerCall: 10.0, // Allow test costs up to $10 per call
      allowedTools: ["test_tool", "*"], // Allow test_tool and all tools
    });

    const client = new MandateClient({
      mandate,
      stateManager: {
        redis: {
          host: process.env.REDIS_HOST || "localhost",
          port: parseInt(process.env.REDIS_PORT || "6379", 10),
          keyPrefix: "test:mandate:",
        },
      },
      auditLogger: "none",
    });

    // Simulated tool
    async function simulateTool(cost) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Handle messages from parent
    process.on("message", async (msg) => {
      if (msg.action === "execute") {
        try {
          const action = createToolAction(agentId, "test_tool", {}, msg.cost);
          await client.executeTool(action, () => simulateTool(msg.cost));

          if (process.send) {
            process.send({ success: true, cost: msg.cost });
          }
        } catch (err) {
          if (process.send) {
            process.send({
              success: false,
              error: err.message,
              code: err.code,
            });
          }
        }
      } else if (msg.action === "get_cost") {
        const cost = await client.getCurrentCost();
        if (process.send) {
          process.send({ cost });
        }
      } else if (msg.action === "exit") {
        await client.close();
        process.exit(0);
      }
    });

    // Ready signal
    if (process.send) {
      process.send({ ready: true });
    }
  } catch (error) {
    console.error("Agent startup error:", error);
    if (process.send) {
      process.send({ error: error.message, stack: error.stack });
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
