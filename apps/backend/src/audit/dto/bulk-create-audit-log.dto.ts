import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateAuditLogDto } from './create-audit-log.dto';

export class BulkCreateAuditLogDto {
  @ApiProperty({
    description: 'Array of audit logs to insert',
    type: [CreateAuditLogDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAuditLogDto)
  logs: CreateAuditLogDto[];
}
