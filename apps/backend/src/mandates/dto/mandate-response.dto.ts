import { ApiProperty } from '@nestjs/swagger';
import * as schema from '../../database/schema';

/**
 * SDK-optimized mandate response (minimal fields for enforcement).
 */
export class MandateResponseDto {
  @ApiProperty({
    description: 'Unique mandate identifier',
    example: 'mnd-abc123xyz789',
  })
  mandateId: string;

  @ApiProperty({
    description: 'Composed effective authority (static enforcement rules)',
    example: {
      allowedTools: ['web_search', 'read_file'],
      deniedTools: ['delete_*'],
      toolPolicies: {
        web_search: { estimatedCost: 0.05, timeout: 30000 },
      },
      executionLimits: { maxSteps: 50, maxToolCalls: 20 },
      modelConfig: { temperature: 0.7, maxTokens: 2000 },
    },
  })
  effectiveAuthority: Record<string, any>;

  @ApiProperty({
    description: 'Mandate expiration timestamp',
    example: '2025-12-27T15:05:00Z',
  })
  expiresAt: Date;

  static fromEntity(mandate: schema.Mandate): MandateResponseDto {
    return {
      mandateId: mandate.mandateId,
      effectiveAuthority: mandate.authority,
      expiresAt: mandate.expiresAt,
    };
  }
}
