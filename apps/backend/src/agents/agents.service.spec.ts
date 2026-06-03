import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
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
      };

      const mockAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-abc123',
        apiKeyHash: 'hashed-sk-test-api-key-123',
        name: 'Test Agent',
        principal: 'test@example.com',
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
      };

      const mockUpdatedAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-abc123',
        apiKeyHash: 'hash',
        name: 'Updated Name',
        principal: null,
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

  describe('setStatus', () => {
    const agentId = 'agent-123';

    const createMockAgent = (status: 'active' | 'inactive'): schema.Agent => ({
      id: 'uuid-123',
      agentId: 'agent-123',
      apiKeyHash: 'hash',
      name: 'Test Agent',
      principal: null,
      status,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('should return agent without update if status already matches (idempotent)', async () => {
      const mockAgent = createMockAgent('active');

      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.setStatus(agentId, 'active');

      expect(result).toEqual(mockAgent);
      expect(result.status).toBe('active');
      // Verify update was NOT called (idempotent)
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should update status from inactive to active', async () => {
      const mockAgent = createMockAgent('inactive');
      const updatedAgent = createMockAgent('active');

      // Mock findOne
      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      // Mock isKilled check (no kill switch)
      const mockKillSwitchLimit = jest.fn().mockResolvedValue([]);
      const mockKillSwitchWhere = jest.fn().mockReturnValue({
        limit: mockKillSwitchLimit,
      });
      const mockKillSwitchFrom = jest.fn().mockReturnValue({
        where: mockKillSwitchWhere,
      });

      // Mock update
      const mockReturning = jest.fn().mockResolvedValue([updatedAgent]);
      const mockWhereUpdate = jest.fn().mockReturnValue({
        returning: mockReturning,
      });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhereUpdate });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      // Setup isKilled mock
      (mockDb.select as jest.Mock)
        .mockReturnValueOnce({ from: mockFrom }) // first call: findOne
        .mockReturnValueOnce({ from: mockKillSwitchFrom }); // second call: isKilled

      const result = await service.setStatus(agentId, 'active');

      expect(result.status).toBe('active');
      expect(mockDb.update).toHaveBeenCalledWith(schema.agents);
      expect(mockSet).toHaveBeenCalledWith({
        status: 'active',
        updatedAt: expect.any(Date) as Date,
      });
    });

    it('should update status from active to inactive', async () => {
      const mockAgent = createMockAgent('active');
      const updatedAgent = createMockAgent('inactive');

      // Mock findOne
      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      // Mock update (no kill switch check for inactive)
      const mockReturning = jest.fn().mockResolvedValue([updatedAgent]);
      const mockWhereUpdate = jest.fn().mockReturnValue({
        returning: mockReturning,
      });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhereUpdate });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      const result = await service.setStatus(agentId, 'inactive');

      expect(result.status).toBe('inactive');
      expect(mockDb.update).toHaveBeenCalledWith(schema.agents);
      expect(mockSet).toHaveBeenCalledWith({
        status: 'inactive',
        updatedAt: expect.any(Date) as Date,
      });
    });

    it('should throw BadRequestException when activating agent with kill switch', async () => {
      const mockAgent = createMockAgent('inactive');

      // Mock findOne (called by setStatus)
      const mockLimit1 = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere1 = jest.fn().mockReturnValue({ limit: mockLimit1 });
      const mockFrom1 = jest.fn().mockReturnValue({ where: mockWhere1 });

      // Mock isKilled check (kill switch exists)
      const mockKillSwitch = {
        agentId: 'agent-123',
        killedAt: new Date(),
        reason: 'Test',
        killedBy: 'admin@example.com',
      };
      const mockKillSwitchLimit = jest.fn().mockResolvedValue([mockKillSwitch]);
      const mockKillSwitchWhere = jest.fn().mockReturnValue({
        limit: mockKillSwitchLimit,
      });
      const mockKillSwitchFrom = jest.fn().mockReturnValue({
        where: mockKillSwitchWhere,
      });

      // Setup mocks: findOne first, then isKilled
      (mockDb.select as jest.Mock)
        .mockReturnValueOnce({ from: mockFrom1 }) // first call: findOne in setStatus
        .mockReturnValueOnce({ from: mockKillSwitchFrom }); // second call: isKilled in setStatus

      // Expect BadRequestException with specific message
      await expect(service.setStatus(agentId, 'active')).rejects.toThrow(
        new BadRequestException(
          'Cannot activate agent with active kill switch. Use POST /agents/:agentId/resurrect to remove kill switch first.',
        ),
      );

      // Verify update was NOT called
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should allow setting inactive when kill switch exists', async () => {
      const mockAgent = createMockAgent('active');
      const updatedAgent = createMockAgent('inactive');

      // Mock findOne
      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      // Mock update (kill switch check not performed for inactive)
      const mockReturning = jest.fn().mockResolvedValue([updatedAgent]);
      const mockWhereUpdate = jest.fn().mockReturnValue({
        returning: mockReturning,
      });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhereUpdate });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      const result = await service.setStatus(agentId, 'inactive');

      expect(result.status).toBe('inactive');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException if agent not found', async () => {
      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      await expect(
        service.setStatus('agent-nonexistent', 'active'),
      ).rejects.toThrow(NotFoundException);
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
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock findOne (called once by kill, once by setStatus)
      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });

      // Mock isKilled (returns false - not already killed)
      const mockKillSwitchLimit = jest.fn().mockResolvedValue([]);
      const mockKillSwitchWhere = jest.fn().mockReturnValue({
        limit: mockKillSwitchLimit,
      });
      const mockKillSwitchFrom = jest.fn().mockReturnValue({
        where: mockKillSwitchWhere,
      });

      // Setup select mock to handle multiple calls
      (mockDb.select as jest.Mock)
        .mockReturnValueOnce({ from: mockFrom }) // findOne
        .mockReturnValueOnce({ from: mockKillSwitchFrom }) // isKilled
        .mockReturnValueOnce({ from: mockFrom }); // setStatus -> findOne

      // Mock insert kill switch (no longer uses onConflictDoUpdate)
      const mockValues = jest.fn().mockResolvedValue([]);
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      // Mock update agent (called by setStatus)
      const updatedAgent = { ...mockAgent, status: 'inactive' as const };
      const mockReturning = jest.fn().mockResolvedValue([updatedAgent]);
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

    it('should throw ConflictException if agent is already killed', async () => {
      const agentId = 'agent-123';
      const dto: KillAgentDto = {
        reason: 'Another reason',
        killedBy: 'admin@example.com',
      };

      const mockAgent: schema.Agent = {
        id: 'uuid-123',
        agentId: 'agent-123',
        apiKeyHash: 'hash',
        name: 'Test Agent',
        principal: null,
        status: 'inactive',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock findOne
      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });

      // Mock isKilled (returns true - already killed)
      const existingKillSwitch = {
        agentId,
        killedAt: new Date('2024-01-01T00:00:00Z'),
        reason: 'Original reason',
        killedBy: 'original@example.com',
      };
      const mockKillSwitchLimit = jest
        .fn()
        .mockResolvedValue([existingKillSwitch]);
      const mockKillSwitchWhere = jest.fn().mockReturnValue({
        limit: mockKillSwitchLimit,
      });
      const mockKillSwitchFrom = jest.fn().mockReturnValue({
        where: mockKillSwitchWhere,
      });

      // Setup select mock - provide mocks for both test calls
      (mockDb.select as jest.Mock)
        .mockReturnValueOnce({ from: mockFrom }) // findOne (first call)
        .mockReturnValueOnce({ from: mockKillSwitchFrom }) // isKilled (first call)
        .mockReturnValueOnce({ from: mockFrom }) // findOne (second call)
        .mockReturnValueOnce({ from: mockKillSwitchFrom }); // isKilled (second call)

      await expect(service.kill(agentId, dto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.kill(agentId, dto)).rejects.toThrow(
        'Agent agent-123 is already killed.',
      );

      // Verify insert was NOT called
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockLogKillSwitch).not.toHaveBeenCalled();
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
        status: 'inactive',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock findOne chain (used by both resurrect and setStatus)
      const mockLimit = jest.fn().mockResolvedValue([mockAgent]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });

      // Mock delete kill switch
      const mockWhereDelete = jest.fn().mockResolvedValue([]);
      (mockDb.delete as jest.Mock).mockReturnValue({
        where: mockWhereDelete,
      });

      // Mock isKilled check (called by setStatus when activating)
      const mockKillSwitchLimit = jest.fn().mockResolvedValue([]);
      const mockKillSwitchWhere = jest.fn().mockReturnValue({
        limit: mockKillSwitchLimit,
      });
      const mockKillSwitchFrom = jest.fn().mockReturnValue({
        where: mockKillSwitchWhere,
      });

      // Mock update agent (called by setStatus)
      const updatedAgent = { ...mockAgent, status: 'active' as const };
      const mockReturning = jest.fn().mockResolvedValue([updatedAgent]);
      const mockWhereUpdate = jest.fn().mockReturnValue({
        returning: mockReturning,
      });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhereUpdate });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      // Setup select mocks:
      // 1. findOne in resurrect()
      // 2. findOne in setStatus()
      // 3. isKilled check in setStatus()
      (mockDb.select as jest.Mock)
        .mockReturnValueOnce({ from: mockFrom }) // resurrect findOne
        .mockReturnValueOnce({ from: mockFrom }) // setStatus findOne
        .mockReturnValueOnce({ from: mockKillSwitchFrom }); // setStatus isKilled

      await service.resurrect(agentId);

      expect(mockDb.delete).toHaveBeenCalledWith(killSwitchSchema.killSwitches);
      expect(mockDb.update).toHaveBeenCalledWith(schema.agents);
    });
  });
});
