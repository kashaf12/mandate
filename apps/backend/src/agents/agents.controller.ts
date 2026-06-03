import {
  Controller,
  Get,
  Post,
  Patch,
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
  ApiConflictResponse,
} from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { KillAgentDto } from './dto/kill-agent.dto';
import { KillStatusResponseDto } from './dto/kill-status-response.dto';
import { StatusResponseDto } from './dto/status-response.dto';
import { AgentResponseDto } from './dto/agent-response.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { Request } from 'express';
import { Agent } from '../database/schema';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  @UseGuards(ApiKeyGuard) // NEW: Org-level API key required
  @ApiBearerAuth() // NEW: Swagger doc
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new agent',
    description:
      'Creates a new agent within the authenticated organization. The agent will be assigned to the organization associated with the API key.',
  })
  @ApiBody({
    type: CreateAgentDto,
    description: 'Agent creation data',
  })
  @ApiCreatedResponse({
    description: 'Agent created successfully',
    type: AgentResponseDto,
    example: {
      agentId: 'agent-abc123xyz789',
      orgId: 'org-abc123xyz789', // NEW in response
      name: 'Production AI Assistant',
      principal: 'dev@example.com',
      status: 'active',
      metadata: { team: 'ai-platform', region: 'us-east-1' },
      createdAt: '2024-12-27T10:30:00.000Z',
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data',
    example: {
      statusCode: 400,
      message: ['name must be a string'],
      error: 'Bad Request',
    },
  })
  async create(
    @Body() createAgentDto: CreateAgentDto,
    @Req() request: Request & { org: { orgId: string } }, // NEW: Access authenticated request
  ): Promise<AgentResponseDto> {
    // Extract orgId from authenticated request (set by ApiKeyGuard)
    const orgId = request.org.orgId;

    // Create agent (NO API KEY returned)
    const agent = await this.agentsService.create(orgId, createAgentDto);

    return AgentResponseDto.fromEntity(agent);
  }

  @Get()
  @UseGuards(ApiKeyGuard) // ADDED: Protect list endpoint
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all agents',
    description:
      'Retrieves a list of all registered agents. In production, this should be scoped to the authenticated org.',
  })
  @ApiOkResponse({
    description: 'List of agents retrieved successfully',
    type: [AgentResponseDto],
    example: [
      {
        agentId: 'agent-abc123xyz789',
        name: 'Production AI Assistant',
        principal: 'dev@example.com',
        status: 'active',
        metadata: { team: 'ai-platform', region: 'us-east-1' },
        createdAt: '2024-12-27T10:30:00.000Z',
      },
      {
        agentId: 'agent-def456uvw012',
        name: 'Staging Test Agent',
        principal: 'test@example.com',
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

  @Get(':agentId/status')
  @ApiOperation({
    summary: 'Get agent status',
    description:
      'Retrieves the current status of an agent, including kill switch information.',
  })
  @ApiParam({
    name: 'agentId',
    description: 'Unique agent identifier',
    example: 'agent-abc123xyz789',
  })
  @ApiOkResponse({
    description: 'Agent status retrieved successfully',
    type: StatusResponseDto,
    example: {
      status: 'active',
      is_killed: false,
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
  async getStatus(
    @Param('agentId') agentId: string,
  ): Promise<StatusResponseDto> {
    const agent = await this.agentsService.findOne(agentId);
    const killStatus = await this.agentsService.getKillStatus(agentId);

    return {
      status: (agent.status ?? 'active') as 'active' | 'inactive',
      is_killed: killStatus.is_killed,
      killed_at: killStatus.killed_at,
      reason: killStatus.reason,
      killed_by: killStatus.killed_by,
    };
  }

  @Patch(':agentId/status')
  @ApiOperation({
    summary: 'Update agent status',
    description:
      'Updates the agent status. This operation is idempotent - setting status to the current value returns success without changes. Cannot activate agent with active kill switch.',
  })
  @ApiParam({
    name: 'agentId',
    description: 'Unique agent identifier',
    example: 'agent-abc123xyz789',
  })
  @ApiBody({
    type: UpdateStatusDto,
    description: 'Status update data',
  })
  @ApiOkResponse({
    description: 'Agent status updated successfully',
    type: AgentResponseDto,
    example: {
      agentId: 'agent-abc123xyz789',
      name: 'Production AI Assistant',
      principal: 'dev@example.com',
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
  @ApiBadRequestResponse({
    description: 'Cannot activate agent with active kill switch',
    example: {
      statusCode: 400,
      message:
        'Cannot activate agent with active kill switch. Use POST /agents/:agentId/resurrect to remove kill switch first.',
      error: 'Bad Request',
    },
  })
  async updateStatus(
    @Param('agentId') agentId: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<AgentResponseDto> {
    const agent = await this.agentsService.setStatus(agentId, dto.status);
    return AgentResponseDto.fromEntity(agent);
  }

  @Patch(':agentId')
  @ApiOperation({
    summary: 'Partially update an agent',
    description:
      'Updates specified fields of an agent. Unspecified fields remain unchanged. Status cannot be updated via this endpoint - use PATCH /agents/:agentId/status instead. All fields are optional - only provided fields will be updated.',
  })
  @ApiParam({
    name: 'agentId',
    description: 'Unique agent identifier',
    example: 'agent-abc123xyz789',
  })
  @ApiBody({
    type: UpdateAgentDto,
    description: 'Agent update data (all fields optional, status not accepted)',
  })
  @ApiOkResponse({
    description: 'Agent updated successfully',
    type: AgentResponseDto,
    example: {
      agentId: 'agent-abc123xyz789',
      name: 'Updated AI Assistant',
      principal: 'admin@example.com',
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
      message: ['name must be a string'],
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
  @ApiConflictResponse({
    description: 'Conflict - agent is already killed',
    example: {
      statusCode: 409,
      message: 'Agent agent-abc123 is already killed.',
      error: 'Conflict',
    },
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
