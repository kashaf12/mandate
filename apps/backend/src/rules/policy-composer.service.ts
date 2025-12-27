import { Injectable } from '@nestjs/common';
import * as schema from '../database/schema';
import { ToolPolicyDto } from 'src/policies/dto/create-policy.dto';

interface RateLimit {
  maxCalls: number;
  windowMs: number;
}

interface Authority {
  maxCostTotal?: number;
  maxCostPerCall?: number;
  rateLimit?: RateLimit;
  allowedTools?: string[];
  deniedTools?: string[];
  toolPolicies?: Record<string, any>;
  executionLimits?: {
    maxSteps?: number;
    maxToolCalls?: number;
    maxTokensPerCall?: number;
    maxExecutionTime?: number;
  };
  modelConfig?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    allowedModels?: string[];
  };
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
      // Single policy - apply deny-always-wins rule
      const authority = policies[0].authority as Authority;
      const effective: Authority = { ...authority };

      // Apply deny-always-wins rule
      if (effective.deniedTools && effective.allowedTools) {
        effective.allowedTools = effective.allowedTools.filter(
          (tool) => !this.matchesAny(tool, effective.deniedTools),
        );
      }

      return effective;
    }

    // Multiple policies - compose
    const effective: Authority = {};

    const authorities = policies.map((p) => p.authority as Authority);

    // 1. Budgets: MIN (most restrictive)
    effective.maxCostTotal = this.min(authorities.map((a) => a.maxCostTotal));
    effective.maxCostPerCall = this.min(
      authorities.map((a) => a.maxCostPerCall),
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

    // 6. Execution limits: MIN (most restrictive)
    const executionLimits = authorities
      .map((a) => a.executionLimits)
      .filter((e) => e !== undefined);

    if (executionLimits.length > 0) {
      effective.executionLimits = {
        maxSteps: this.min(executionLimits.map((e) => e.maxSteps)),
        maxToolCalls: this.min(executionLimits.map((e) => e.maxToolCalls)),
        maxTokensPerCall: this.min(
          executionLimits.map((e) => e.maxTokensPerCall),
        ),
        maxExecutionTime: this.min(
          executionLimits.map((e) => e.maxExecutionTime),
        ),
      };
    }

    // 7. Model config: MIN for numeric, INTERSECTION for arrays
    const modelConfigs = authorities
      .map((a) => a.modelConfig)
      .filter((m) => m !== undefined);

    if (modelConfigs.length > 0) {
      const allowedModelsArrays = modelConfigs
        .map((m) => m.allowedModels)
        .filter((m) => m !== undefined && m.length > 0);

      effective.modelConfig = {
        temperature: this.min(modelConfigs.map((m) => m.temperature)),
        maxTokens: this.min(modelConfigs.map((m) => m.maxTokens)),
        topP: this.min(modelConfigs.map((m) => m.topP)),
        presencePenalty: this.min(modelConfigs.map((m) => m.presencePenalty)),
        frequencyPenalty: this.min(modelConfigs.map((m) => m.frequencyPenalty)),
        allowedModels:
          allowedModelsArrays.length > 0
            ? this.intersection(...allowedModelsArrays)
            : undefined,
      };
    }

    // 8. Apply deny-always-wins rule
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

  private composeToolPolicies(authorities: Authority[]): Record<string, any> {
    const composed: Record<string, any> = {};

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
        .map((auth) => auth.toolPolicies?.[toolName] as ToolPolicyDto)
        .filter((tp) => tp !== undefined);

      if (toolPolicies.length === 0) return;

      // MIN estimatedCost
      const costs = toolPolicies
        .map((tp) => tp.estimatedCost)
        .filter((c) => c !== undefined);
      const estimatedCost = costs.length > 0 ? Math.min(...costs) : undefined;

      // MIN timeout
      const timeouts = toolPolicies
        .map((tp) => tp.timeout)
        .filter((t) => t !== undefined);
      const timeout = timeouts.length > 0 ? Math.min(...timeouts) : undefined;

      // MIN maxRetries
      const retries = toolPolicies
        .map((tp) => tp.maxRetries)
        .filter((r) => r !== undefined);
      const maxRetries = retries.length > 0 ? Math.min(...retries) : undefined;

      // MIN rateLimit (if present)
      const rateLimits = toolPolicies
        .map((tp) => tp.rateLimit)
        .filter((r) => r !== undefined);
      const rateLimit =
        rateLimits.length > 0
          ? {
              maxCalls: Math.min(...rateLimits.map((r) => r.maxCalls)),
              windowMs: Math.min(...rateLimits.map((r) => r.windowMs)),
            }
          : undefined;

      composed[toolName] = {
        estimatedCost,
        timeout,
        maxRetries,
        ...(rateLimit && { rateLimit }),
      };
    });

    return composed;
  }

  private matchesAny(tool: string, patterns: string[]): boolean {
    return patterns.some((pattern) => this.matchesPattern(tool, pattern));
  }

  private validateGlobPattern(pattern: string): void {
    if (pattern.length > 100) {
      throw new Error(`Glob pattern too long: ${pattern}`);
    }

    if (!/^[a-zA-Z0-9*_.-]+$/.test(pattern)) {
      throw new Error(
        `Invalid glob pattern: ${pattern}. Only alphanumeric, *, _, -, . allowed.`,
      );
    }
  }

  private matchesPattern(tool: string, pattern: string): boolean {
    this.validateGlobPattern(pattern);

    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp('^' + escaped + '$');
    return regex.test(tool);
  }
}
