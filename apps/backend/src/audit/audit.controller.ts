import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { BulkCreateAuditLogDto } from './dto/bulk-create-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { Request } from 'express';
import { Agent } from '../database/schema';

@ApiTags('audit')
@Controller('audit')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Post()
  @ApiOperation({
    summary: 'Create audit log entry',
    description: 'Records a single enforcement decision or action.',
  })
  @ApiResponse({
    status: 201,
    description: 'Audit log created',
    type: AuditLogResponseDto,
  })
  async create(
    @Req() request: Request & { agent: Agent },
    @Body() dto: CreateAuditLogDto,
  ): Promise<AuditLogResponseDto> {
    const log = await this.auditService.create({
      ...dto,
      agentId: request.agent.agentId,
    });
    return AuditLogResponseDto.fromEntity(log);
  }

  @Post('bulk')
  @ApiOperation({
    summary: 'Bulk insert audit logs',
    description:
      'Used by SDK to batch-report enforcement decisions. Returns count of inserted logs.',
  })
  @ApiResponse({
    status: 201,
    description: 'Audit logs inserted',
    schema: {
      type: 'object',
      properties: {
        inserted: { type: 'number', example: 50 },
      },
    },
  })
  async bulkCreate(
    @Req() request: Request & { agent: Agent },
    @Body() dto: BulkCreateAuditLogDto,
  ): Promise<{ inserted: number }> {
    const logsWithAgentId = dto.logs.map((log) => ({
      ...log,
      agentId: request.agent.agentId,
    }));
    const count = await this.auditService.bulkCreate(logsWithAgentId);
    return { inserted: count };
  }

  @Get()
  @ApiOperation({
    summary: 'Query audit logs',
    description:
      'Search audit logs with filters. Returns up to 1000 results per query.',
  })
  @ApiQuery({ name: 'agentId', required: false, type: String })
  @ApiQuery({ name: 'decision', required: false, enum: ['ALLOW', 'BLOCK'] })
  @ApiQuery({ name: 'actionType', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Audit logs found',
    type: [AuditLogResponseDto],
  })
  async query(
    @Req() request: Request & { agent: Agent },
    @Query() queryDto: QueryAuditLogDto,
  ): Promise<AuditLogResponseDto[]> {
    const logs = await this.auditService.query({
      ...queryDto,
      agentId: request.agent.agentId,
    });
    return logs.map((log) => AuditLogResponseDto.fromEntity(log));
  }
}
