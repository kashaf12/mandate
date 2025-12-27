import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import {
  generateAgentId,
  generateApiKey,
  hashApiKey,
} from '../common/utils/crypto.utils';

@Injectable()
export class AgentsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
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
}
