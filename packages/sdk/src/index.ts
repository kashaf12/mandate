/**
 * @mandate/sdk - Core runtime for agent execution governance
 *
 * This SDK enforces agent mandates at runtime, primarily at the tool boundary.
 * No prompts-as-guardrails. No networking. No SaaS dependencies.
 */

// Re-export types from types.ts (excluding Mandate interface to avoid conflict with Mandate class)
export type {
  Action,
  AgentState,
  Decision,
  BlockCode,
  ToolCall,
  LLMCall,
} from "./types";

// Note: Mandate interface is not exported here to avoid conflict with Mandate class
// Users of PolicyEngine should import: import type { Mandate } from "@mandate/sdk/types"

// Re-export PolicyEngine from policy.ts
export { PolicyEngine } from "./policy";

/**
 * Represents the context of an agent execution.
 * Contains metadata about the agent, its session, and execution state.
 */
// export interface AgentContext {
//   /** Unique identifier for the agent instance */
//   agentId: string;
//   /** Current session identifier */
//   sessionId: string;
//   /** Timestamp of agent creation/start */
//   startedAt: number;
//   /** Count of tool calls made in this session */
//   toolCallCount: number;
//   /** Metadata about the agent (name, version, etc.) */
//   metadata?: Record<string, unknown>;
// }

// /**
//  * Defines a policy for tool usage.
//  * Specifies which tools are allowed, rate limits, and other constraints.
//  */
// export interface ToolPolicy {
//   /** List of allowed tool names (empty array = all allowed) */
//   allowedTools?: string[];
//   /** List of blocked tool names */
//   blockedTools?: string[];
//   /** Maximum number of tool calls per session */
//   maxToolCalls?: number;
//   /** Maximum number of tool calls per minute */
//   maxToolCallsPerMinute?: number;
//   /** Additional custom constraints */
//   constraints?: Record<string, unknown>;
// }

// /**
//  * Represents a mandate that governs agent behavior (legacy API).
//  * Mandates apply to agents, not tools.
//  * @deprecated Use the Mandate interface from types.ts with PolicyEngine instead
//  */
// export class Mandate {
//   constructor(
//     public readonly id: string,
//     public readonly name: string,
//     public readonly toolPolicy: ToolPolicy
//   ) {}

//   /**
//    * Validates if a tool call is allowed under this mandate.
//    * @param toolName - Name of the tool being called
//    * @param context - Current agent context
//    * @returns true if allowed, false if blocked
//    */
//   isToolAllowed(toolName: string, _context: AgentContext): boolean {
//     // TODO: Implement tool allow/block list checking with context awareness
//     if (this.toolPolicy.blockedTools?.includes(toolName)) {
//       return false;
//     }
//     if (
//       this.toolPolicy.allowedTools &&
//       this.toolPolicy.allowedTools.length > 0
//     ) {
//       return this.toolPolicy.allowedTools.includes(toolName);
//     }
//     return true;
//   }

//   /**
//    * Validates rate limits and other constraints.
//    * @param context - Current agent context
//    * @returns true if within limits, false if exceeded
//    */
//   validateConstraints(context: AgentContext): boolean {
//     // TODO: Implement rate limiting and constraint validation
//     if (
//       this.toolPolicy.maxToolCalls &&
//       context.toolCallCount >= this.toolPolicy.maxToolCalls
//     ) {
//       return false;
//     }
//     return true;
//   }
// }

// /**
//  * Result of enforcing a tool call mandate.
//  */
// export interface EnforcementResult {
//   /** Whether the tool call is allowed */
//   allowed: boolean;
//   /** Reason for denial (if not allowed) */
//   reason?: string;
//   /** Updated context after enforcement */
//   context: AgentContext;
// }

// /**
//  * Enforces a mandate at the tool boundary (legacy API).
//  * This is the primary entry point for runtime governance.
//  * @deprecated Use PolicyEngine with Mandate interface instead
//  *
//  * @param mandate - The mandate to enforce
//  * @param toolName - Name of the tool being called
//  * @param context - Current agent context
//  * @returns Enforcement result with updated context
//  */
// export function enforceToolCall(
//   mandate: Mandate,
//   toolName: string,
//   context: AgentContext
// ): EnforcementResult {
//   // TODO: Implement full enforcement logic including:
//   // - Tool allow/block list checking
//   // - Rate limiting
//   // - Constraint validation
//   // - Context updates (increment counters, etc.)

//   const updatedContext: AgentContext = {
//     ...context,
//     toolCallCount: context.toolCallCount + 1,
//   };

//   if (!mandate.isToolAllowed(toolName, updatedContext)) {
//     return {
//       allowed: false,
//       reason: `Tool "${toolName}" is blocked by mandate "${mandate.name}"`,
//       context: updatedContext,
//     };
//   }

//   if (!mandate.validateConstraints(updatedContext)) {
//     return {
//       allowed: false,
//       reason: `Tool call limit exceeded for mandate "${mandate.name}"`,
//       context: updatedContext,
//     };
//   }

//   return {
//     allowed: true,
//     context: updatedContext,
//   };
// }
