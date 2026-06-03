import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import { generateOrgId } from '../common/utils/crypto.utils';
import { extractErrorInfo } from '../common/utils/error.utils';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  /**
   * Create new organization
   *
   * If orgId is provided, it must be alphanumeric and 3-60 characters.
   * It will be used as-is (no prefix added).
   * If not provided, a random orgId will be generated (with "org-" prefix).
   *
   * The database unique constraint on org_id will handle duplicate detection.
   */
  async create(dto: CreateOrganizationDto): Promise<schema.Organization> {
    const orgId = dto.orgId ? dto.orgId.toLowerCase() : generateOrgId();

    try {
      const [org] = await this.db
        .insert(schema.organizations)
        .values({ orgId, name: dto.name })
        .returning();

      this.logger.info('Organization created', {
        orgId,
        name: dto.name,
        customOrgId: !!dto.orgId,
      });

      return org;
    } catch (error: unknown) {
      const errorObj = error as { code?: string; message?: string };
      if (
        errorObj.code === '23505' ||
        (errorObj.message &&
          (errorObj.message.includes('unique') ||
            errorObj.message.includes('duplicate')))
      ) {
        throw new ConflictException(
          `Organization with ID '${dto.orgId || orgId}' already exists`,
        );
      }

      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      const { message, stack } = extractErrorInfo(error);
      this.logger.error('Failed to create organization', {
        error: message,
        stack,
        name: dto.name,
        orgId: dto.orgId,
      });
      throw error;
    }
  }

  /**
   * Find organization by orgId
   * Throws NotFoundException if not found
   */
  async findByOrgId(orgId: string): Promise<schema.Organization> {
    const [org] = await this.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.orgId, orgId))
      .limit(1);

    if (!org) {
      throw new NotFoundException(`Organization ${orgId} not found`);
    }

    return org;
  }

  /**
   * List all organizations (admin only)
   */
  async findAll(): Promise<schema.Organization[]> {
    return await this.db.select().from(schema.organizations);
  }

  /**
   * Update organization name
   */
  async update(orgId: string, name: string): Promise<schema.Organization> {
    const [org] = await this.db
      .update(schema.organizations)
      .set({
        name,
        updatedAt: new Date(),
      })
      .where(eq(schema.organizations.orgId, orgId))
      .returning();

    if (!org) {
      throw new NotFoundException(`Organization ${orgId} not found`);
    }

    this.logger.info('Organization updated', { orgId, name });

    return org;
  }
}
