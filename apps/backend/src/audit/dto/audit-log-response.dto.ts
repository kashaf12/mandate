import { ApiProperty } from '@nestjs/swagger';
import * as schema from '../../database/schema';

export class AuditLogResponseDto {
  @ApiProperty({ example: 'uuid-123' })
  id: string;

  @ApiProperty({ example: 'agent-abc123' })
  agent_id: string;

  @ApiProperty({ example: 'act-xyz789' })
  action_id: string;

  @ApiProperty({ example: '2025-12-27T15:00:00Z' })
  timestamp: Date;

  @ApiProperty({ example: 'mandate_issued' })
  action_type: string;

  @ApiProperty({ example: 'web_search', required: false })
  tool_name?: string;

  @ApiProperty({ example: 'ALLOW' })
  decision: string;

  @ApiProperty({ example: 'Within budget', required: false })
  reason?: string;

  @ApiProperty({ example: 0.05, required: false })
  estimated_cost?: number;

  @ApiProperty({ example: 0.048, required: false })
  actual_cost?: number;

  @ApiProperty({ example: 2.35, required: false })
  cumulative_cost?: number;

  @ApiProperty({ example: { user_tier: 'free' }, required: false })
  context?: Record<string, string>;

  @ApiProperty({
    example: [{ rule_id: 'rule-1', rule_version: 2 }],
    required: false,
  })
  matched_rules?: Array<{ rule_id: string; rule_version: number }>;

  @ApiProperty({ example: { mandate_id: 'mnd-xyz' }, required: false })
  metadata?: Record<string, string>;

  @ApiProperty({ example: '2025-12-27T15:00:01Z' })
  created_at: Date;

  static fromEntity(log: schema.AuditLog): AuditLogResponseDto {
    return {
      id: log.id,
      agent_id: log.agentId,
      action_id: log.actionId,
      timestamp: log.timestamp,
      action_type: log.actionType,
      tool_name: log.toolName,
      decision: log.decision,
      reason: log.reason,
      estimated_cost: log.estimatedCost
        ? parseFloat(log.estimatedCost)
        : undefined,
      actual_cost: log.actualCost ? parseFloat(log.actualCost) : undefined,
      cumulative_cost: log.cumulativeCost
        ? parseFloat(log.cumulativeCost)
        : undefined,
      context: log.context,
      matched_rules: log.matchedRules ?? undefined,
      metadata: log.metadata,
      created_at: log.createdAt,
    };
  }
}
