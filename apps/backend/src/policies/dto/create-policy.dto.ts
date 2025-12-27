import {
  IsString,
  IsOptional,
  IsObject,
  ValidateNested,
  IsEmail,
  Length,
  IsNumber,
  IsBoolean,
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

class ToolPolicyDto {
  @ApiProperty({
    description: 'Whether this tool is allowed',
    example: true,
  })
  @IsBoolean()
  allowed: boolean;

  @ApiProperty({
    description: 'Cost per call for this tool',
    example: 0.05,
  })
  @IsNumber()
  cost: number;

  @ApiPropertyOptional({
    description: 'Rate limit specific to this tool',
    type: RateLimitDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RateLimitDto)
  rateLimit?: RateLimitDto;
}

class AuthorityDto {
  @ApiPropertyOptional({
    description: 'Maximum total cumulative cost',
    example: 1.0,
  })
  @IsOptional()
  @IsNumber()
  maxCostTotal?: number;

  @ApiPropertyOptional({
    description: 'Maximum cost per single action',
    example: 0.1,
  })
  @IsOptional()
  @IsNumber()
  maxCostPerCall?: number;

  @ApiPropertyOptional({
    description: 'Maximum LLM inference cost',
    example: 0.5,
  })
  @IsOptional()
  @IsNumber()
  maxCognitionCost?: number;

  @ApiPropertyOptional({
    description: 'Maximum tool execution cost',
    example: 0.3,
  })
  @IsOptional()
  @IsNumber()
  maxExecutionCost?: number;

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
    description: 'Tool-specific policies',
    example: {
      web_search: {
        allowed: true,
        cost: 0.05,
        rateLimit: { maxCalls: 10, windowMs: 3600000 },
      },
    },
  })
  @IsOptional()
  @IsObject()
  toolPolicies?: Record<string, ToolPolicyDto>;
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
          allowed: true,
          cost: 0.05,
          rateLimit: { maxCalls: 10, windowMs: 3600000 },
        },
      },
    },
  })
  @ValidateNested()
  @Type(() => AuthorityDto)
  authority: AuthorityDto;
}
