import { Controller, Post, Get, Patch, Param, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new organization',
    description:
      'Creates a new organization. You can optionally provide a custom orgId (alphanumeric, 3-32 chars). If not provided, a random ID will be generated.',
  })
  @ApiCreatedResponse({
    description: 'Organization created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        orgId: { type: 'string', example: 'org-acme' },
        name: { type: 'string', example: 'Acme Corporation' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async create(@Body() dto: CreateOrganizationDto) {
    return await this.organizationsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all organizations',
    description: 'Lists all organizations.',
  })
  @ApiOkResponse({
    description: 'Organizations retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          orgId: { type: 'string' },
          name: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  async findAll() {
    return await this.organizationsService.findAll();
  }

  @Get(':orgId')
  @ApiOperation({
    summary: 'Get organization details',
    description: 'Retrieves details for a specific organization.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'Organization ID',
    example: 'org-acme',
  })
  async findOne(@Param('orgId') orgId: string) {
    return await this.organizationsService.findByOrgId(orgId);
  }

  @Patch(':orgId')
  @ApiOperation({
    summary: 'Update organization name',
    description: 'Updates the organization name.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'Organization ID',
    example: 'org-acme',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Acme Corp (Renamed)' },
      },
      required: ['name'],
    },
  })
  async update(@Param('orgId') orgId: string, @Body('name') name: string) {
    return await this.organizationsService.update(orgId, name);
  }
}
