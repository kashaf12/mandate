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
  agent_id: string;

  @ApiProperty({
    description: 'Context used for policy matching',
    example: { user_tier: 'free', environment: 'production' },
  })
  context: Record<string, string>;

  @ApiProperty({
    description: 'Matched rules (rule_id + version references)',
    example: [
      { rule_id: 'rule-free-tier', rule_version: 3 },
      { rule_id: 'rule-prod-safety', rule_version: 1 },
    ],
  })
  matched_rules: Array<{ rule_id: string; rule_version: number }>;

  @ApiProperty({
    description: 'Applied policies (policy_id + version references)',
    example: [
      { policy_id: 'policy-free-tier', policy_version: 5 },
      { policy_id: 'policy-prod-guardrails', policy_version: 2 },
    ],
  })
  applied_policies: Array<{ policy_id: string; policy_version: number }>;

  @ApiProperty({
    description: 'Mandate issuance timestamp',
    example: '2025-12-27T15:00:00Z',
  })
  issued_at: Date;

  static fromEntity(mandate: schema.Mandate): MandateDetailDto {
    const matchedRules =
      (mandate.matchedRules as Array<{
        rule_id: string;
        rule_version: number;
      }>) || [];
    const appliedPolicies =
      (mandate.appliedPolicies as Array<{
        policy_id: string;
        policy_version: number;
      }>) || [];

    return {
      mandate_id: mandate.mandateId,
      agent_id: mandate.agentId,
      context: mandate.context,
      matched_rules: matchedRules,
      applied_policies: appliedPolicies,
      effective_authority: mandate.authority,
      issued_at: mandate.issuedAt ?? new Date(),
      expires_at: mandate.expiresAt,
    };
  }
}
