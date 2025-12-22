/**
 * Example: Tool Permission Enforcement
 *
 * Problem:
 * - Agent tries to call unapproved tools
 * - Security risk (delete files, execute commands)
 * - No mechanical enforcement
 *
 * Solution:
 * - Mandate allowlist/denylist
 * - Unauthorized tools blocked immediately
 * - Fail-closed (unknown = denied)
 */

import {
  MandateClient,
  createToolAction,
  MandateTemplates,
} from "@mandate/sdk";

// Simulated tools
const tools = {
  read_file: async (_args: any) => ({ data: "file contents" }),
  search_web: async (_args: any) => ({ results: ["result1", "result2"] }),
  delete_file: async (_args: any) => ({ deleted: true }),
  execute_shell: async (_args: any) => ({ output: "command executed" }),
};

async function demonstrateAllowlist() {
  console.log("\n" + "=".repeat(60));
  console.log("✅ ALLOWLIST ENFORCEMENT");
  console.log("=".repeat(60) + "\n");

  // Phase 2: Using MandateTemplates.restricted
  const mandate = MandateTemplates.restricted("user@example.com", {
    description: "Safe read-only agent",
    // Only allow read operations
    allowedTools: ["read_*", "search_*"],
  });

  const client = new MandateClient({ mandate });

  // Try allowed tool
  console.log("Trying read_file (allowed)...");
  try {
    const action = createToolAction("safe-agent", "read_file", {});
    await client.executeTool(action, () => tools.read_file({}));
    console.log("  ✅ ALLOWED\n");
  } catch (error: any) {
    console.log(`  ❌ BLOCKED: ${error.message}\n`);
  }

  // Try disallowed tool
  console.log("Trying delete_file (not in allowlist)...");
  try {
    const action = createToolAction("safe-agent", "delete_file", {});
    await client.executeTool(action, () => tools.delete_file({}));
    console.log("  ✅ ALLOWED\n");
  } catch (error: any) {
    console.log(`  ❌ BLOCKED: ${error.message}\n`);
  }
}

async function demonstrateDenylist() {
  console.log("\n" + "=".repeat(60));
  console.log("🚫 DENYLIST ENFORCEMENT (takes precedence)");
  console.log("=".repeat(60) + "\n");

  // Phase 2: Using MandateTemplates with denylist
  const mandate = MandateTemplates.production("user@example.com", {
    description: "Restricted agent with denylist",
    allowedTools: ["*"], // Allow everything...
    deniedTools: ["delete_*", "execute_*"], // ...except these
  });

  const client = new MandateClient({ mandate });

  // Try allowed tool
  console.log("Trying read_file (allowed)...");
  try {
    const action = createToolAction("restricted-agent", "read_file", {});
    await client.executeTool(action, () => tools.read_file({}));
    console.log("  ✅ ALLOWED\n");
  } catch (error: any) {
    console.log(`  ❌ BLOCKED: ${error.message}\n`);
  }

  // Try denied tool
  console.log("Trying execute_shell (explicitly denied)...");
  try {
    const action = createToolAction("restricted-agent", "execute_shell", {});
    await client.executeTool(action, () => tools.execute_shell({}));
    console.log("  ✅ ALLOWED\n");
  } catch (error: any) {
    console.log(`  ❌ BLOCKED: ${error.message}\n`);
  }
}

async function demonstrateFailClosed() {
  console.log("\n" + "=".repeat(60));
  console.log("🔒 FAIL-CLOSED (unknown = denied)");
  console.log("=".repeat(60) + "\n");

  // Phase 2: Using MandateTemplates.restricted
  const mandate = MandateTemplates.restricted("user@example.com", {
    description: "Cautious agent (fail-closed)",
    allowedTools: ["read_file"], // Only this one
  });

  const client = new MandateClient({ mandate });

  console.log("Trying unknown_tool (not in allowlist)...");
  try {
    const action = createToolAction("cautious-agent", "unknown_tool", {});
    await client.executeTool(action, async () => ({ result: "success" }));
    console.log("  ✅ ALLOWED\n");
  } catch (error: any) {
    console.log(`  ❌ BLOCKED: ${error.message}`);
    console.log(`  Reason: Fail-closed - if not explicitly allowed, denied\n`);
  }
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🔐 TOOL PERMISSION ENFORCEMENT DEMO");
  console.log("=".repeat(60));
  console.log("\nProblem: Agent calls unapproved/dangerous tools");
  console.log("Solution: Mandate enforces allowlist/denylist mechanically\n");

  await demonstrateAllowlist();
  await demonstrateDenylist();
  await demonstrateFailClosed();

  console.log("=".repeat(60));
  console.log("Key Takeaway:");
  console.log("=".repeat(60));
  console.log("✅ Glob patterns (*, prefix_*) supported");
  console.log("✅ Denylist takes precedence over allowlist");
  console.log("✅ Unknown = denied (fail-closed)");
  console.log("✅ Deterministic, explainable");
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);
