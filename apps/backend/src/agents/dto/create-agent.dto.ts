import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsEmail,
  Length,
} from 'class-validator';

export class CreateAgentDto {
  @ApiProperty({
    description: 'Display name for the agent',
    example: 'Production AI Assistant',
  })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiPropertyOptional({
    description: 'Principal (owner/contact) for this agent',
    example: 'dev@example.com',
  })
  @IsOptional()
  @IsEmail()
  principal?: string;

  @ApiPropertyOptional({
    description: 'Environment where the agent operates',
    enum: ['development', 'staging', 'production'],
    example: 'production',
  })
  @IsOptional()
  @IsEnum(['development', 'staging', 'production'])
  environment?: 'development' | 'staging' | 'production';

  @ApiPropertyOptional({
    description: 'Additional metadata as key-value pairs',
    example: { team: 'ai-platform', region: 'us-east-1' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
