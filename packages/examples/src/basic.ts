/**
 * Basic example: Defining a mandate and enforcing a tool call
 * 
 * This demonstrates the core workflow:
 * 1. Define a mandate with tool policies
 * 2. Create an agent context
 * 3. Enforce tool calls at the boundary
 */

import { Mandate, enforceToolCall, type AgentContext } from '@mandate/sdk';

// Define a mandate that allows only safe file operations
const mandate = new Mandate(
  'file-safety',
  'File Safety Mandate',
  {
    allowedTools: ['read_file', 'list_directory'],
    blockedTools: ['delete_file', 'write_file'],
    maxToolCalls: 100,
  }
);

// Create an agent context
const context: AgentContext = {
  agentId: 'example-agent',
  sessionId: 'session-1',
  startedAt: Date.now(),
  toolCallCount: 0,
};

// Attempt a tool call
const result = enforceToolCall(mandate, 'read_file', context);

if (result.allowed) {
  console.log('✅ Tool call allowed');
  console.log('Updated context:', result.context);
} else {
  console.log('❌ Tool call blocked:', result.reason);
}

