/**
 * Blocking example: Demonstrating unsafe execution prevention
 *
 * This shows how mandates block unsafe tool calls,
 * preventing runaway agents from executing dangerous operations.
 */

import { Mandate, enforceToolCall, type AgentContext } from "@mandate/sdk";

// Define a strict mandate that blocks dangerous operations
const mandate = new Mandate("strict-safety", "Strict Safety Mandate", {
  allowedTools: ["read_file"],
  blockedTools: [
    "delete_file",
    "execute_command",
    "send_email",
    "transfer_funds",
  ],
  maxToolCalls: 50,
});

const context: AgentContext = {
  agentId: "untrusted-agent",
  sessionId: "session-1",
  startedAt: Date.now(),
  toolCallCount: 0,
};

// Simulate a sequence of tool calls
const toolCalls = [
  { name: "read_file", args: { path: "/tmp/data.txt" } },
  { name: "delete_file", args: { path: "/tmp/data.txt" } }, // Should be blocked
  { name: "execute_command", args: { command: "rm -rf /" } }, // Should be blocked
  { name: "read_file", args: { path: "/tmp/other.txt" } },
];

let currentContext = context;

for (const toolCall of toolCalls) {
  const result = enforceToolCall(mandate, toolCall.name, currentContext);
  currentContext = result.context;

  if (result.allowed) {
    console.log(`✅ Allowed: ${toolCall.name}`, toolCall.args);
  } else {
    console.log(`🚫 Blocked: ${toolCall.name} - ${result.reason}`);
  }
}

console.log(`\nFinal tool call count: ${currentContext.toolCallCount}`);
