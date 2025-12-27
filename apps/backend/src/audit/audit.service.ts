import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { eq, and, gte, lte, desc, SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { extractErrorInfo } from '../common/utils/error.utils';

@Injectable()
export class AuditService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  /**
   * Create single audit log entry
   */
  async create(dto: CreateAuditLogDto): Promise<schema.AuditLog> {
    try {
      const [log] = await this.db
        .insert(schema.auditLogs)
        .values({
          agentId: dto.agentId,
          actionId: dto.actionId,
          timestamp: new Date(dto.timestamp),
          actionType: dto.actionType,
          toolName: dto.toolName,
          decision: dto.decision,
          reason: dto.reason,
          estimatedCost: dto.estimatedCost?.toString(),
          actualCost: dto.actualCost?.toString(),
          cumulativeCost: dto.cumulativeCost?.toString(),
          context: dto.context,
          matchedRules: dto.matchedRules,
          metadata: dto.metadata,
        })
        .returning();

      return log;
    } catch (error) {
      const { message, stack } = extractErrorInfo(error);
      this.logger.error('Failed to create audit log', {
        error: message,
        stack,
        agentId: dto.agentId,
        actionType: dto.actionType,
      });
      throw error;
    }
  }

  /**
   * Bulk insert audit logs (for SDK batch reporting)
   */
  async bulkCreate(dtos: CreateAuditLogDto[]): Promise<number> {
    if (dtos.length === 0) return 0;

    const values = dtos.map((dto) => ({
      agentId: dto.agentId,
      actionId: dto.actionId,
      timestamp: new Date(dto.timestamp),
      actionType: dto.actionType,
      toolName: dto.toolName,
      decision: dto.decision,
      reason: dto.reason,
      estimatedCost: dto.estimatedCost?.toString(),
      actualCost: dto.actualCost?.toString(),
      cumulativeCost: dto.cumulativeCost?.toString(),
      context: dto.context,
      matchedRules: dto.matchedRules,
      metadata: dto.metadata,
    }));

    const result = await this.db
      .insert(schema.auditLogs)
      .values(values)
      .returning();

    return result.length;
  }

  /**
   * Query audit logs with filters
   */
  async query(queryDto: QueryAuditLogDto): Promise<schema.AuditLog[]> {
    const conditions: SQL[] = [];

    // Filter by agent_id
    if (queryDto.agentId) {
      conditions.push(eq(schema.auditLogs.agentId, queryDto.agentId));
    }

    // Filter by decision
    if (queryDto.decision) {
      conditions.push(eq(schema.auditLogs.decision, queryDto.decision));
    }

    // Filter by action_type
    if (queryDto.actionType) {
      conditions.push(eq(schema.auditLogs.actionType, queryDto.actionType));
    }

    // Filter by timestamp range
    if (queryDto.from) {
      conditions.push(gte(schema.auditLogs.timestamp, new Date(queryDto.from)));
    }
    if (queryDto.to) {
      conditions.push(lte(schema.auditLogs.timestamp, new Date(queryDto.to)));
    }

    // Build query
    const limit = queryDto.limit || 100;
    const offset = queryDto.offset || 0;

    if (conditions.length > 0) {
      return await this.db
        .select()
        .from(schema.auditLogs)
        .where(and(...conditions))
        .orderBy(desc(schema.auditLogs.timestamp))
        .limit(limit)
        .offset(offset);
    }

    return await this.db
      .select()
      .from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Log mandate issuance (called from MandatesService)
   */
  async logMandateIssuance(
    agentId: string,
    mandateId: string,
    context: Record<string, string>,
    matchedRules: Array<{ rule_id: string; rule_version: number }>,
  ): Promise<void> {
    await this.create({
      agentId,
      actionId: mandateId,
      timestamp: new Date().toISOString(),
      actionType: 'mandate_issued',
      decision: 'ALLOW',
      reason: 'Mandate issued successfully',
      context,
      matchedRules,
      metadata: { mandate_id: mandateId },
    });
  }

  /**
   * Log kill switch activation (called from AgentsService)
   */
  async logKillSwitch(
    agentId: string,
    reason: string,
    killedBy: string,
  ): Promise<void> {
    await this.create({
      agentId,
      actionId: `kill-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'agent_killed',
      decision: 'BLOCK',
      reason,
      metadata: { killed_by: killedBy },
    });
  }
}
