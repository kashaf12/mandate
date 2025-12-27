import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import * as killSwitchSchema from '../database/schemas/kill-switches';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { KillAgentDto } from './dto/kill-agent.dto';
import { KillStatusResponseDto } from './dto/kill-status-response.dto';
import {
  generateAgentId,
  generateApiKey,
  hashApiKey,
} from '../common/utils/crypto.utils';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AgentsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    private auditService: AuditService,
  ) {}

  async create(createAgentDto: CreateAgentDto): Promise<{
    agent: schema.Agent;
    apiKey: string;
  }> {
    // Generate unique agent_id
    const agentId = generateAgentId();

    // Generate API key (returned once, never stored in plaintext)
    const apiKey = generateApiKey();

    // Hash API key for storage (SHA-256)
    const apiKeyHash = hashApiKey(apiKey);

    // Insert agent
    const [agent] = await this.db
      .insert(schema.agents)
      .values({
        agentId,
        apiKeyHash,
        name: createAgentDto.name,
        principal: createAgentDto.principal,
        environment: createAgentDto.environment || 'development',
        metadata: createAgentDto.metadata || {},
      })
      .returning();

    return { agent, apiKey };
  }

  async findAll(): Promise<schema.Agent[]> {
    return await this.db.select().from(schema.agents);
  }

  async findOne(agentId: string): Promise<schema.Agent> {
    const [agent] = await this.db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.agentId, agentId))
      .limit(1);

    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }

    return agent;
  }

  async findByIds(agentIds: string[]): Promise<schema.Agent[]> {
    if (agentIds.length === 0) {
      return [];
    }

    return await this.db
      .select()
      .from(schema.agents)
      .where(inArray(schema.agents.agentId, agentIds));
  }

  async findByApiKey(apiKey: string): Promise<schema.Agent> {
    const apiKeyHash = hashApiKey(apiKey);

    // Direct indexed lookup - O(1) thanks to idx_agents_api_key_hash
    const [agent] = await this.db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.apiKeyHash, apiKeyHash))
      .limit(1);

    if (!agent) {
      throw new NotFoundException('Invalid API key');
    }

    // Additional check: ensure agent is active
    if (agent.status !== 'active') {
      throw new NotFoundException('Invalid API key');
    }

    return agent;
  }

  async update(
    agentId: string,
    updateAgentDto: UpdateAgentDto,
  ): Promise<schema.Agent> {
    const [agent] = await this.db
      .update(schema.agents)
      .set({
        ...updateAgentDto,
        updatedAt: new Date(),
      })
      .where(eq(schema.agents.agentId, agentId))
      .returning();

    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }

    return agent;
  }

  async remove(agentId: string): Promise<void> {
    const result = await this.db
      .update(schema.agents)
      .set({ status: 'inactive' })
      .where(eq(schema.agents.agentId, agentId))
      .returning();

    if (result.length === 0) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }
  }

  /**
   * Kill agent (emergency termination)
   */
  async kill(agentId: string, dto: KillAgentDto): Promise<void> {
    // 1. Verify agent exists
    await this.findOne(agentId);

    // 2. Insert kill switch record
    await this.db
      .insert(killSwitchSchema.killSwitches)
      .values({
        agentId,
        reason: dto.reason,
        killedBy: dto.killedBy,
      })
      .onConflictDoUpdate({
        target: killSwitchSchema.killSwitches.agentId,
        set: {
          killedAt: new Date(),
          reason: dto.reason,
          killedBy: dto.killedBy,
        },
      });

    // 3. Set agent status to inactive
    await this.update(agentId, { status: 'inactive' });

    // 4. Log kill switch activation
    await this.auditService.logKillSwitch(agentId, dto.reason, dto.killedBy);
  }

  /**
   * Check if agent is killed
   */
  async isKilled(agentId: string): Promise<boolean> {
    const [killSwitch] = await this.db
      .select()
      .from(killSwitchSchema.killSwitches)
      .where(eq(killSwitchSchema.killSwitches.agentId, agentId))
      .limit(1);

    return !!killSwitch;
  }

  /**
   * Get kill switch status
   */
  async getKillStatus(agentId: string): Promise<KillStatusResponseDto> {
    const [killSwitch] = await this.db
      .select()
      .from(killSwitchSchema.killSwitches)
      .where(eq(killSwitchSchema.killSwitches.agentId, agentId))
      .limit(1);

    if (!killSwitch) {
      return { is_killed: false };
    }

    return {
      is_killed: true,
      killed_at: killSwitch.killedAt,
      reason: killSwitch.reason,
      killed_by: killSwitch.killedBy,
    };
  }

  /**
   * Resurrect agent (remove kill switch)
   */
  async resurrect(agentId: string): Promise<void> {
    // 1. Verify agent exists
    await this.findOne(agentId);

    // 2. Remove kill switch
    await this.db
      .delete(killSwitchSchema.killSwitches)
      .where(eq(killSwitchSchema.killSwitches.agentId, agentId));

    // 3. Set agent status to active
    await this.update(agentId, { status: 'active' });
  }
}
