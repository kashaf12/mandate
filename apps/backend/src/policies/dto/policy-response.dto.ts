import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Policy } from '../../database/schemas/policies';

export class PolicyResponseDto {
  @ApiProperty({
    description: 'Unique policy identifier (same across versions)',
    example: 'policy-abc123xyz789',
  })
  policyId: string;

  @ApiProperty({
    description: 'Version number of this policy',
    example: 1,
  })
  version: number;

  @ApiProperty({
    description: 'Display name for the policy',
    example: 'Free Tier Policy',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the policy',
    example: 'Limited access for free users',
  })
  description?: string;

  @ApiProperty({
    description:
      'Authority configuration (cost limits, rate limits, tool permissions)',
    example: {
      maxCostTotal: 1.0,
      maxCostPerCall: 0.1,
      rateLimit: { maxCalls: 100, windowMs: 3600000 },
      allowedTools: ['web_search'],
      deniedTools: ['delete_*', 'execute_*'],
    },
  })
  authority: Record<string, any>;

  @ApiProperty({
    description: 'Whether this policy version is active',
    example: true,
  })
  active: boolean;

  @ApiProperty({
    description: 'Timestamp when the policy was created',
    example: '2024-12-27T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiPropertyOptional({
    description: 'Email of the user who created this policy',
    example: 'admin@example.com',
  })
  createdBy?: string;

  static fromEntity(policy: Policy): PolicyResponseDto {
    return {
      policyId: policy.policyId,
      version: policy.version,
      name: policy.name,
      description: policy.description ?? undefined,
      authority: policy.authority,
      active: policy.active ?? true,
      createdAt: policy.createdAt ?? new Date(),
      createdBy: policy.createdBy ?? undefined,
    };
  }
}
