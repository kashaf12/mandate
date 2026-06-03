import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Matches, Length } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({
    description: 'Organization display name',
    example: 'Acme Corporation',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description:
      'Custom organization ID. Must be alphanumeric with optional hyphens (cannot start or end with hyphen), 3-60 characters. If not provided, a random ID with "org-" prefix will be generated.',
    example: 'acme',
    minLength: 3,
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @Length(3, 60, {
    message: 'orgId must be between 3 and 60 characters',
  })
  @Matches(/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/, {
    message:
      'orgId must contain only alphanumeric characters and hyphens, and cannot start or end with a hyphen',
  })
  orgId?: string;
}
