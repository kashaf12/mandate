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
import { PoliciesService } from './policies.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { PolicyResponseDto } from './dto/policy-response.dto';

@ApiTags('policies')
@Controller('policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new policy',
    description:
      'Creates a new policy with version 1. The policyId is auto-generated.',
  })
  @ApiBody({ type: CreatePolicyDto })
  @ApiResponse({
    status: 201,
    description: 'Policy created successfully',
    type: PolicyResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  async create(
    @Body() createPolicyDto: CreatePolicyDto,
  ): Promise<PolicyResponseDto> {
    const policy = await this.policiesService.create(createPolicyDto);
    return PolicyResponseDto.fromEntity(policy);
  }

  @Get()
  @ApiOperation({
    summary: 'List all policies',
    description:
      'Returns all policies. Use ?active=true to filter only active policies.',
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
    description: 'List of policies',
    type: [PolicyResponseDto],
  })
  async findAll(
    @Query('active') active?: string,
  ): Promise<PolicyResponseDto[]> {
    const activeOnly = active === 'true';
    const policies = await this.policiesService.findAll(activeOnly);
    return policies.map((policy) => PolicyResponseDto.fromEntity(policy));
  }

  @Get(':policyId')
  @ApiOperation({
    summary: 'Get policy by ID',
    description:
      'Returns the latest version of a policy, or a specific version if ?version=X is provided.',
  })
  @ApiParam({
    name: 'policyId',
    description: 'Policy identifier',
    example: 'policy-abc123xyz789',
  })
  @ApiQuery({
    name: 'version',
    required: false,
    type: Number,
    description: 'Specific version number (defaults to latest)',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Policy found',
    type: PolicyResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Policy not found',
  })
  async findOne(
    @Param('policyId') policyId: string,
    @Query('version') version?: string,
  ): Promise<PolicyResponseDto> {
    const versionNum = version ? parseInt(version, 10) : undefined;
    const policy = await this.policiesService.findOne(policyId, versionNum);
    return PolicyResponseDto.fromEntity(policy);
  }

  @Put(':policyId')
  @ApiOperation({
    summary: 'Update policy (creates new version)',
    description:
      'Updates a policy by creating a new immutable version. The policy name cannot be changed.',
  })
  @ApiParam({
    name: 'policyId',
    description: 'Policy identifier',
    example: 'policy-abc123xyz789',
  })
  @ApiBody({ type: UpdatePolicyDto })
  @ApiResponse({
    status: 200,
    description: 'Policy updated (new version created)',
    type: PolicyResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Policy not found',
  })
  async update(
    @Param('policyId') policyId: string,
    @Body() updatePolicyDto: UpdatePolicyDto,
  ): Promise<PolicyResponseDto> {
    const policy = await this.policiesService.update(policyId, updatePolicyDto);
    return PolicyResponseDto.fromEntity(policy);
  }

  @Delete(':policyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archive policy (soft delete)',
    description:
      'Archives a policy by setting active=false. Use ?version=X to archive a specific version, or omit to archive all versions.',
  })
  @ApiParam({
    name: 'policyId',
    description: 'Policy identifier',
    example: 'policy-abc123xyz789',
  })
  @ApiQuery({
    name: 'version',
    required: false,
    type: Number,
    description: 'Specific version to archive (defaults to all versions)',
    example: 1,
  })
  @ApiResponse({
    status: 204,
    description: 'Policy archived successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Policy not found',
  })
  async remove(
    @Param('policyId') policyId: string,
    @Query('version') version?: string,
  ): Promise<void> {
    const versionNum = version ? parseInt(version, 10) : undefined;
    await this.policiesService.remove(policyId, versionNum);
  }
}
