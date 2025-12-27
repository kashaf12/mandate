import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { eq, and, gt } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import { generateMandateId } from '../common/utils/crypto.utils';
import { extractErrorInfo } from '../common/utils/error.utils';
import { AgentsService } from '../agents/agents.service';
import { RuleEvaluatorService } from '../rules/rule-evaluator.service';
import { PolicyComposerService } from '../rules/policy-composer.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MandatesService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    private agentsService: AgentsService,
    private ruleEvaluator: RuleEvaluatorService,
    private policyComposer: PolicyComposerService,
    private auditService: AuditService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  /**
   * Issue a new mandate for an agent with given context.
   * Validates agent, evaluates rules, composes policies, and stores mandate.
   */
  async issue(
    agentId: string,
    context: Record<string, string>,
  ): Promise<schema.Mandate> {
    try {
      const sanitizedContext = this.sanitizeContext(context);

      const agent = await this.agentsService.findOne(agentId);
      if (agent.status !== 'active') {
        throw new ForbiddenException(
          `Agent ${agentId} is inactive. Cannot issue mandate.`,
        );
      }

      const isKilled = await this.agentsService.isKilled(agentId);
      if (isKilled) {
        throw new BadRequestException(
          'Agent is killed - mandate issuance blocked',
        );
      }

      const { policies, matchedRules } =
        await this.ruleEvaluator.evaluateContext(agentId, sanitizedContext);

      const effectiveAuthority = this.policyComposer.compose(policies);

      const mandateId = generateMandateId();

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

      const [mandate] = await this.db
        .insert(schema.mandates)
        .values({
          mandateId,
          agentId,
          context: sanitizedContext,
          authority: effectiveAuthority as Record<string, any>,
          matchedRules: matchedRules.map((rule) => ({
            ruleId: rule.ruleId,
            ruleVersion: rule.version,
          })),
          appliedPolicies: policies.map((policy) => ({
            policyId: policy.policyId,
            policyVersion: policy.version,
          })),
          expiresAt,
        })
        .returning();

      await this.auditService.logMandateIssuance(
        agentId,
        mandateId,
        sanitizedContext,
        matchedRules.map((rule) => ({
          rule_id: rule.ruleId,
          rule_version: rule.version,
        })),
      );

      return mandate;
    } catch (error) {
      const { message, stack } = extractErrorInfo(error);
      this.logger.error('Failed to issue mandate', {
        error: message,
        stack,
        agentId,
        contextKeys: Object.keys(context),
      });
      throw error;
    }
  }

  private sanitizeContext(
    context: Record<string, string>,
  ): Record<string, string> {
    const sanitized: Record<string, string> = {};

    if (!context || typeof context !== 'object') {
      throw new BadRequestException('Context must be an object');
    }

    for (const [key, value] of Object.entries(context)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        throw new BadRequestException(
          `Invalid context key: ${key}. Keys must be alphanumeric with underscores or hyphens.`,
        );
      }

      if (typeof value !== 'string') {
        throw new BadRequestException(
          `Context value for key ${key} must be a string`,
        );
      }

      if (value.length > 1000) {
        throw new BadRequestException(
          `Context value for key ${key} exceeds maximum length of 1000 characters`,
        );
      }

      if (/[<>'";\\]/.test(value)) {
        throw new BadRequestException(
          `Context value for key ${key} contains invalid characters`,
        );
      }

      sanitized[key] = value;
    }

    return sanitized;
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

    const mandates = await this.db
      .select()
      .from(schema.mandates)
      .where(
        and(
          eq(schema.mandates.agentId, agentId),
          gt(schema.mandates.expiresAt, now),
        ),
      );

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
