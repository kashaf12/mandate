import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { generateRuleId } from '../common/utils/crypto.utils';
import { PoliciesService } from '../policies/policies.service';
import { AgentsService } from '../agents/agents.service';

@Injectable()
export class RulesService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    private policiesService: PoliciesService,
    private agentsService: AgentsService,
  ) {}

  async create(createRuleDto: CreateRuleDto): Promise<schema.Rule> {
    // 1. Validate policy exists
    try {
      await this.policiesService.findOne(createRuleDto.policyId);
    } catch {
      throw new BadRequestException(
        `Policy ${createRuleDto.policyId} not found. Cannot create rule without valid policy.`,
      );
    }

    // 2. Validate agents exist (if provided)
    if (createRuleDto.agentIds && createRuleDto.agentIds.length > 0) {
      for (const agentId of createRuleDto.agentIds) {
        try {
          await this.agentsService.findOne(agentId);
        } catch {
          throw new BadRequestException(
            `Agent ${agentId} not found. Cannot create rule for non-existent agent.`,
          );
        }
      }
    }

    // 3. Generate rule ID
    const ruleId = generateRuleId();

    // 4. Create rule
    const [rule] = await this.db
      .insert(schema.rules)
      .values({
        ruleId,
        name: createRuleDto.name,
        description: createRuleDto.description,
        agentIds: createRuleDto.agentIds || null,
        matchMode: createRuleDto.matchMode || 'AND',
        conditions: createRuleDto.conditions,
        policyId: createRuleDto.policyId,
      })
      .returning();

    return rule;
  }

  async findAll(activeOnly = false): Promise<schema.Rule[]> {
    if (activeOnly) {
      return await this.db
        .select()
        .from(schema.rules)
        .where(eq(schema.rules.active, true));
    }

    return await this.db.select().from(schema.rules);
  }

  async findAllActive(): Promise<schema.Rule[]> {
    return await this.db
      .select()
      .from(schema.rules)
      .where(eq(schema.rules.active, true));
  }

  async findOne(ruleId: string): Promise<schema.Rule> {
    const [rule] = await this.db
      .select()
      .from(schema.rules)
      .where(eq(schema.rules.ruleId, ruleId))
      .limit(1);

    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    return rule;
  }

  async update(
    ruleId: string,
    updateRuleDto: UpdateRuleDto,
  ): Promise<schema.Rule> {
    // Validate policy exists if changing policyId
    if (updateRuleDto.policyId) {
      try {
        await this.policiesService.findOne(updateRuleDto.policyId);
      } catch {
        throw new BadRequestException(
          `Policy ${updateRuleDto.policyId} not found`,
        );
      }
    }

    // Validate agents exist if changing agentIds
    if (updateRuleDto.agentIds && updateRuleDto.agentIds.length > 0) {
      for (const agentId of updateRuleDto.agentIds) {
        try {
          await this.agentsService.findOne(agentId);
        } catch {
          throw new BadRequestException(`Agent ${agentId} not found`);
        }
      }
    }

    const [rule] = await this.db
      .update(schema.rules)
      .set({
        ...updateRuleDto,
        updatedAt: new Date(),
      })
      .where(eq(schema.rules.ruleId, ruleId))
      .returning();

    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    return rule;
  }

  async remove(ruleId: string): Promise<void> {
    const result = await this.db
      .update(schema.rules)
      .set({ active: false })
      .where(eq(schema.rules.ruleId, ruleId))
      .returning();

    if (result.length === 0) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }
  }
}
