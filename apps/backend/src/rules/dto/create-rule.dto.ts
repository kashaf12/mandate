import {
  IsString,
  IsArray,
  ValidateNested,
  IsOptional,
  Length,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ComparisonOperator {
  EQUALS = '==',
  NOT_EQUALS = '!=',
  IN = 'in',
  CONTAINS = 'contains',
  GREATER_THAN = '>',
  LESS_THAN = '<',
  GREATER_THAN_OR_EQUAL = '>=',
  LESS_THAN_OR_EQUAL = '<=',
}

class ConditionDto {
  @ApiProperty({
    description: 'Context field to check (e.g., "user_tier", "environment")',
    example: 'user_tier',
  })
  @IsString()
  field: string;

  @ApiProperty({
    description: 'Comparison operator: ==, !=, in, contains, >, <, >=, <=',
    example: ComparisonOperator.EQUALS,
    enum: ComparisonOperator,
  })
  @IsEnum(ComparisonOperator)
  operator: ComparisonOperator;

  @ApiProperty({
    description: 'Expected value (can be string, number, or array)',
    example: 'free',
  })
  value: string;
}

export class CreateRuleDto {
  @ApiProperty({
    description: 'Display name for the rule',
    example: 'Free Tier Users',
  })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the rule',
    example: 'Apply free tier policy to free users',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Optional: Scope rule to specific agents. Leave empty for universal rule.',
    example: ['agent-abc123', 'agent-xyz789'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agentIds?: string[];

  @ApiPropertyOptional({
    description: 'Match mode: AND (all conditions) or OR (any condition)',
    enum: ['AND', 'OR'],
    example: 'AND',
  })
  @IsOptional()
  @IsEnum(['AND', 'OR'])
  matchMode?: 'AND' | 'OR';

  @ApiProperty({
    description: 'Array of conditions (all must match for AND, any for OR)',
    type: [ConditionDto],
    example: [
      { field: 'user_tier', operator: '==', value: 'free' },
      { field: 'environment', operator: '==', value: 'production' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions: ConditionDto[];

  @ApiProperty({
    description: 'Policy ID to apply when rule matches',
    example: 'policy-free-tier-v1',
  })
  @IsString()
  policyId: string;
}
