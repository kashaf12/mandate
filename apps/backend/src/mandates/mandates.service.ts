import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, gt } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import { generateMandateId } from '../common/utils/crypto.utils';
import { AgentsService } from '../agents/agents.service';
import { RuleEvaluatorService } from '../rules/rule-evaluator.service';
import { PolicyComposerService } from '../rules/policy-composer.service';

@Injectable()
export class MandatesService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    private agentsService: AgentsService,
    private ruleEvaluator: RuleEvaluatorService,
    private policyComposer: PolicyComposerService,
  ) {}

  /**
   * Issue a new mandate for an agent with given context.
   * Validates agent, evaluates rules, composes policies, and stores mandate.
   */
  async issue(
    agentId: string,
    context: Record<string, string>,
  ): Promise<schema.Mandate> {
    // 1. Validate agent exists and is active
    const agent = await this.agentsService.findOne(agentId);
    if (agent.status !== 'active') {
      throw new ForbiddenException(
        `Agent ${agentId} is inactive. Cannot issue mandate.`,
      );
    }

    // 2. Evaluate rules → get matching policies
    const { policies, matchedRules } = await this.ruleEvaluator.evaluateContext(
      agentId,
      context,
    );

    // 3. Compose policies → effective authority
    const effectiveAuthority = this.policyComposer.compose(policies);

    // 4. Generate mandate ID
    const mandateId = generateMandateId();

    // 5. Calculate expiration (5 minutes)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    // 6. Store mandate with minimal references
    const [mandate] = await this.db
      .insert(schema.mandates)
      .values({
        mandateId,
        agentId,
        context,
        authority: effectiveAuthority as Record<string, any>,
        // Store minimal references: rule_id + rule_version
        matchedRules: matchedRules.map((rule) => ({
          rule_id: rule.ruleId,
          rule_version: rule.version,
        })),
        // Store policy references: policy_id + policy_version
        appliedPolicies: policies.map((policy) => ({
          policy_id: policy.policyId,
          policy_version: policy.version,
        })),
        expiresAt,
      })
      .returning();

    return mandate;
  }

  /**
   * Retrieve a mandate by ID.
   * Returns 404 if mandate doesn't exist or has expired.
   */
  async findOne(mandateId: string): Promise<schema.Mandate> {
    const [mandate] = await this.db
      .select()
      .from(schema.mandates)
      .where(eq(schema.mandates.mandateId, mandateId))
      .limit(1);

    if (!mandate) {
      throw new NotFoundException(`Mandate ${mandateId} not found`);
    }

    // Check if expired
    if (new Date() > mandate.expiresAt) {
      throw new NotFoundException(
        `Mandate ${mandateId} expired at ${mandate.expiresAt.toISOString()}`,
      );
    }

    return mandate;
  }

  /**
   * Find existing mandate for agent + context if still valid.
   * Used for caching to avoid re-evaluation.
   */
  async findByAgentAndContext(
    agentId: string,
    context: Record<string, string>,
  ): Promise<schema.Mandate | null> {
    const now = new Date();

    // Find mandates for this agent that haven't expired
    const mandates = await this.db
      .select()
      .from(schema.mandates)
      .where(
        and(
          eq(schema.mandates.agentId, agentId),
          gt(schema.mandates.expiresAt, now),
        ),
      );

    // Check if any mandate has matching context (JSON equality)
    for (const mandate of mandates) {
      const mandateContext = mandate.context;
      if (this.contextsMatch(mandateContext, context)) {
        return mandate;
      }
    }

    return null;
  }

  /**
   * Check if two context objects match (deep equality).
   */
  private contextsMatch(
    context1: Record<string, string>,
    context2: Record<string, string>,
  ): boolean {
    const keys1 = Object.keys(context1).sort();
    const keys2 = Object.keys(context2).sort();

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (const key of keys1) {
      if (context1[key] !== context2[key]) {
        return false;
      }
    }

    return true;
  }
}
