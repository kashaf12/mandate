import { ApiProperty } from '@nestjs/swagger';

export class KillStatusResponseDto {
  @ApiProperty({
    description: 'Whether the agent is killed',
    example: true,
  })
  is_killed: boolean;

  @ApiProperty({
    description: 'When the agent was killed',
    example: '2025-12-27T15:30:00Z',
    required: false,
  })
  killed_at?: Date;

  @ApiProperty({
    description: 'Reason for kill',
    example: 'Runaway cost detected',
    required: false,
  })
  reason?: string;

  @ApiProperty({
    description: 'Who killed the agent',
    example: 'admin@example.com',
    required: false,
  })
  killed_by?: string;
}
