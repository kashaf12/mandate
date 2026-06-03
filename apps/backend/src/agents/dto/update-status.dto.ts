import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStatusDto {
  @ApiProperty({
    description: 'Agent status',
    enum: ['active', 'inactive'],
    example: 'active',
  })
  @IsEnum(['active', 'inactive'])
  status: 'active' | 'inactive';
}
