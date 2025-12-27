import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IssueMandateDto {
  // agent_id removed - extracted from API key

  @ApiProperty({
    description: 'Context for policy matching',
    example: {
      user_id: 'user-alice',
      user_tier: 'free',
      environment: 'production',
    },
  })
  @IsObject()
  context: Record<string, string>;
}
