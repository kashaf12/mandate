import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { KillAgentDto } from './dto/kill-agent.dto';
import { KillStatusResponseDto } from './dto/kill-status-response.dto';
import {
  AgentResponseDto,
  CreateAgentResponseDto,
} from './dto/agent-response.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { Request } from 'express';
import { Agent } from '../database/schema';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new agent',
    description:
      'Registers a new agent and returns an API key. The API key is returned only once on creation and must be stored securely. The API key is hashed (SHA-256) before storage.',
  })
  @ApiBody({
    type: CreateAgentDto,
    description: 'Agent creation data',
  })
  @ApiCreatedResponse({
    description: 'Agent created successfully',
    type: CreateAgentResponseDto,
    example: {
      agentId: 'agent-abc123xyz789',
      apiKey: 'sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
      name: 'Production AI Assistant',
      principal: 'dev@example.com',
      environment: 'production',
      status: 'active',
      metadata: { team: 'ai-platform', region: 'us-east-1' },
      createdAt: '2024-12-27T10:30:00.000Z',
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data',
    example: {
      statusCode: 400,
      message: [
        'name must be a string',
        'environment must be one of: development, staging, production',
      ],
      error: 'Bad Request',
    },
  })
  async create(
    @Body() createAgentDto: CreateAgentDto,
  ): Promise<CreateAgentResponseDto> {
    const { agent, apiKey } = await this.agentsService.create(createAgentDto);
    return CreateAgentResponseDto.fromEntityWithKey(agent, apiKey);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all agents',
    description:
      'Retrieves a list of all registered agents. Note: API keys are never returned in this response.',
  })
  @ApiOkResponse({
    description: 'List of agents retrieved successfully',
    type: [AgentResponseDto],
    example: [
      {
        agentId: 'agent-abc123xyz789',
        name: 'Production AI Assistant',
        principal: 'dev@example.com',
        environment: 'production',
        status: 'active',
        metadata: { team: 'ai-platform', region: 'us-east-1' },
        createdAt: '2024-12-27T10:30:00.000Z',
      },
      {
        agentId: 'agent-def456uvw012',
        name: 'Staging Test Agent',
        principal: 'test@example.com',
        environment: 'staging',
        status: 'active',
        metadata: {},
        createdAt: '2024-12-27T11:00:00.000Z',
      },
    ],
  })
  async findAll(): Promise<AgentResponseDto[]> {
    const agents = await this.agentsService.findAll();
    return agents.map((agent) => AgentResponseDto.fromEntity(agent));
  }

  @Get(':agentId')
  @ApiOperation({
    summary: 'Get agent by ID',
    description:
      'Retrieves details for a specific agent by its agentId. Note: API keys are never returned.',
  })
  @ApiParam({
    name: 'agentId',
    description: 'Unique agent identifier',
    example: 'agent-abc123xyz789',
  })
  @ApiOkResponse({
    description: 'Agent found and returned successfully',
    type: AgentResponseDto,
    example: {
      agentId: 'agent-abc123xyz789',
      name: 'Production AI Assistant',
      principal: 'dev@example.com',
      environment: 'production',
      status: 'active',
      metadata: { team: 'ai-platform', region: 'us-east-1' },
      createdAt: '2024-12-27T10:30:00.000Z',
    },
  })
  @ApiNotFoundResponse({
    description: 'Agent not found',
    example: {
      statusCode: 404,
      message: 'Agent agent-abc123xyz789 not found',
      error: 'Not Found',
    },
  })
  async findOne(@Param('agentId') agentId: string): Promise<AgentResponseDto> {
    const agent = await this.agentsService.findOne(agentId);
    return AgentResponseDto.fromEntity(agent);
  }

  @Put(':agentId')
  @ApiOperation({
    summary: 'Update an agent',
    description:
      'Updates agent details. All fields are optional - only provided fields will be updated.',
  })
  @ApiParam({
    name: 'agentId',
    description: 'Unique agent identifier',
    example: 'agent-abc123xyz789',
  })
  @ApiBody({
    type: UpdateAgentDto,
    description: 'Agent update data (all fields optional)',
  })
  @ApiOkResponse({
    description: 'Agent updated successfully',
    type: AgentResponseDto,
    example: {
      agentId: 'agent-abc123xyz789',
      name: 'Updated AI Assistant',
      principal: 'admin@example.com',
      environment: 'staging',
      status: 'active',
      metadata: { team: 'ai-platform', region: 'us-west-2', updated: true },
      createdAt: '2024-12-27T10:30:00.000Z',
    },
  })
  @ApiNotFoundResponse({
    description: 'Agent not found',
    example: {
      statusCode: 404,
      message: 'Agent agent-abc123xyz789 not found',
      error: 'Not Found',
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data',
    example: {
      statusCode: 400,
      message: [
        'status must be one of: active, inactive',
        'environment must be one of: development, staging, production',
      ],
      error: 'Bad Request',
    },
  })
  async update(
    @Param('agentId') agentId: string,
    @Body() updateAgentDto: UpdateAgentDto,
  ): Promise<AgentResponseDto> {
    const agent = await this.agentsService.update(agentId, updateAgentDto);
    return AgentResponseDto.fromEntity(agent);
  }

  @Delete(':agentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an agent (soft delete)',
    description:
      'Soft deletes an agent by setting its status to "inactive". The agent record is preserved in the database but marked as inactive.',
  })
  @ApiParam({
    name: 'agentId',
    description: 'Unique agent identifier',
    example: 'agent-abc123xyz789',
  })
  @ApiNoContentResponse({
    description: 'Agent successfully soft-deleted (status set to inactive)',
  })
  @ApiNotFoundResponse({
    description: 'Agent not found',
    example: {
      statusCode: 404,
      message: 'Agent agent-abc123xyz789 not found',
      error: 'Not Found',
    },
  })
  async remove(@Param('agentId') agentId: string): Promise<void> {
    await this.agentsService.remove(agentId);
  }

  @Post(':agentId/kill')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Kill agent (emergency termination)',
    description:
      'Immediately terminates agent. All subsequent mandate issuances will be blocked. Agent status set to inactive. Only the agent itself can kill itself.',
  })
  @ApiParam({
    name: 'agentId',
    description: 'Agent identifier',
    example: 'agent-abc123',
  })
  @ApiBody({
    type: KillAgentDto,
    description: 'Kill switch details',
  })
  @ApiOkResponse({
    description: 'Agent killed successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Agent agent-abc123 killed successfully',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Agent not found',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - can only kill own agent',
  })
  async kill(
    @Param('agentId') agentId: string,
    @Body() dto: KillAgentDto,
    @Req() request: Request & { agent: Agent },
  ): Promise<{ message: string }> {
    if (agentId !== request.agent.agentId) {
      throw new ForbiddenException('Can only kill own agent');
    }

    await this.agentsService.kill(agentId, dto);
    return { message: `Agent ${agentId} killed successfully` };
  }

  @Get(':agentId/kill-status')
  @ApiOperation({
    summary: 'Check kill switch status',
    description: 'Returns whether agent is killed and kill details.',
  })
  @ApiParam({
    name: 'agentId',
    description: 'Agent identifier',
    example: 'agent-abc123',
  })
  @ApiOkResponse({
    description: 'Kill status retrieved',
    type: KillStatusResponseDto,
  })
  async getKillStatus(
    @Param('agentId') agentId: string,
  ): Promise<KillStatusResponseDto> {
    return this.agentsService.getKillStatus(agentId);
  }

  @Post(':agentId/resurrect')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resurrect killed agent',
    description:
      'Removes kill switch and sets agent status to active. Use with caution. Only the agent itself can resurrect itself.',
  })
  @ApiParam({
    name: 'agentId',
    description: 'Agent identifier',
    example: 'agent-abc123',
  })
  @ApiOkResponse({
    description: 'Agent resurrected successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Agent agent-abc123 resurrected successfully',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Agent not found',
  })
  async resurrect(
    @Param('agentId') agentId: string,
    @Req() request: Request & { agent: Agent },
  ): Promise<{ message: string }> {
    if (agentId !== request.agent.agentId) {
      throw new ForbiddenException('Can only resurrect own agent');
    }

    await this.agentsService.resurrect(agentId);
    return { message: `Agent ${agentId} resurrected successfully` };
  }
}
