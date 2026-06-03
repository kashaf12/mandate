import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  forwardRef,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { eq, inArray } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import * as killSwitchSchema from '../database/schemas/kill-switches';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { KillAgentDto } from './dto/kill-agent.dto';
import { KillStatusResponseDto } from './dto/kill-status-response.dto';
import { generateAgentId } from '../common/utils/crypto.utils'; // REMOVED: generateApiKey, hashApiKey
import { extractErrorInfo } from '../common/utils/error.utils';
import { AuditService } from '../audit/audit.service';
import { OrganizationsService } from '../organizations/organizations.service'; // NEW

@Injectable()
export class AgentsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    @Inject(forwardRef(() => AuditService))
    private auditService: AuditService,
    private organizationsService: OrganizationsService, // NEW
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  /**
   * Create new agent within an organization
   *
   * CHANGED: Now requires orgId parameter (from authenticated request)
   * REMOVED: apiKey generation (agents no longer have individual keys)
   */
  async create(
    orgId: string,
    createAgentDto: CreateAgentDto,
  ): Promise<schema.Agent> {
    try {
      // 1. Verify org exists (will throw if not)
      await this.organizationsService.findByOrgId(orgId);

      // 2. Generate agent ID
      const agentId = generateAgentId();

      // 3. Create agent (NO API KEY)
      const [agent] = await this.db
        .insert(schema.agents)
        .values({
          agentId,
          orgId, // NEW: Agent belongs to org
          name: createAgentDto.name,
          principal: createAgentDto.principal,
          metadata: createAgentDto.metadata || {},
        })
        .returning();

      this.logger.info('Agent created', {
        agentId,
        orgId,
        name: createAgentDto.name,
        principal: createAgentDto.principal,
      });

      return agent;
    } catch (error) {
      const { message, stack } = extractErrorInfo(error);
      this.logger.error('Failed to create agent', {
        error: message,
        stack,
        createAgentDto: {
          name: createAgentDto.name,
          principal: createAgentDto.principal,
        },
      });
      throw error;
    }
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

  /**
   * REMOVED METHOD: findByApiKey()
   *
   * This method is now handled by ApiKeysService.findByApiKey()
   * API keys are no longer agent-specific.
   */

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

  /**
   * Set agent status (idempotent).
   * If status is already set to the desired value, returns agent without update.
   * Prevents activating agent with active kill switch.
   */
  async setStatus(
    agentId: string,
    status: 'active' | 'inactive',
  ): Promise<schema.Agent> {
    const agent = await this.findOne(agentId);

    if (agent.status === status) {
      return agent;
    }

    // Validation: prevent activating agent with kill switch
    if (status === 'active') {
      const isKilled = await this.isKilled(agentId);
      if (isKilled) {
        throw new BadRequestException(
          'Cannot activate agent with active kill switch. Use POST /agents/:agentId/resurrect to remove kill switch first.',
        );
      }
    }

    // Update status
    const [updatedAgent] = await this.db
      .update(schema.agents)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(schema.agents.agentId, agentId))
      .returning();

    if (!updatedAgent) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }

    return updatedAgent;
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
    // 1. Check if agent exists
    await this.findOne(agentId);

    // 2. Check if already killed
    const isAlreadyKilled = await this.isKilled(agentId);
    if (isAlreadyKilled) {
      throw new ConflictException(`Agent ${agentId} is already killed.`);
    }

    // 3. Proceed with kill (only if not already killed)
    await this.db.insert(killSwitchSchema.killSwitches).values({
      agentId,
      reason: dto.reason,
      killedBy: dto.killedBy,
    });

    // 4. Mark agent inactive
    await this.setStatus(agentId, 'inactive');

    // 5. Audit log (will get orgId from agent)
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
    try {
      // Check if agent exists
      await this.findOne(agentId);

      await this.db
        .delete(killSwitchSchema.killSwitches)
        .where(eq(killSwitchSchema.killSwitches.agentId, agentId));

      await this.setStatus(agentId, 'active');

      // Audit log (will get orgId from agent)
      await this.auditService.logResurrect(agentId);
    } catch (error) {
      const { message, stack } = extractErrorInfo(error);
      this.logger.error('Failed to resurrect agent', {
        error: message,
        stack,
        agentId,
      });
      throw error;
    }
  }
}
