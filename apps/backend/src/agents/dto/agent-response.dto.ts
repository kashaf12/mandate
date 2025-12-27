import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Agent } from '../../database/schema';

export class AgentResponseDto {
  @ApiProperty({
    description: 'Unique agent identifier',
    example: 'agent-abc123xyz789',
  })
  agentId: string;

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
    description: 'Environment where the agent operates',
    example: 'production',
    enum: ['development', 'staging', 'production'],
  })
  environment: string;

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
      name: agent.name,
      principal: agent.principal ?? undefined,
      environment: agent.environment ?? 'development',
      status: agent.status ?? 'active',
      metadata: agent.metadata ?? {},
      createdAt: agent.createdAt ?? new Date(),
    };
  }
}

export class CreateAgentResponseDto extends AgentResponseDto {
  @ApiProperty({
    description:
      'API key for authenticating requests. **IMPORTANT:** This is returned only once on creation. Store it securely.',
    example: 'sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
    readOnly: true,
  })
  apiKey: string;

  static fromEntityWithKey(
    agent: Agent,
    apiKey: string,
  ): CreateAgentResponseDto {
    return {
      ...AgentResponseDto.fromEntity(agent),
      apiKey,
    };
  }
}
