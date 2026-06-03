import {
  IsString,
  IsOptional,
  IsObject,
  IsEmail,
  Length,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAgentDto {
  @ApiPropertyOptional({
    description: 'Display name for the agent',
    example: 'Updated AI Assistant',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Principal (owner/contact) for this agent',
    example: 'admin@example.com',
  })
  @IsOptional()
  @IsEmail()
  principal?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata as key-value pairs',
    example: { team: 'ai-platform', region: 'us-west-2', updated: true },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
