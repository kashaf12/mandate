import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@ApiTags('api-keys')
@Controller('organizations/:orgId/api-keys')
export class ApiKeysController {
  constructor(private apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({
    summary: 'Create new API key for organization',
    description:
      'Creates a new organization-level API key. The plaintext key is returned ONLY in this response and can never be retrieved again. Store it securely (e.g., in Vault, AWS Secrets Manager).',
  })
  @ApiParam({
    name: 'orgId',
    description: 'Organization ID',
    example: 'org-abc123xyz789',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          example: 'Production Key',
          description: 'Optional: Human-readable name for the key',
        },
        createdBy: {
          type: 'string',
          example: 'admin@example.com',
          description: 'Optional: Principal who created the key',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'API key created successfully',
    schema: {
      type: 'object',
      properties: {
        key: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            keyId: { type: 'string', example: 'key-abc123xyz789' },
            orgId: { type: 'string', example: 'org-abc123xyz789' },
            name: { type: 'string', example: 'Production Key' },
            status: { type: 'string', example: 'active' },
            createdAt: { type: 'string', format: 'date-time' },
            createdBy: { type: 'string', example: 'admin@example.com' },
          },
        },
        apiKey: {
          type: 'string',
          example: 'sk-org-abc123xyz789-def012ghi345jkl678mno901pqr234stu',
          description:
            'CRITICAL: Save this key securely. It will never be shown again.',
        },
      },
    },
  })
  async create(
    @Param('orgId') orgId: string,
    @Body('name') name?: string,
    @Body('createdBy') createdBy?: string,
  ) {
    return await this.apiKeysService.create(orgId, name, createdBy);
  }

  @Get()
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List all API keys for organization',
    description:
      'Lists all API keys for the organization. Key hashes are NOT included for security.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'Organization ID',
    example: 'org-abc123xyz789',
  })
  @ApiOkResponse({
    description: 'API keys retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          keyId: { type: 'string', example: 'key-abc123xyz789' },
          orgId: { type: 'string', example: 'org-abc123xyz789' },
          name: { type: 'string', example: 'Production Key' },
          status: {
            type: 'string',
            enum: ['active', 'revoked', 'rotating'],
          },
          createdAt: { type: 'string', format: 'date-time' },
          createdBy: { type: 'string', example: 'admin@example.com' },
          revokedAt: { type: 'string', format: 'date-time', nullable: true },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
    },
  })
  async list(@Param('orgId') orgId: string) {
    return await this.apiKeysService.listForOrg(orgId);
  }

  @Delete(':keyId')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke API key',
    description:
      'Immediately revokes an API key. This action is irreversible. The key will no longer authenticate any requests.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'Organization ID',
    example: 'org-abc123xyz789',
  })
  @ApiParam({
    name: 'keyId',
    description: 'API key ID to revoke',
    example: 'key-abc123xyz789',
  })
  @ApiNoContentResponse({
    description: 'API key revoked successfully',
  })
  async revoke(@Param('keyId') keyId: string) {
    await this.apiKeysService.revoke(keyId);
  }

  @Post(':keyId/rotate')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rotate API key (with grace period)',
    description:
      'Starts key rotation with a grace period (default 7 days). Creates a new key and marks the old key for expiry. Both keys work during the grace period.',
  })
  @ApiParam({
    name: 'orgId',
    description: 'Organization ID',
    example: 'org-abc123xyz789',
  })
  @ApiParam({
    name: 'keyId',
    description: 'Old key ID to rotate',
    example: 'key-abc123xyz789',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        gracePeriodDays: {
          type: 'number',
          example: 7,
          description: 'Number of days both keys remain active',
        },
        createdBy: {
          type: 'string',
          example: 'admin@example.com',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Key rotation started successfully',
    schema: {
      type: 'object',
      properties: {
        oldKey: {
          type: 'object',
          description: 'Old key (status changed to "rotating")',
        },
        newKey: {
          type: 'object',
          description: 'New key (status "active")',
        },
        newApiKey: {
          type: 'string',
          description: 'Plaintext new key - SAVE THIS',
          example: 'sk-org-abc123xyz789-new123key456here789...',
        },
      },
    },
  })
  async rotate(
    @Param('keyId') keyId: string,
    @Body('gracePeriodDays') gracePeriodDays?: number,
    @Body('createdBy') createdBy?: string,
  ) {
    return await this.apiKeysService.rotate(keyId, gracePeriodDays, createdBy);
  }
}
