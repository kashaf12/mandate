import {
  MandateClient,
  createToolAction,
  MandateTemplates,
  ValidationPatterns,
  CommonSchemas,
  type Mandate,
} from "@mandate/sdk";

/**
 * Phase 2 Example: Argument Validation
 *
 * Demonstrates:
 * - Agent identity
 * - Argument validation (Zod schemas + custom patterns)
 * - Mandate templates
 */

// Simulated tools
async function readFile(path: string): Promise<string> {
  console.log(`  [TOOL] readFile('${path}')`);
  return `Contents of ${path}`;
}

async function executeQuery(sql: string): Promise<any[]> {
  console.log(`  [TOOL] executeQuery('${sql}')`);
  return [{ id: 1, name: "Alice" }];
}

async function sendEmail(to: string, subject: string): Promise<void> {
  console.log(`  [TOOL] sendEmail(to: '${to}', subject: '${subject}')`);
}

async function main() {
  console.log("🔒 PHASE 2: ARGUMENT VALIDATION\n");

  // Create mandate with argument validation
  const mandate: Mandate = {
    ...MandateTemplates.production("user@example.com", {
      description: "Data analysis agent",
      allowedTools: ["read_*", "search_*", "send_*", "execute_query"],
      deniedTools: ["delete_*", "drop_*", "alter_*"], // ADD THIS LINE - removes execute_* from deny
    }),

    toolPolicies: {
      read_file: {
        argumentValidation: {
          schema: CommonSchemas.filePath, // Zod schema
          validate: ValidationPatterns.noSystemPaths, // Custom validation
        },
      },

      execute_query: {
        argumentValidation: {
          schema: CommonSchemas.sqlQuery,
          validate: ValidationPatterns.readOnlySql,
        },
      },

      send_email: {
        argumentValidation: {
          schema: CommonSchemas.email,
          validate: ValidationPatterns.internalEmailOnly("company.com"),
        },
      },
    },
  };

  const client = new MandateClient({ mandate, auditLogger: "console" });

  console.log("Agent Identity:");
  console.log(`  ID: ${mandate.identity?.agentId}`);
  console.log(`  Principal: ${mandate.identity?.principal}`);
  console.log(`  Description: ${mandate.identity?.description}\n`);

  // Example 1: Valid file read
  console.log("Example 1: Read data file (ALLOWED)");
  try {
    const action = createToolAction(mandate.agentId, "read_file", {
      path: "/data/report.txt",
    });
    await client.executeTool(action, () => readFile("/data/report.txt"));
    console.log("  ✅ Success\n");
  } catch (err: any) {
    console.log(`  ❌ Blocked: ${err.message}\n`);
  }

  // Example 2: System file read (BLOCKED)
  console.log("Example 2: Read system file (BLOCKED)");
  try {
    const action = createToolAction(mandate.agentId, "read_file", {
      path: "/etc/passwd",
    });
    await client.executeTool(action, () => readFile("/etc/passwd"));
    console.log("  ✅ Success\n");
  } catch (err: any) {
    console.log(`  ❌ Blocked: ${err.message}\n`);
  }

  // Example 3: SELECT query (ALLOWED)
  console.log("Example 3: Read-only SQL (ALLOWED)");
  try {
    const action = createToolAction(mandate.agentId, "execute_query", {
      sql: "SELECT * FROM users LIMIT 10",
    });
    await client.executeTool(action, () =>
      executeQuery("SELECT * FROM users LIMIT 10")
    );
    console.log("  ✅ Success\n");
  } catch (err: any) {
    console.log(`  ❌ Blocked: ${err.message}\n`);
  }

  // Example 4: DELETE query (BLOCKED)
  console.log("Example 4: Write SQL (BLOCKED)");
  try {
    const action = createToolAction(mandate.agentId, "execute_query", {
      sql: "DELETE FROM users WHERE id = 1",
    });
    await client.executeTool(action, () =>
      executeQuery("DELETE FROM users WHERE id = 1")
    );
    console.log("  ✅ Success\n");
  } catch (err: any) {
    console.log(`  ❌ Blocked: ${err.message}\n`);
  }

  // Example 5: Internal email (ALLOWED)
  console.log("Example 5: Internal email (ALLOWED)");
  try {
    const action = createToolAction(mandate.agentId, "send_email", {
      to: "alice@company.com",
      subject: "Report ready",
    });
    await client.executeTool(action, () =>
      sendEmail("alice@company.com", "Report ready")
    );
    console.log("  ✅ Success\n");
  } catch (err: any) {
    console.log(`  ❌ Blocked: ${err.message}\n`);
  }

  // Example 6: External email (BLOCKED)
  console.log("Example 6: External email (BLOCKED)");
  try {
    const action = createToolAction(mandate.agentId, "send_email", {
      to: "alice@external.com",
      subject: "Report ready",
    });
    await client.executeTool(action, () =>
      sendEmail("alice@external.com", "Report ready")
    );
    console.log("  ✅ Success\n");
  } catch (err: any) {
    console.log(`  ❌ Blocked: ${err.message}\n`);
  }

  console.log("📊 SUMMARY");
  console.log(`Total calls: ${client.getCallCount()}`);
  const cost = client.getCost();
  console.log(`Total cost: $${cost.total.toFixed(4)}`);
  console.log("\n✅ Phase 2 demonstration complete!");
}

main().catch(console.error);
