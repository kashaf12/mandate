import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class KillAgentDto {
  @ApiProperty({
    description: 'Reason for killing the agent',
    example: 'Runaway cost detected - infinite loop',
  })
  @IsString()
  @Length(1, 500)
  reason: string;

  @ApiProperty({
    description: 'Who initiated the kill (email or identifier)',
    example: 'admin@example.com',
  })
  @IsString()
  @Length(1, 255)
  killedBy: string;
}
