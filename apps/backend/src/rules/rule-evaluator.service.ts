import { Injectable } from '@nestjs/common';
import { RulesService } from './rules.service';
import { PoliciesService } from '../policies/policies.service';
import { AgentsService } from '../agents/agents.service';
import * as schema from '../database/schema';

interface Condition {
  field: string;
  operator: string;
  value: string;
}

@Injectable()
export class RuleEvaluatorService {
  constructor(
    private rulesService: RulesService,
    private policiesService: PoliciesService,
    private agentsService: AgentsService,
  ) {}

  /**
   * Evaluate context against all active rules.
   * Returns matching policies.
   */
  async evaluateContext(
    agentId: string,
    context: Record<string, string>,
  ): Promise<schema.Policy[]> {
    // 1. Validate agent exists and is active
    const agent = await this.agentsService.findOne(agentId);
    if (agent.status !== 'active') {
      throw new Error(`Agent ${agentId} is not active`);
    }

    // 2. Get all active rules
    const rules = await this.rulesService.findAllActive();

    // 3. Filter by agent scope
    const applicableRules = await this.filterByAgentScope(rules, agentId);

    // 4. Filter by context matching
    const matchedRules = applicableRules.filter((rule) =>
      this.matchesRule(rule, context),
    );

    // 5. Fetch policies (skip inactive)
    const policies = await this.fetchPolicies(
      matchedRules.map((r) => r.policyId),
    );

    return policies;
  }

  /**
   * Filter rules by agent scope.
   * Universal rules (no agentIds) apply to all agents.
   * Scoped rules only apply if agentId is in the list.
   */
  private async filterByAgentScope(
    rules: schema.Rule[],
    agentId: string,
  ): Promise<schema.Rule[]> {
    const applicable: schema.Rule[] = [];

    for (const rule of rules) {
      // Universal rule (no agent scope)
      const agentIds = rule.agentIds;
      if (!agentIds || agentIds.length === 0) {
        applicable.push(rule);
        continue;
      }

      // Agent-scoped rule - check if all agents are active
      const allAgentsActive = await this.validateAgentsActive(agentIds);
      if (!allAgentsActive) {
        // Skip rule with inactive agents
        continue;
      }

      // Check if current agent is in scope
      if (agentIds.includes(agentId)) {
        applicable.push(rule);
      }
    }

    return applicable;
  }

  /**
   * Validate all agents in list are active.
   */
  private async validateAgentsActive(agentIds: string[]): Promise<boolean> {
    try {
      const agents = await this.agentsService.findByIds(agentIds);

      // Check all requested agents were found
      if (agents.length !== agentIds.length) {
        return false;
      }

      // Check all are active
      return agents.every((agent) => agent.status === 'active');
    } catch {
      return false;
    }
  }

  /**
   * Check if a rule matches the context.
   * Supports AND/OR logic via matchMode.
   */
  private matchesRule(
    rule: schema.Rule,
    context: Record<string, string>,
  ): boolean {
    const conditions = rule.conditions as Condition[];
    const matchMode = rule.matchMode || 'AND';

    if (matchMode === 'AND') {
      // All conditions must match
      return conditions.every((condition) =>
        this.evaluateCondition(condition, context),
      );
    } else {
      // At least one condition must match
      return conditions.some((condition) =>
        this.evaluateCondition(condition, context),
      );
    }
  }

  /**
   * Evaluate a single condition against context.
   */
  private evaluateCondition(
    condition: Condition,
    context: Record<string, string>,
  ): boolean {
    const contextValue = context[condition.field];

    // Fail-closed: missing field = false
    if (contextValue === undefined) {
      return false;
    }

    switch (condition.operator) {
      case '==':
        return contextValue === condition.value;

      case '!=':
        return contextValue !== condition.value;

      case 'in':
        return (
          Array.isArray(condition.value) &&
          condition.value.includes(contextValue)
        );

      case 'contains':
        return String(contextValue).includes(String(condition.value));

      case '>':
        return Number(contextValue) > Number(condition.value);

      case '<':
        return Number(contextValue) < Number(condition.value);

      case '>=':
        return Number(contextValue) >= Number(condition.value);

      case '<=':
        return Number(contextValue) <= Number(condition.value);

      default:
        // Fail-closed: unknown operator = false
        return false;
    }
  }

  /**
   * Fetch policies by IDs, skipping inactive ones.
   */
  private async fetchPolicies(policyIds: string[]): Promise<schema.Policy[]> {
    const policies = await Promise.all(
      policyIds.map(async (id) => {
        try {
          const policy = await this.policiesService.findOne(id);

          // Skip inactive policies
          if (!policy.active) {
            return null;
          }

          return policy;
        } catch {
          // Policy doesn't exist - skip it
          return null;
        }
      }),
    );

    // Filter out null (invalid policies)
    return policies.filter((p): p is schema.Policy => p !== null);
  }
}
