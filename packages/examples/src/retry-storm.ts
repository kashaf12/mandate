/**
 * Example: Retry Storm Protection
 *
 * Problem:
 * - Agent hits a transient error (503, timeout, etc.)
 * - Retry logic enters infinite loop
 * - One bug → 5,000 retries → $300 bill
 *
 * Solution:
 * - Mandate enforces rate limits
 * - After N attempts in time window → BLOCK
 * - Cost is capped
 * - Agent is stopped
 */

import {
  MandateClient,
  createToolAction,
  MandateTemplates,
  CommonSchemas,
} from "@mandate/sdk";

// Simulated email API with transient failures
let attemptCount = 0;

const unreliableEmailAPI = {
  async send(_args: { to: string; subject: string }) {
    attemptCount++;
    console.log(`[EMAIL API] Attempt #${attemptCount}`);

    // Simulate transient errors (first 13 attempts fail)
    if (attemptCount < 14) {
      throw new Error("503 Service Unavailable - Retry later");
    }

    return {
      status: "sent",
      messageId: `msg-${Date.now()}`,
    };
  },
};

// WITHOUT Mandate - infinite retry loop (danger!)
async function withoutMandate() {
  console.log("\n" + "=".repeat(60));
  console.log("❌ WITHOUT MANDATE - Infinite Retry Loop");
  console.log("=".repeat(60) + "\n");

  attemptCount = 0;
  let retries = 0;
  const maxRetries = 100; // Arbitrary limit

  while (retries < maxRetries) {
    try {
      await unreliableEmailAPI.send({
        to: "user@example.com",
        subject: "Test",
      });
      console.log(`\n✅ Success after ${attemptCount} attempts\n`);
      break;
    } catch (error: any) {
      retries++;
      console.log(`[RETRY #${retries}] ${error.message}`);

      if (retries >= maxRetries) {
        console.log(`\n❌ Gave up after ${maxRetries} retries`);
        console.log(`💸 Cost: ~$${(maxRetries * 0.01).toFixed(2)}`);
        console.log(`⚠️  No mechanical limit - just arbitrary maxRetries\n`);
      }
    }
  }
}

// WITH Mandate - rate limit enforced
async function withMandate() {
  console.log("\n" + "=".repeat(60));
  console.log("✅ WITH MANDATE - Rate Limit Enforced");
  console.log("=".repeat(60) + "\n");

  attemptCount = 0;

  // Phase 2: Using MandateTemplates with argument validation
  const mandate = MandateTemplates.production("user@example.com", {
    description: "Retry-protected email agent",
    // Key enforcement: rate limit
    toolPolicies: {
      send_email: {
        rateLimit: {
          maxCalls: 5, // Max 5 attempts
          windowMs: 60_000, // Per minute
        },
        chargingPolicy: {
          type: "ATTEMPT_BASED", // Charge even on failure
        },
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

  let retries = 0;

  while (true) {
    const action = createToolAction(
      "email-agent",
      "send_email",
      { to: "user@example.com", subject: "Test" },
      0.01 // $0.01 per attempt
    );

    try {
      await client.executeTool(action, () =>
        unreliableEmailAPI.send((action as any).args!)
      );

      console.log(`\n✅ Success after ${attemptCount} attempts`);
      console.log(`💰 Total cost: $${client.getCost().total.toFixed(2)}`);
      console.log(`🛡️  Mandate prevented runaway retries\n`);
      break;
    } catch (error: any) {
      retries++;

      if (error.name === "MandateBlockedError") {
        console.log(`\n🛑 BLOCKED: ${error.reason}`);
        console.log(`💰 Total cost: $${client.getCost().total.toFixed(2)}`);
        console.log(`📊 Attempts: ${client.getCallCount()}`);
        console.log(`\n✅ Rate limit prevented further damage\n`);

        // Show audit trail
        const entries = client.getAuditEntries();
        console.log("📝 Audit Trail:");
        entries.forEach((entry, i) => {
          console.log(`  [${i + 1}] ${entry.decision}: ${entry.reason}`);
        });
        console.log();
        break;
      }

      console.log(`[RETRY #${retries}] Execution failed, trying again...`);
    }
  }
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🔄 RETRY STORM PROTECTION DEMO");
  console.log("=".repeat(60));
  console.log("\nProblem: Agent hits transient error and retries infinitely");
  console.log("Solution: Mandate enforces rate limits mechanically\n");

  await withoutMandate();
  await withMandate();

  console.log("=".repeat(60));
  console.log("Key Takeaway:");
  console.log("=".repeat(60));
  console.log("✅ Mandate enforces MECHANICAL limits (rate, cost, scope)");
  console.log("✅ Not business outcomes (delivery, user behavior)");
  console.log("✅ Fail-closed, deterministic, explainable");
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);
