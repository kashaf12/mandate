import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Rule } from '../../database/schemas/rules';

export class RuleResponseDto {
  @ApiProperty({
    description: 'Unique rule identifier',
    example: 'rule-abc123xyz789',
  })
  ruleId: string;

  @ApiProperty({
    description: 'Display name for the rule',
    example: 'Free Tier Users',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the rule',
    example: 'Apply free tier policy to free users in production',
  })
  description?: string;

  @ApiPropertyOptional({
    type: [String],
  })
  agentIds?: string[];

  @ApiProperty()
  matchMode: string;

  @ApiProperty({
    description:
      'Array of conditions. ALL must match for rule to apply (AND logic)',
    example: [
      { field: 'user_tier', operator: '==', value: 'free' },
      { field: 'environment', operator: '==', value: 'production' },
    ],
  })
  conditions: Array<{
    field: string;
    operator: string;
    value: string;
  }>;

  @ApiProperty({
    description: 'Policy ID to apply when rule matches',
    example: 'policy-free-tier-v1',
  })
  policyId: string;

  @ApiProperty({
    description: 'Whether this rule is active',
    example: true,
  })
  active: boolean;

  @ApiProperty({
    description: 'Timestamp when the rule was created',
    example: '2024-12-27T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the rule was last updated',
    example: '2024-12-27T10:30:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Version of the rule',
    example: 1,
  })
  version: number;

  static fromEntity(rule: Rule): RuleResponseDto {
    return {
      ruleId: rule.ruleId,
      name: rule.name,
      description: rule.description ?? undefined,
      agentIds: rule.agentIds ?? undefined,
      matchMode: rule.matchMode ?? 'AND',
      conditions: rule.conditions as Array<{
        field: string;
        operator: string;
        value: string;
      }>,
      policyId: rule.policyId,
      active: rule.active ?? true,
      createdAt: rule.createdAt ?? new Date(),
      updatedAt: rule.updatedAt ?? new Date(),
      version: rule.version ?? 1,
    };
  }
}
