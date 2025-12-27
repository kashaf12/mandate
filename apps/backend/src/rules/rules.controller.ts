import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RuleResponseDto } from './dto/rule-response.dto';

@ApiTags('rules')
@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new rule',
    description:
      'Creates a new rule that matches context conditions and applies a policy. Lower priority numbers are evaluated first.',
  })
  @ApiBody({ type: CreateRuleDto })
  @ApiResponse({
    status: 201,
    description: 'Rule created successfully',
    type: RuleResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  async create(@Body() createRuleDto: CreateRuleDto): Promise<RuleResponseDto> {
    const rule = await this.rulesService.create(createRuleDto);
    return RuleResponseDto.fromEntity(rule);
  }

  @Get()
  @ApiOperation({
    summary: 'List all rules',
    description:
      'Returns all rules. Use ?active=true to filter only active rules.',
  })
  @ApiQuery({
    name: 'active',
    required: false,
    type: String,
    description: 'Filter by active status (true/false)',
    example: 'true',
  })
  @ApiResponse({
    status: 200,
    description: 'List of rules sorted by priority',
    type: [RuleResponseDto],
  })
  async findAll(@Query('active') active?: string): Promise<RuleResponseDto[]> {
    const activeOnly = active === 'true';
    const rules = await this.rulesService.findAll(activeOnly);
    return rules.map((rule) => RuleResponseDto.fromEntity(rule));
  }

  @Get(':ruleId')
  @ApiOperation({
    summary: 'Get rule by ID',
    description: 'Returns a specific rule by its ruleId.',
  })
  @ApiParam({
    name: 'ruleId',
    description: 'Rule identifier',
    example: 'rule-abc123xyz789',
  })
  @ApiResponse({
    status: 200,
    description: 'Rule found',
    type: RuleResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async findOne(@Param('ruleId') ruleId: string): Promise<RuleResponseDto> {
    const rule = await this.rulesService.findOne(ruleId);
    return RuleResponseDto.fromEntity(rule);
  }

  @Put(':ruleId')
  @ApiOperation({
    summary: 'Update rule',
    description:
      'Updates a rule. All fields are optional. Priority can be changed to reorder evaluation.',
  })
  @ApiParam({
    name: 'ruleId',
    description: 'Rule identifier',
    example: 'rule-abc123xyz789',
  })
  @ApiBody({ type: UpdateRuleDto })
  @ApiResponse({
    status: 200,
    description: 'Rule updated successfully',
    type: RuleResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async update(
    @Param('ruleId') ruleId: string,
    @Body() updateRuleDto: UpdateRuleDto,
  ): Promise<RuleResponseDto> {
    const rule = await this.rulesService.update(ruleId, updateRuleDto);
    return RuleResponseDto.fromEntity(rule);
  }

  @Delete(':ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archive rule (soft delete)',
    description:
      'Archives a rule by setting active=false. The rule will no longer be evaluated.',
  })
  @ApiParam({
    name: 'ruleId',
    description: 'Rule identifier',
    example: 'rule-abc123xyz789',
  })
  @ApiResponse({
    status: 204,
    description: 'Rule archived successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async remove(@Param('ruleId') ruleId: string): Promise<void> {
    await this.rulesService.remove(ruleId);
  }
}
