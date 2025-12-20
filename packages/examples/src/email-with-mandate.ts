// Agent with real Mandate SDK (PolicyEngine + StateManager)
import OpenAI from "openai";
import { PolicyEngine } from "@mandate/sdk";
import { StateManager } from "@mandate/sdk";
import type { Mandate, Action, ToolCall } from "@mandate/sdk/types";

// The broken tool (same as baseline)
const sendEmail = {
  name: "send_email",
  description: "Send an email to a recipient",
  execute: async (args: { to: string; subject: string; body: string }) => {
    console.log(`[TOOL] send_email called with:`, args);
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

// Real Mandate SDK configuration
const mandate: Mandate = {
  version: 1,
  id: "mandate-email-1",
  agentId: "email-agent",
  issuedAt: Date.now(),
  issuer: { type: "human", id: "kashaf@mandate.dev" },
  scope: { environment: "dev", service: "email-demo" },
  allowedTools: ["send_email"],
  maxCostTotal: 1.0,
  maxCostPerCall: 0.1,
  toolPolicies: {
    send_email: {
      maxCostPerCall: 0.05,
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

// Real SDK components
const policyEngine = new PolicyEngine();
const stateManager = new StateManager();

// Get agent state (StateManager handles initialization)
const agentState = stateManager.get(mandate.agentId, mandate.id);

async function executeWithMandate(
  action: Action,
  toolFn: (args: any) => Promise<any>
): Promise<any> {
  console.log(`\n[MANDATE] Evaluating action: ${action.id}`);

  // Phase 1: Authorize (PolicyEngine pre-execution check)
  const decision = policyEngine.evaluate(action, mandate, agentState);

  if (decision.type === "BLOCK") {
    console.log(`[MANDATE] ❌ BLOCKED: ${decision.reason}`);
    throw new Error(
      `MANDATE_VIOLATION: ${decision.reason} (code: ${decision.code})`
    );
  }

  console.log(`[MANDATE] ✅ ALLOWED: ${decision.reason}`);
  if (decision.type === "ALLOW" && decision.remainingCost !== undefined) {
    console.log(
      `[MANDATE] 💰 Remaining budget: $${decision.remainingCost.toFixed(2)}`
    );
  }

  // Phase 2: Execute (tool is called, cost is incurred)
  const result = await toolFn((action as ToolCall).args);

  // Phase 3: Post-execution verification (before commit)
  const toolPolicy =
    mandate.toolPolicies?.[action.type === "tool_call" ? action.tool : ""];

  if (toolPolicy?.verifyResult) {
    const verification = toolPolicy.verifyResult({ action, result, mandate });

    if (!verification.ok) {
      console.log(`[MANDATE] ❌ VERIFICATION FAILED: ${verification.reason}`);
      // Don't commit state - verification failed
      throw new Error(`MANDATE_VERIFICATION_FAILED: ${verification.reason}`);
    }

    console.log(`[MANDATE] ✅ VERIFICATION PASSED`);
  }

  // Phase 4: Commit state (StateManager handles all mutations)
  // This ONLY happens if execution succeeded AND verification passed
  stateManager.commitSuccess(
    action,
    agentState,
    undefined, // No actual cost available in this demo
    mandate.rateLimit,
    mandate.toolPolicies?.[action.type === "tool_call" ? action.tool : ""]
      ?.rateLimit
  );

  console.log(`[STATE] ✅ State committed`);

  return result;
}

async function runEmailAgentWithMandate(task: string) {
  const client = new OpenAI({
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "user", content: task },
  ];

  console.log(`\n${"=".repeat(70)}`);
  console.log(`📧 EMAIL AGENT WITH MANDATE SDK (PolicyEngine + StateManager)`);
  console.log(`${"=".repeat(70)}`);
  console.log(`Task: ${task}`);
  console.log(`Mandate: ${mandate.id}`);
  console.log(`Authority: ${mandate.issuer?.type} (${mandate.issuer?.id})`);
  console.log(
    `Scope: ${mandate.scope?.environment} / ${mandate.scope?.service}`
  );
  console.log(
    `Budget: $${mandate.maxCostTotal} total, $${mandate.maxCostPerCall} per call`
  );
  console.log(`${"=".repeat(70)}\n`);

  const model = "functiongemma";
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

          console.log(`[AGENT] 📤 Calling tool: send_email`);
          console.log(`[AGENT] Args:`, toolArgs);

          const action: Action = {
            type: "tool_call",
            id: `action-${Date.now()}-${Math.random()
              .toString(36)
              .substring(7)}`,
            agentId: mandate.agentId,
            timestamp: Date.now(),
            tool: "send_email",
            args: toolArgs,
            estimatedCost: 0.01,
            costType: "EXECUTION",
          };

          try {
            const result = await executeWithMandate(action, sendEmail.execute);
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
      console.log(`\n[AGENT] 💬 Final response: ${message.content}\n`);
      break;
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`📊 FINAL STATE (via StateManager)`);
  console.log(`${"=".repeat(70)}`);
  console.log(`Cumulative cost: $${agentState.cumulativeCost.toFixed(2)}`);
  console.log(`  - Cognition: $${agentState.cognitionCost.toFixed(2)}`);
  console.log(`  - Execution: $${agentState.executionCost.toFixed(2)}`);
  console.log(`Total calls: ${agentState.callCount}`);
  console.log(`Actions executed: ${agentState.seenActionIds.size}`);
  console.log(`Idempotency keys: ${agentState.seenIdempotencyKeys.size}`);
  console.log(
    `Tool call counts:`,
    Object.keys(agentState.toolCallCounts).length > 0
      ? agentState.toolCallCounts
      : "None"
  );
  console.log(`Agent killed: ${agentState.killed}`);
  console.log(`${"=".repeat(70)}\n`);
}

const task =
  'Send an email to user@example.com with subject "Invoice" and body "Payment due"';

runEmailAgentWithMandate(task).catch((error) => {
  console.error("[FATAL ERROR]", error);
  process.exit(1);
});
