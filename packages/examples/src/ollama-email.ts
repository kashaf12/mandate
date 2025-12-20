/**
 * Ollama Email Agent Example
 *
 * This demonstrates:
 * 1. Using local Ollama for LLM inference
 * 2. Creating an agent that can send emails
 * 3. Enforcing Mandate SDK at the tool boundary
 * 4. Simulating tool call blocking
 *
 * Prerequisites:
 * - Ollama installed and running (http://localhost:11434)
 * - A model pulled (e.g., `ollama pull llama3.2`)
 */

import { Mandate, enforceToolCall, type AgentContext } from "@mandate/sdk";

/**
 * Simulated email sending tool
 * In a real scenario, this would actually send emails via SMTP
 */
async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; messageId?: string }> {
  // Simulate email sending
  console.log(`📧 [SIMULATED] Sending email:`);
  console.log(`   To: ${to}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   Body: ${body.substring(0, 100)}...`);

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  return {
    success: true,
    messageId: `msg_${Date.now()}`,
  };
}

/**
 * Call Ollama API for LLM inference
 * Falls back to simulation mode if Ollama is not available
 */
async function callOllama(
  model: string,
  messages: Array<{ role: string; content: string }>,
  tools?: Array<{ name: string; description: string; parameters: any }>
): Promise<{
  content?: string;
  toolCalls?: Array<{ name: string; arguments: any }>;
}> {
  try {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        tools: tools
          ? tools.map((t) => ({
              type: "function",
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            }))
          : undefined,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      message?: { content?: string };
    };

    // Parse response - Ollama returns messages in a specific format
    if (data.message?.content) {
      return { content: data.message.content };
    }

    return { content: "" };
  } catch (error) {
    // Fallback to simulation mode if Ollama is not available
    console.log("⚠️  Ollama not available, running in simulation mode");
    return { content: "I'll send that email for you." };
  }
}

/**
 * Define available tools for the agent
 */
const tools = [
  {
    name: "send_email",
    description: "Send an email to a recipient with a subject and body",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body content" },
      },
      required: ["to", "subject", "body"],
    },
  },
];

/**
 * Main agent execution function
 */
async function runEmailAgent() {
  console.log("🤖 Starting Email Agent with Ollama + Mandate\n");

  // Define a mandate that restricts email sending
  const mandate = new Mandate("email-safety", "Email Safety Mandate", {
    allowedTools: ["send_email"], // Only allow email sending
    blockedTools: ["delete_file", "execute_command"], // Block dangerous tools
    maxToolCalls: 2, // Limit to 2 emails per session
    maxToolCallsPerMinute: 1, // Rate limit: 1 email per minute
  });

  // Create agent context
  let context: AgentContext = {
    agentId: "email-agent-1",
    sessionId: `session-${Date.now()}`,
    startedAt: Date.now(),
    toolCallCount: 0,
  };

  // System prompt for the agent
  const systemPrompt = `You are a helpful email assistant. 
You can send emails using the send_email tool.
When the user asks you to send an email, use the send_email tool with the appropriate parameters.`;

  const model = "llama3.2"; // Change this to your installed model

  // Simulate user request
  const userRequest =
    "Send an email to alice@example.com with subject 'Meeting Reminder' and body 'Don't forget about our meeting tomorrow at 2pm.'";

  console.log(`👤 User: ${userRequest}\n`);

  try {
    // Call Ollama to get agent's response
    console.log("🧠 Agent thinking (calling Ollama)...");
    // In simulation mode, we don't use the response (we manually create tool calls)
    // In production, you would parse tool calls from the LLM response
    await callOllama(
      model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userRequest },
      ],
      tools
    );

    // In a real implementation, Ollama would return tool calls
    // For simulation, we'll manually create tool calls based on the request
    console.log("✅ LLM response received\n");

    // Simulate tool call extraction (in real scenario, parse from LLM response)
    const toolCall = {
      name: "send_email",
      arguments: {
        to: "alice@example.com",
        subject: "Meeting Reminder",
        body: "Don't forget about our meeting tomorrow at 2pm.",
      },
    };

    console.log(`🔧 Agent attempting tool call: ${toolCall.name}`);
    console.log(`   Arguments:`, toolCall.arguments);

    // ENFORCE MANDATE AT TOOL BOUNDARY
    const enforcementResult = enforceToolCall(mandate, toolCall.name, context);

    context = enforcementResult.context;

    if (!enforcementResult.allowed) {
      console.log(`\n🚫 MANDATE VIOLATION: ${enforcementResult.reason}`);
      console.log(`   Tool call count: ${context.toolCallCount}`);
      return;
    }

    console.log(`\n✅ Tool call ALLOWED by mandate`);

    // Execute the tool
    const result = await sendEmail(
      toolCall.arguments.to,
      toolCall.arguments.subject,
      toolCall.arguments.body
    );

    console.log(`\n✅ Email sent successfully: ${result.messageId}`);

    // Try to send another email (should be blocked by rate limit)
    console.log("\n" + "=".repeat(60));
    console.log("🔄 Attempting second email (should be rate-limited)...\n");

    const toolCall2 = {
      name: "send_email",
      arguments: {
        to: "bob@example.com",
        subject: "Follow-up",
        body: "Just checking in.",
      },
    };

    const enforcementResult2 = enforceToolCall(
      mandate,
      toolCall2.name,
      context
    );

    context = enforcementResult2.context;

    if (!enforcementResult2.allowed) {
      console.log(`🚫 MANDATE VIOLATION: ${enforcementResult2.reason}`);
      console.log(`   Tool call count: ${context.toolCallCount}`);
    }

    // Try to send a third email (should be blocked by maxToolCalls limit)
    console.log("\n" + "=".repeat(60));
    console.log("🔄 Attempting third email (should exceed maxToolCalls)...\n");

    const toolCall3 = {
      name: "send_email",
      arguments: {
        to: "charlie@example.com",
        subject: "Third email",
        body: "This should be blocked.",
      },
    };

    const enforcementResult3 = enforceToolCall(
      mandate,
      toolCall3.name,
      context
    );

    context = enforcementResult3.context;

    if (!enforcementResult3.allowed) {
      console.log(`🚫 MANDATE VIOLATION: ${enforcementResult3.reason}`);
      console.log(`   Tool call count: ${context.toolCallCount}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 Final Session Summary:");
    console.log(`   Agent ID: ${context.agentId}`);
    console.log(`   Session ID: ${context.sessionId}`);
    console.log(`   Total tool calls attempted: ${context.toolCallCount}`);
    console.log(`   Mandate: ${mandate.name}`);
  } catch (error) {
    console.error("\n❌ Error:", error);
  }
}

// Run the agent
runEmailAgent().catch(console.error);
