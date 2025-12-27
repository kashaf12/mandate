import { Injectable } from '@nestjs/common';
import * as schema from '../database/schema';
import { ToolPolicyDto } from '../policies/dto/create-policy.dto';

interface RateLimit {
  maxCalls: number;
  windowMs: number;
}

interface Authority {
  maxCostTotal?: number;
  maxCostPerCall?: number;
  maxCognitionCost?: number;
  maxExecutionCost?: number;
  rateLimit?: RateLimit;
  allowedTools?: string[];
  deniedTools?: string[];
  toolPolicies?: Record<string, ToolPolicyDto>;
}

@Injectable()
export class PolicyComposerService {
  /**
   * Compose multiple policies into single effective authority.
   * Rules: MIN budgets, INTERSECTION allowed, UNION denied, deny-always-wins.
   */
  compose(policies: schema.Policy[]): Authority {
    if (policies.length === 0) {
      // No policies matched - fail closed
      return {
        maxCostTotal: 0,
        maxCostPerCall: 0,
        allowedTools: [],
        deniedTools: ['*'], // Deny everything
      };
    }

    if (policies.length === 1) {
      // Single policy - return as-is
      return policies[0].authority as Authority;
    }

    // Multiple policies - compose
    const effective: Authority = {};

    const authorities = policies.map((p) => p.authority as Authority);

    // 1. Budgets: MIN (most restrictive)
    effective.maxCostTotal = this.min(authorities.map((a) => a.maxCostTotal));
    effective.maxCostPerCall = this.min(
      authorities.map((a) => a.maxCostPerCall),
    );
    effective.maxCognitionCost = this.min(
      authorities.map((a) => a.maxCognitionCost),
    );
    effective.maxExecutionCost = this.min(
      authorities.map((a) => a.maxExecutionCost),
    );

    // 2. Rate limits: MIN
    const rateLimits = authorities
      .map((a) => a.rateLimit)
      .filter((r) => r !== undefined);

    if (rateLimits.length > 0) {
      effective.rateLimit = {
        maxCalls: Math.min(...rateLimits.map((r) => r.maxCalls)),
        windowMs: Math.min(...rateLimits.map((r) => r.windowMs)),
      };
    }

    // 3. Allowed tools: INTERSECTION
    const allowedToolsArrays = authorities
      .map((a) => a.allowedTools)
      .filter((t) => t !== undefined && t.length > 0);

    if (allowedToolsArrays.length > 0) {
      effective.allowedTools = this.intersection(...allowedToolsArrays);
    }

    // 4. Denied tools: UNION
    const deniedToolsArrays = authorities
      .map((a) => a.deniedTools)
      .filter((t) => t !== undefined && t.length > 0);

    if (deniedToolsArrays.length > 0) {
      effective.deniedTools = this.union(...deniedToolsArrays);
    }

    // 5. Tool policies: compose individually
    effective.toolPolicies = this.composeToolPolicies(authorities);

    // 6. Apply deny-always-wins rule
    if (effective.deniedTools && effective.allowedTools) {
      effective.allowedTools = effective.allowedTools.filter(
        (tool) => !this.matchesAny(tool, effective.deniedTools),
      );
    }

    return effective;
  }

  private min(values: (number | undefined)[]): number | undefined {
    const defined = values.filter((v) => v !== undefined);
    return defined.length > 0 ? Math.min(...defined) : undefined;
  }

  private intersection<T>(...arrays: T[][]): T[] {
    if (arrays.length === 0) return [];
    return arrays.reduce((acc, arr) =>
      acc.filter((item) => arr.includes(item)),
    );
  }

  private union<T>(...arrays: T[][]): T[] {
    return [...new Set(arrays.flat())];
  }

  private composeToolPolicies(
    authorities: Authority[],
  ): Record<string, ToolPolicyDto> {
    const composed: Record<string, ToolPolicyDto> = {};

    // Collect all tool names
    const toolNames = new Set<string>();
    authorities.forEach((auth) => {
      if (auth.toolPolicies) {
        Object.keys(auth.toolPolicies).forEach((name) => toolNames.add(name));
      }
    });

    // Compose each tool
    toolNames.forEach((toolName) => {
      const toolPolicies = authorities
        .map((auth) => auth.toolPolicies?.[toolName])
        .filter((tp) => tp !== undefined);

      if (toolPolicies.length === 0) return;

      // All must allow
      const allowed = toolPolicies.every((tp) => tp.allowed);

      // MIN cost
      const costs = toolPolicies
        .map((tp) => tp.cost)
        .filter((c) => c !== undefined);
      const cost = costs.length > 0 ? Math.min(...costs) : undefined;

      composed[toolName] = {
        allowed,
        cost,
      };
    });

    return composed;
  }

  private matchesAny(tool: string, patterns: string[]): boolean {
    return patterns.some((pattern) => this.matchesPattern(tool, pattern));
  }

  private matchesPattern(tool: string, pattern: string): boolean {
    // Simple glob matching: "web_*" matches "web_search"
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(tool);
  }
}
