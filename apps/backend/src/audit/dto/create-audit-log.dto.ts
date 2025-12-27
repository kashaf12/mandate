import {
  IsString,
  IsOptional,
  IsObject,
  IsNumber,
  IsDateString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAuditLogDto {
  @ApiProperty({
    description: 'Agent identifier',
    example: 'agent-abc123',
  })
  @IsString()
  @Length(1, 64)
  agentId: string;

  @ApiProperty({
    description: 'Unique action identifier (for idempotency)',
    example: 'act-xyz789',
  })
  @IsString()
  @Length(1, 64)
  actionId: string;

  @ApiProperty({
    description: 'When the action occurred',
    example: '2025-12-27T15:00:00Z',
  })
  @IsDateString()
  timestamp: string;

  @ApiProperty({
    description: 'Type of action',
    example: 'mandate_issued',
    enum: ['mandate_issued', 'tool_call', 'llm_call', 'agent_killed'],
  })
  @IsString()
  actionType: string;

  @ApiPropertyOptional({
    description: 'Tool name (if action_type is tool_call)',
    example: 'web_search',
  })
  @IsOptional()
  @IsString()
  toolName?: string;

  @ApiProperty({
    description: 'Enforcement decision',
    example: 'ALLOW',
    enum: ['ALLOW', 'BLOCK'],
  })
  @IsString()
  decision: string;

  @ApiPropertyOptional({
    description: 'Human-readable reason for decision',
    example: 'Within budget and allowed by policy',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Estimated cost (if applicable)',
    example: 0.05,
  })
  @IsOptional()
  @IsNumber()
  estimatedCost?: number;

  @ApiPropertyOptional({
    description: 'Actual cost (if known)',
    example: 0.048,
  })
  @IsOptional()
  @IsNumber()
  actualCost?: number;

  @ApiPropertyOptional({
    description: 'Cumulative cost for agent',
    example: 2.35,
  })
  @IsOptional()
  @IsNumber()
  cumulativeCost?: number;

  @ApiPropertyOptional({
    description: 'Context used for policy evaluation',
    example: { user_tier: 'free', environment: 'production' },
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Matched rules (rule_id + version)',
    example: [{ rule_id: 'rule-free-tier', rule_version: 3 }],
  })
  @IsOptional()
  @IsObject()
  matchedRules?: Array<{ rule_id: string; rule_version: number }>;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { mandate_id: 'mnd-xyz', request_id: 'req-123' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
