import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { eq, and } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import {
  generateKeyId,
  generateOrgApiKey,
  hashApiKey,
  validateApiKeyFormat,
} from '../common/utils/crypto.utils';
import { OrganizationsService } from '../organizations/organizations.service';
import { extractErrorInfo } from '../common/utils/error.utils';

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    private organizationsService: OrganizationsService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  /**
   * Create new API key for organization
   * Returns plaintext key ONCE (never retrievable again)
   *
   * Security notes:
   * - Key is returned in plaintext ONLY in this response
   * - Only hash is stored in database
   * - Key should be stored in secret manager (Vault, AWS Secrets Manager)
   */
  async create(
    orgId: string,
    name?: string,
    createdBy?: string,
  ): Promise<{
    key: schema.ApiKey;
    apiKey: string; // Plaintext - SAVE THIS
  }> {
    try {
      // 1. Verify org exists (throws if not)
      await this.organizationsService.findByOrgId(orgId);

      // 2. Generate key
      const keyId = generateKeyId();
      const apiKey = generateOrgApiKey(orgId);
      const keyHash = hashApiKey(apiKey);

      // 3. Store hash (NOT plaintext)
      const [key] = await this.db
        .insert(schema.apiKeys)
        .values({
          keyId,
          orgId,
          keyHash,
          name: name || `Key created on ${new Date().toISOString()}`,
          createdBy,
          status: 'active',
        })
        .returning();

      this.logger.info('API key created', {
        keyId,
        orgId,
        name: key.name,
        createdBy,
      });

      // 4. Return plaintext key ONCE
      return { key, apiKey };
    } catch (error) {
      const { message, stack } = extractErrorInfo(error);
      this.logger.error('Failed to create API key', {
        error: message,
        stack,
        orgId,
        name,
      });
      throw error;
    }
  }

  /**
   * Authenticate: Find API key by plaintext key (validates and returns key record)
   *
   * This method is called by ApiKeyGuard on every authenticated request.
   *
   * Validation:
   * - Key format is correct (sk-org-xxx-yyy)
   * - Hash exists in database
   * - Status is 'active' (not revoked)
   * - Not expired (if expiresAt is set)
   *
   * Throws NotFoundException if any validation fails (treated as 401 Unauthorized)
   */
  async findByApiKey(apiKey: string): Promise<schema.ApiKey> {
    // 1. Validate format
    const { orgId, valid } = validateApiKeyFormat(apiKey);
    if (!valid) {
      throw new NotFoundException('Invalid API key format');
    }

    // 2. Hash key
    const keyHash = hashApiKey(apiKey);

    // 3. Lookup in database
    const [key] = await this.db
      .select()
      .from(schema.apiKeys)
      .where(
        and(
          eq(schema.apiKeys.keyHash, keyHash),
          eq(schema.apiKeys.orgId, orgId), // Double-check orgId matches
        ),
      )
      .limit(1);

    if (!key) {
      // Don't reveal whether key exists or not (security)
      throw new NotFoundException('Invalid API key');
    }

    // 4. Check status
    if (key.status !== 'active') {
      throw new NotFoundException('API key is revoked or inactive');
    }

    // 5. Check expiry (for grace period during rotation)
    if (key.expiresAt && new Date() > key.expiresAt) {
      throw new NotFoundException('API key has expired');
    }

    return key;
  }

  /**
   * Revoke API key immediately
   * Used for emergency key compromise or rotation completion
   */
  async revoke(keyId: string): Promise<void> {
    const [key] = await this.db
      .update(schema.apiKeys)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
      })
      .where(eq(schema.apiKeys.keyId, keyId))
      .returning();

    if (!key) {
      throw new NotFoundException(`API key ${keyId} not found`);
    }

    this.logger.warn('API key revoked', {
      keyId,
      orgId: key.orgId,
      name: key.name,
    });
  }

  /**
   * List API keys for organization
   * IMPORTANT: Never expose keyHash in responses
   */
  async listForOrg(
    orgId: string,
  ): Promise<Array<Omit<schema.ApiKey, 'keyHash'>>> {
    // Verify org exists
    await this.organizationsService.findByOrgId(orgId);

    const keys = await this.db
      .select({
        id: schema.apiKeys.id,
        keyId: schema.apiKeys.keyId,
        orgId: schema.apiKeys.orgId,
        name: schema.apiKeys.name,
        status: schema.apiKeys.status,
        createdAt: schema.apiKeys.createdAt,
        createdBy: schema.apiKeys.createdBy,
        revokedAt: schema.apiKeys.revokedAt,
        expiresAt: schema.apiKeys.expiresAt,
      })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.orgId, orgId));

    return keys;
  }

  /**
   * Start key rotation (grace period)
   *
   * Rotation workflow:
   * 1. Call this to create new key
   * 2. Deploy new key to 10% of agents (canary)
   * 3. Monitor for 24 hours
   * 4. Deploy new key to 100% of agents
   * 5. Wait 7 days (grace period)
   * 6. Revoke old key
   *
   * Both keys work during grace period (7 days default)
   */
  async rotate(
    oldKeyId: string,
    gracePeriodDays: number = 7,
    createdBy?: string,
  ): Promise<{
    oldKey: schema.ApiKey;
    newKey: schema.ApiKey;
    newApiKey: string; // Plaintext - SAVE THIS
  }> {
    // 1. Get old key
    const [oldKey] = await this.db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.keyId, oldKeyId))
      .limit(1);

    if (!oldKey) {
      throw new NotFoundException(`API key ${oldKeyId} not found`);
    }

    if (oldKey.status !== 'active') {
      throw new BadRequestException('Cannot rotate non-active key');
    }

    // 2. Create new key
    const { key: newKey, apiKey: newApiKey } = await this.create(
      oldKey.orgId,
      `Rotated from ${oldKey.name}`,
      createdBy,
    );

    // 3. Mark old key as rotating (with expiry)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + gracePeriodDays);

    const [updatedOldKey] = await this.db
      .update(schema.apiKeys)
      .set({
        status: 'rotating',
        expiresAt,
      })
      .where(eq(schema.apiKeys.keyId, oldKeyId))
      .returning();

    this.logger.info('API key rotation started', {
      oldKeyId,
      newKeyId: newKey.keyId,
      orgId: oldKey.orgId,
      gracePeriodDays,
      expiresAt,
    });

    return {
      oldKey: updatedOldKey,
      newKey,
      newApiKey, // Return plaintext ONCE
    };
  }
}
