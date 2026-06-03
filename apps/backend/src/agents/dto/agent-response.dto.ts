import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Agent } from '../../database/schema';

export class AgentResponseDto {
  @ApiProperty({
    description: 'Unique agent identifier',
    example: 'agent-abc123xyz789',
  })
  agentId: string;

  @ApiProperty({
    description: 'Organization ID (agent belongs to this org)',
    example: 'org-abc123xyz789',
  })
  orgId: string; // NEW

  @ApiProperty({
    description: 'Display name for the agent',
    example: 'Production AI Assistant',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Principal (owner/contact) for this agent',
    example: 'dev@example.com',
  })
  principal?: string;

  @ApiProperty({
    description: 'Agent status',
    example: 'active',
    enum: ['active', 'inactive'],
  })
  status: string;

  @ApiProperty({
    description: 'Additional metadata as key-value pairs',
    example: { team: 'ai-platform', region: 'us-east-1' },
  })
  metadata: Record<string, string>;

  @ApiProperty({
    description: 'Timestamp when the agent was created',
    example: '2024-12-27T10:30:00.000Z',
  })
  createdAt: Date;

  static fromEntity(agent: Agent): AgentResponseDto {
    return {
      agentId: agent.agentId,
      orgId: agent.orgId, // NEW
      name: agent.name,
      principal: agent.principal ?? undefined,
      status: agent.status ?? 'active',
      metadata: agent.metadata ?? {},
      createdAt: agent.createdAt ?? new Date(),
    };
  }
}
