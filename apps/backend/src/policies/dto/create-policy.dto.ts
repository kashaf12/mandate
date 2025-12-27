import {
  IsString,
  IsOptional,
  IsObject,
  ValidateNested,
  IsEmail,
  Length,
  IsNumber,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class RateLimitDto {
  @ApiProperty({
    description: 'Maximum number of calls allowed in the time window',
    example: 100,
  })
  @IsNumber()
  maxCalls: number;

  @ApiProperty({
    description: 'Time window in milliseconds',
    example: 3600000,
  })
  @IsNumber()
  windowMs: number;
}

export class ToolPolicyDto {
  @ApiProperty({
    description:
      'Estimated cost per tool call (approximate, for local SDK hints only)',
    example: 0.05,
  })
  @IsNumber()
  estimatedCost: number;

  @ApiPropertyOptional({
    description: 'Maximum execution timeout in milliseconds',
    example: 30000,
  })
  @IsOptional()
  @IsNumber()
  timeout?: number;

  @ApiPropertyOptional({
    description: 'Maximum retry attempts for this tool',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  maxRetries?: number;

  @ApiPropertyOptional({
    description: 'Rate limit specific to this tool',
    type: RateLimitDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RateLimitDto)
  rateLimit?: RateLimitDto;
}

class ExecutionLimitsDto {
  @ApiPropertyOptional({
    description: 'Maximum reasoning steps per execution',
    example: 50,
  })
  @IsOptional()
  @IsNumber()
  maxSteps?: number;

  @ApiPropertyOptional({
    description: 'Maximum tool calls per execution',
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  maxToolCalls?: number;

  @ApiPropertyOptional({
    description: 'Maximum tokens per LLM call (hard ceiling)',
    example: 4000,
  })
  @IsOptional()
  @IsNumber()
  maxTokensPerCall?: number;

  @ApiPropertyOptional({
    description: 'Maximum execution time in milliseconds',
    example: 300000,
  })
  @IsOptional()
  @IsNumber()
  maxExecutionTime?: number;
}

class ModelConfigDto {
  @ApiPropertyOptional({
    description: 'LLM temperature (default if not specified by SDK)',
    example: 0.7,
  })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({
    description:
      'Default max tokens per LLM call (can be overridden up to executionLimits.maxTokensPerCall)',
    example: 2000,
  })
  @IsOptional()
  @IsNumber()
  maxTokens?: number;

  @ApiPropertyOptional({
    description: 'Nucleus sampling parameter',
    example: 0.9,
  })
  @IsOptional()
  @IsNumber()
  topP?: number;

  @ApiPropertyOptional({
    description: 'Presence penalty',
    example: 0.0,
  })
  @IsOptional()
  @IsNumber()
  presencePenalty?: number;

  @ApiPropertyOptional({
    description: 'Frequency penalty',
    example: 0.0,
  })
  @IsOptional()
  @IsNumber()
  frequencyPenalty?: number;

  @ApiPropertyOptional({
    description: 'Allowed LLM models',
    example: ['gpt-4', 'claude-3-opus'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedModels?: string[];
}

class AuthorityDto {
  @ApiPropertyOptional({
    description:
      'Maximum total cumulative cost (local SDK hint, not enforced globally in Phase 2)',
    example: 1.0,
  })
  @IsOptional()
  @IsNumber()
  maxCostTotal?: number;

  @ApiPropertyOptional({
    description: 'Maximum cost per single action (local SDK hint)',
    example: 0.1,
  })
  @IsOptional()
  @IsNumber()
  maxCostPerCall?: number;

  @ApiPropertyOptional({
    description: 'Global rate limit for all actions',
    type: RateLimitDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RateLimitDto)
  rateLimit?: RateLimitDto;

  @ApiPropertyOptional({
    description: 'Glob patterns for allowed tools (e.g., "web_*", "read_file")',
    example: ['web_search', 'read_file'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedTools?: string[];

  @ApiPropertyOptional({
    description:
      'Glob patterns for denied tools (takes precedence over allowed)',
    example: ['delete_*', 'execute_*'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deniedTools?: string[];

  @ApiPropertyOptional({
    description: 'Tool-specific policies (costs, limits, timeouts)',
    example: {
      web_search: {
        estimatedCost: 0.05,
        timeout: 30000,
        rateLimit: { maxCalls: 10, windowMs: 3600000 },
      },
    },
  })
  @IsOptional()
  @IsObject()
  toolPolicies?: Record<string, ToolPolicyDto>;

  @ApiPropertyOptional({
    description: 'Per-execution limits (enforced locally by SDK)',
    type: ExecutionLimitsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutionLimitsDto)
  executionLimits?: ExecutionLimitsDto;

  @ApiPropertyOptional({
    description: 'LLM model configuration (defaults and constraints)',
    type: ModelConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ModelConfigDto)
  modelConfig?: ModelConfigDto;
}

export class CreatePolicyDto {
  @ApiProperty({
    description: 'Display name for the policy',
    example: 'Free Tier Policy',
  })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the policy',
    example: 'Limited access for free users',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Email of the user creating this policy',
    example: 'admin@example.com',
  })
  @IsOptional()
  @IsEmail()
  createdBy?: string;

  @ApiProperty({
    description:
      'Authority configuration (cost limits, rate limits, tool permissions)',
    type: AuthorityDto,
    example: {
      maxCostTotal: 1.0,
      maxCostPerCall: 0.1,
      rateLimit: { maxCalls: 100, windowMs: 3600000 },
      allowedTools: ['web_search'],
      deniedTools: ['delete_*', 'execute_*'],
      toolPolicies: {
        web_search: {
          estimatedCost: 0.05,
          timeout: 30000,
          rateLimit: { maxCalls: 10, windowMs: 3600000 },
        },
      },
      executionLimits: { maxSteps: 50, maxToolCalls: 20 },
      modelConfig: { temperature: 0.7, maxTokens: 2000 },
    },
  })
  @ValidateNested()
  @Type(() => AuthorityDto)
  authority: AuthorityDto;
}
