import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { generatePolicyId } from '../common/utils/crypto.utils';
import { extractErrorInfo } from '../common/utils/error.utils';

@Injectable()
export class PoliciesService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  async create(createPolicyDto: CreatePolicyDto): Promise<schema.Policy> {
    // Generate policy ID
    const policyId = generatePolicyId();

    // First version
    const version = 1;

    const [policy] = await this.db
      .insert(schema.policies)
      .values({
        policyId,
        version,
        name: createPolicyDto.name,
        description: createPolicyDto.description,
        authority: createPolicyDto.authority as Record<string, string>,
        createdBy: createPolicyDto.createdBy,
      })
      .returning();

    return policy;
  }

  async findAll(activeOnly = false): Promise<schema.Policy[]> {
    if (activeOnly) {
      return await this.db
        .select()
        .from(schema.policies)
        .where(eq(schema.policies.active, true))
        .orderBy(desc(schema.policies.createdAt));
    }

    return await this.db
      .select()
      .from(schema.policies)
      .orderBy(desc(schema.policies.createdAt));
  }

  async findOne(policyId: string, version?: number): Promise<schema.Policy> {
    if (version) {
      // Get specific version
      const [policy] = await this.db
        .select()
        .from(schema.policies)
        .where(
          and(
            eq(schema.policies.policyId, policyId),
            eq(schema.policies.version, version),
          ),
        )
        .limit(1);

      if (!policy) {
        throw new NotFoundException(
          `Policy ${policyId} version ${version} not found`,
        );
      }

      return policy;
    }

    // Get latest version
    const policies = await this.db
      .select()
      .from(schema.policies)
      .where(eq(schema.policies.policyId, policyId))
      .orderBy(desc(schema.policies.version))
      .limit(1);

    if (policies.length === 0) {
      throw new NotFoundException(`Policy ${policyId} not found`);
    }

    return policies[0];
  }

  async update(
    policyId: string,
    updatePolicyDto: UpdatePolicyDto,
  ): Promise<schema.Policy> {
    try {
      return await this.db.transaction(async (tx) => {
        const policies = await tx
          .select()
          .from(schema.policies)
          .where(eq(schema.policies.policyId, policyId))
          .orderBy(desc(schema.policies.version))
          .limit(1)
          .for('update');

        if (policies.length === 0) {
          throw new NotFoundException(`Policy ${policyId} not found`);
        }

        const currentPolicy = policies[0];
        const newVersion = currentPolicy.version + 1;

        const [policy] = await tx
          .insert(schema.policies)
          .values({
            policyId,
            version: newVersion,
            name: currentPolicy.name,
            description:
              updatePolicyDto.description ?? currentPolicy.description,
            authority: (updatePolicyDto.authority ??
              currentPolicy.authority) as Record<string, string>,
            createdBy: currentPolicy.createdBy,
          })
          .returning();

        return policy;
      });
    } catch (error) {
      const { message, stack } = extractErrorInfo(error);
      this.logger.error('Failed to update policy', {
        error: message,
        stack,
        policyId,
      });
      throw error;
    }
  }

  async findByIds(policyIds: string[]): Promise<schema.Policy[]> {
    if (policyIds.length === 0) {
      return [];
    }

    // Fetch all active versions of requested policies (single query)
    const allVersions = await this.db
      .select()
      .from(schema.policies)
      .where(
        and(
          inArray(schema.policies.policyId, policyIds),
          eq(schema.policies.active, true),
        ),
      )
      .orderBy(desc(schema.policies.version));

    // Group by policyId, keep only latest version
    const latestPolicies = new Map<string, schema.Policy>();

    for (const policy of allVersions) {
      if (!latestPolicies.has(policy.policyId)) {
        latestPolicies.set(policy.policyId, policy);
      }
    }

    return Array.from(latestPolicies.values());
  }

  async remove(policyId: string, version?: number): Promise<void> {
    if (version) {
      // Archive specific version
      const result = await this.db
        .update(schema.policies)
        .set({ active: false })
        .where(
          and(
            eq(schema.policies.policyId, policyId),
            eq(schema.policies.version, version),
          ),
        )
        .returning();

      if (result.length === 0) {
        throw new NotFoundException(
          `Policy ${policyId} version ${version} not found`,
        );
      }
    } else {
      // Archive all versions
      const result = await this.db
        .update(schema.policies)
        .set({ active: false })
        .where(eq(schema.policies.policyId, policyId))
        .returning();

      if (result.length === 0) {
        throw new NotFoundException(`Policy ${policyId} not found`);
      }
    }
  }
}
