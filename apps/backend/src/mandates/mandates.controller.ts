import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { MandatesService } from './mandates.service';
import { IssueMandateDto } from './dto/issue-mandate.dto';
import { MandateResponseDto } from './dto/mandate-response.dto';
import { MandateDetailDto } from './dto/mandate-detail.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@ApiTags('mandates')
@Controller('mandates')
@UseGuards(ApiKeyGuard) // Require API key for all endpoints
@ApiBearerAuth() // Swagger auth
export class MandatesController {
  constructor(private mandatesService: MandatesService) {}

  @Post('issue')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Issue mandate for agent',
    description:
      'Evaluates rules based on context, composes policies, and issues runtime authority. Agent is identified from API key.',
  })
  @ApiBody({ type: IssueMandateDto })
  @ApiResponse({
    status: 201,
    description: 'Mandate issued successfully',
    type: MandateResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Agent is inactive',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing API key',
  })
  async issue(
    @Req() request: { agent: { agentId: string } },
    @Body() dto: IssueMandateDto,
  ): Promise<MandateResponseDto> {
    const mandate = await this.mandatesService.issue(
      request.agent.agentId,
      dto.context,
    );
    return MandateResponseDto.fromEntity(mandate);
  }

  @Get(':mandateId')
  @ApiOperation({
    summary: 'Get mandate details (admin/debug)',
    description:
      'Returns complete mandate details including matched rules and applied policies. Used for debugging.',
  })
  @ApiParam({
    name: 'mandateId',
    description: 'Mandate identifier',
    example: 'mnd-abc123xyz789',
  })
  @ApiResponse({
    status: 200,
    description: 'Mandate found',
    type: MandateDetailDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Mandate not found or expired',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing API key',
  })
  async findOne(
    @Param('mandateId') mandateId: string,
  ): Promise<MandateDetailDto> {
    const mandate = await this.mandatesService.findOne(mandateId);
    return MandateDetailDto.fromEntity(mandate);
  }
}
