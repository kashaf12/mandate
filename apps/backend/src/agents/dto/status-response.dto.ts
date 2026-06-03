import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StatusResponseDto {
  @ApiProperty({
    description: 'Agent status',
    enum: ['active', 'inactive'],
    example: 'active',
  })
  status: 'active' | 'inactive';

  @ApiProperty({
    description: 'Whether agent has an active kill switch',
    example: false,
  })
  is_killed: boolean;

  @ApiPropertyOptional({
    description: 'Timestamp when agent was killed',
    example: '2024-12-27T10:30:00.000Z',
  })
  killed_at?: Date;

  @ApiPropertyOptional({
    description: 'Reason for kill switch activation',
    example: 'Runaway costs detected',
  })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Who triggered the kill switch',
    example: 'admin@example.com',
  })
  killed_by?: string;
}
