import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import * as killSwitchSchema from '../database/schemas/kill-switches';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { KillAgentDto } from './dto/kill-agent.dto';
import { AuditService } from '../audit/audit.service';
import { hashApiKey } from '../common/utils/crypto.utils';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

// Mock crypto utils
jest.mock('../common/utils/crypto.utils', () => ({
  generateAgentId: jest.fn(() => 'agent-abc123'),
  generateApiKey: jest.fn(() => 'sk-test-api-key-123'),
  hashApiKey: jest.fn((key: string) => `hashed-${key}`),
}));

describe('AgentsService', () => {
  let service: AgentsService;
  let mockDb: Partial<Database>;
  let mockAuditService: jest.Mocked<AuditService>;
  let mockLogKillSwitch: jest.Mock;

  beforeEach(async () => {
    // Mock database with proper Drizzle ORM method chaining
    // Drizzle uses method chaining: db.insert().values().returning()
    const createInsertChain = () => ({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([]),
        onConflictDoUpdate: jest.fn().mockResolvedValue([]),
      }),
    });

    const createSelectChain = () => ({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    });

    const createUpdateChain = () => ({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      }),
    });

    const createDeleteChain = () => ({
      where: jest.fn().mockResolvedValue([]),
    });

    mockDb = {
      insert: jest.fn().mockReturnValue(createInsertChain()),
      select: jest.fn().mockReturnValue(createSelectChain()),
      update: jest.fn().mockReturnValue(createUpdateChain()),
      delete: jest.fn().mockReturnValue(createDeleteChain()),
    } as Partial<Database>;

    mockLogKillSwitch = jest.fn().mockResolvedValue(undefined);
    mockAuditService = {
      logKillSwitch: mockLogKillSwitch,
      create: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;

    const mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an agent and return agent with API key', async () => {
      const createDto: CreateAgentDto = {
        name: 'Test Agent',
        principal: 'test@example.com',
        environment: 'production',
      };

      const mockAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-abc123',
        apiKeyHash: 'hashed-sk-test-api-key-123',
        name: 'Test Agent',
        principal: 'test@example.com',
        environment: 'production',
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Setup mock chain for insert
      const mockReturning = jest.fn().mockResolvedValue([mockAgent]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      const result = await service.create(createDto);

      expect(result.agent).toEqual(mockAgent);
      expect(result.apiKey).toBe('sk-test-api-key-123');
      expect(mockDb.insert).toHaveBeenCalledWith(schema.agents);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-abc123',
          apiKeyHash: 'hashed-sk-test-api-key-123',
          name: 'Test Agent',
          principal: 'test@example.com',
          environment: 'production',
        }),
      );
    });

    it('should use default environment if not provided', async () => {
      const createDto: CreateAgentDto = {
        name: 'Test Agent',
      };

      const mockAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-abc123',
        apiKeyHash: 'hashed-sk-test-api-key-123',
        name: 'Test Agent',
        principal: null,
        environment: 'development',
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockReturning = jest.fn().mockResolvedValue([mockAgent]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      await service.create(createDto);

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'development',
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return agent by agentId', async () => {
      const mockAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-abc123',
        apiKeyHash: 'hashed-key',
        name: 'Test Agent',
        principal: null,
        environment: 'production',
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findOne('agent-abc123');

      expect(result).toEqual(mockAgent);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(schema.agents);
      expect(mockLimit).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if agent not found', async () => {
      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      await expect(service.findOne('agent-nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('agent-nonexistent')).rejects.toThrow(
        'Agent agent-nonexistent not found',
      );
    });
  });

  describe('findByApiKey', () => {
    it('should return agent by API key', async () => {
      const apiKey = 'sk-test-key';
      const mockAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-abc123',
        apiKeyHash: hashApiKey(apiKey),
        name: 'Test Agent',
        principal: null,
        environment: 'production',
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findByApiKey(apiKey);

      expect(result).toEqual(mockAgent);
      expect(hashApiKey).toHaveBeenCalledWith(apiKey);
    });

    it('should throw NotFoundException if API key not found', async () => {
      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      await expect(service.findByApiKey('sk-invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if agent is inactive', async () => {
      const apiKey = 'sk-test-key';
      const mockAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-abc123',
        apiKeyHash: hashApiKey(apiKey),
        name: 'Test Agent',
        principal: null,
        environment: 'production',
        status: 'inactive',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      await expect(service.findByApiKey(apiKey)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByIds', () => {
    it('should return agents by IDs', async () => {
      const agentIds = ['agent-1', 'agent-2'];
      const mockAgents: schema.Agent[] = [
        {
          id: 'uuid-1',
          agentId: 'agent-1',
          apiKeyHash: 'hash-1',
          name: 'Agent 1',
          principal: null,
          environment: 'production',
          status: 'active',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'uuid-2',
          agentId: 'agent-2',
          apiKeyHash: 'hash-2',
          name: 'Agent 2',
          principal: null,
          environment: 'production',
          status: 'active',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockWhere = jest.fn().mockResolvedValue(mockAgents);
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findByIds(agentIds);

      expect(result).toEqual(mockAgents);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(schema.agents);
      expect(mockWhere).toHaveBeenCalled();
    });

    it('should return empty array if no IDs provided', async () => {
      const result = await service.findByIds([]);

      expect(result).toEqual([]);
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all agents', async () => {
      const mockAgents: schema.Agent[] = [
        {
          id: 'uuid-1',
          agentId: 'agent-1',
          apiKeyHash: 'hash-1',
          name: 'Agent 1',
          principal: null,
          environment: 'production',
          status: 'active',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockFrom = jest.fn().mockResolvedValue(mockAgents);
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findAll();

      expect(result).toEqual(mockAgents);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(schema.agents);
    });
  });

  describe('update', () => {
    it('should update agent and return updated agent', async () => {
      const agentId = 'agent-abc123';
      const updateDto: UpdateAgentDto = {
        name: 'Updated Name',
        status: 'inactive',
      };

      const mockUpdatedAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-abc123',
        apiKeyHash: 'hash',
        name: 'Updated Name',
        principal: null,
        environment: 'production',
        status: 'inactive',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockReturning = jest.fn().mockResolvedValue([mockUpdatedAgent]);
      const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      const result = await service.update(agentId, updateDto);

      expect(result).toEqual(mockUpdatedAgent);
      expect(mockDb.update).toHaveBeenCalledWith(schema.agents);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Name',
          status: 'inactive',
          updatedAt: expect.any(Date) as Date,
        }) as Record<string, unknown>,
      );
    });

    it('should throw NotFoundException if agent not found', async () => {
      const mockReturning = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      await expect(
        service.update('agent-nonexistent', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete agent (set status to inactive)', async () => {
      const agentId = 'agent-abc123';
      const mockAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-abc123',
        apiKeyHash: 'hash',
        name: 'Test Agent',
        principal: null,
        environment: 'production',
        status: 'inactive',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockReturning = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      await service.remove(agentId);

      expect(mockDb.update).toHaveBeenCalledWith(schema.agents);
      expect(mockSet).toHaveBeenCalledWith({ status: 'inactive' });
    });

    it('should throw NotFoundException if agent not found', async () => {
      const mockReturning = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      await expect(service.remove('agent-nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('kill', () => {
    it('should kill agent', async () => {
      const agentId = 'agent-123';
      const dto: KillAgentDto = {
        reason: 'Runaway cost',
        killedBy: 'admin@example.com',
      };

      const mockAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-123',
        apiKeyHash: 'hash',
        name: 'Test Agent',
        principal: null,
        environment: 'production',
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock findOne
      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      // Mock insert kill switch
      const mockOnConflict = jest.fn().mockResolvedValue([]);
      const mockValues = jest.fn().mockReturnValue({
        onConflictDoUpdate: mockOnConflict,
      });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      // Mock update agent
      const mockReturning = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhereUpdate = jest.fn().mockReturnValue({
        returning: mockReturning,
      });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhereUpdate });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      await service.kill(agentId, dto);

      expect(mockDb.insert).toHaveBeenCalledWith(killSwitchSchema.killSwitches);
      expect(mockLogKillSwitch).toHaveBeenCalledWith(
        agentId,
        dto.reason,
        dto.killedBy,
      );
    });
  });

  describe('isKilled', () => {
    it('should return true if agent is killed', async () => {
      const agentId = 'agent-123';
      const mockKillSwitch = {
        agentId: 'agent-123',
        killedAt: new Date(),
        reason: 'Test',
        killedBy: 'admin@example.com',
      };

      const mockLimit = jest.fn().mockResolvedValue([mockKillSwitch]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.isKilled(agentId);

      expect(result).toBe(true);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return false if agent is not killed', async () => {
      const agentId = 'agent-123';

      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.isKilled(agentId);

      expect(result).toBe(false);
    });
  });

  describe('getKillStatus', () => {
    it('should return kill status when killed', async () => {
      const agentId = 'agent-123';
      const mockKillSwitch = {
        agentId: 'agent-123',
        killedAt: new Date('2025-12-27T15:00:00Z'),
        reason: 'Test',
        killedBy: 'admin@example.com',
      };

      const mockLimit = jest.fn().mockResolvedValue([mockKillSwitch]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.getKillStatus(agentId);

      expect(result.is_killed).toBe(true);
      expect(result.reason).toBe('Test');
      expect(result.killed_by).toBe('admin@example.com');
    });

    it('should return not killed when no kill switch exists', async () => {
      const agentId = 'agent-123';

      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.getKillStatus(agentId);

      expect(result.is_killed).toBe(false);
    });
  });

  describe('resurrect', () => {
    it('should remove kill switch and activate agent', async () => {
      const agentId = 'agent-123';
      const mockAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-123',
        apiKeyHash: 'hash',
        name: 'Test Agent',
        principal: null,
        environment: 'production',
        status: 'inactive',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock findOne
      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      // Mock delete kill switch
      const mockWhereDelete = jest.fn().mockResolvedValue([]);
      (mockDb.delete as jest.Mock).mockReturnValue({
        where: mockWhereDelete,
      });

      // Mock update agent
      const mockReturning = jest
        .fn()
        .mockResolvedValue([{ ...mockAgent, status: 'active' }]);
      const mockWhereUpdate = jest.fn().mockReturnValue({
        returning: mockReturning,
      });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhereUpdate });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      await service.resurrect(agentId);

      expect(mockDb.delete).toHaveBeenCalledWith(killSwitchSchema.killSwitches);
      expect(mockDb.update).toHaveBeenCalledWith(schema.agents);
    });
  });
});
