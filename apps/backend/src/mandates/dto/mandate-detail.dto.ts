import { ApiProperty } from '@nestjs/swagger';
import { MandateResponseDto } from './mandate-response.dto';
import * as schema from '../../database/schema';

/**
 * Admin/debug mandate response (full details including matched rules and policies).
 */
export class MandateDetailDto extends MandateResponseDto {
  @ApiProperty({
    description: 'Agent identifier',
    example: 'agent-abc123',
  })
  agentId: string;

  @ApiProperty({
    description: 'Context used for policy matching',
    example: { user_tier: 'free', environment: 'production' },
  })
  context: Record<string, string>;

  @ApiProperty({
    description: 'Matched rules (ruleId + version references)',
    example: [
      { ruleId: 'rule-free-tier', ruleVersion: 3 },
      { ruleId: 'rule-prod-safety', ruleVersion: 1 },
    ],
  })
  matchedRules: Array<{ ruleId: string; ruleVersion: number }>;

  @ApiProperty({
    description: 'Applied policies (policyId + version references)',
    example: [
      { policyId: 'policy-free-tier', policyVersion: 5 },
      { policyId: 'policy-prod-guardrails', policyVersion: 2 },
    ],
  })
  appliedPolicies: Array<{ policyId: string; policyVersion: number }>;

  @ApiProperty({
    description: 'Mandate issuance timestamp',
    example: '2025-12-27T15:00:00Z',
  })
  issuedAt: Date;

  static fromEntity(mandate: schema.Mandate): MandateDetailDto {
    const matchedRules =
      (mandate.matchedRules as Array<{
        ruleId: string;
        ruleVersion: number;
      }>) || [];
    const appliedPolicies =
      (mandate.appliedPolicies as Array<{
        policyId: string;
        policyVersion: number;
      }>) || [];

    return {
      mandateId: mandate.mandateId,
      agentId: mandate.agentId,
      context: mandate.context,
      matchedRules: matchedRules,
      appliedPolicies: appliedPolicies,
      effectiveAuthority: mandate.authority,
      issuedAt: mandate.issuedAt ?? new Date(),
      expiresAt: mandate.expiresAt,
    };
  }
}
