import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RulesService } from './rules.service';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { PoliciesService } from '../policies/policies.service';
import { AgentsService } from '../agents/agents.service';
import * as schema from '../database/schema';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

// Mock crypto utils
jest.mock('../common/utils/crypto.utils', () => ({
  generateRuleId: jest.fn(() => 'rule-abc123'),
}));

describe('RulesService', () => {
  let service: RulesService;
  let mockDb: Partial<Database>;
  let mockPoliciesService: jest.Mocked<PoliciesService>;
  let mockAgentsService: jest.Mocked<AgentsService>;

  beforeEach(async () => {
    mockPoliciesService = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<PoliciesService>;

    mockAgentsService = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<AgentsService>;

    mockDb = {
      insert: jest.fn(),
      select: jest.fn(),
      update: jest.fn(),
    } as Partial<Database>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RulesService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
        {
          provide: PoliciesService,
          useValue: mockPoliciesService,
        },
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
      ],
    }).compile();

    service = module.get<RulesService>(RulesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a rule with version 1', async () => {
      const createDto: CreateRuleDto = {
        name: 'Test Rule',
        conditions: [{ field: 'user_tier', operator: '==', value: 'free' }],
        policyId: 'policy-abc123',
      };

      const mockPolicy: schema.Policy = {
        id: 'uuid-1',
        policyId: 'policy-abc123',
        version: 1,
        name: 'Test Policy',
        description: null,
        authority: {} as schema.Policy['authority'],
        active: true,
        createdAt: new Date(),
        createdBy: null,
      };

      const mockRule: schema.Rule = {
        id: 'uuid-123',
        ruleId: 'rule-abc123',
        version: 1,
        name: 'Test Rule',
        description: null,
        agentIds: null,
        matchMode: 'AND',
        conditions: createDto.conditions as schema.Rule['conditions'],
        policyId: 'policy-abc123',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPoliciesService.findOne.mockResolvedValue(mockPolicy);

      const mockReturning = jest.fn().mockResolvedValue([mockRule]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      const result = await service.create(createDto);

      expect(result).toEqual(mockRule);
      expect(result.version).toBe(1);
      expect((mockPoliciesService.findOne as jest.Mock).mock.calls).toEqual([
        ['policy-abc123'],
      ]);
      expect((mockDb.insert as jest.Mock).mock.calls).toEqual([[schema.rules]]);
    });

    it('should throw BadRequestException if policy not found', async () => {
      const createDto: CreateRuleDto = {
        name: 'Test Rule',
        conditions: [{ field: 'user_tier', operator: '==', value: 'free' }],
        policyId: 'policy-nonexistent',
      };

      mockPoliciesService.findOne.mockRejectedValue(
        new NotFoundException('Policy not found'),
      );

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate agents exist if agentIds provided', async () => {
      const createDto: CreateRuleDto = {
        name: 'Test Rule',
        conditions: [{ field: 'user_tier', operator: '==', value: 'free' }],
        policyId: 'policy-abc123',
        agentIds: ['agent-1', 'agent-2'],
      };

      const mockPolicy: schema.Policy = {
        id: 'uuid-1',
        policyId: 'policy-abc123',
        version: 1,
        name: 'Test Policy',
        description: null,
        authority: {} as schema.Policy['authority'],
        active: true,
        createdAt: new Date(),
        createdBy: null,
      };

      const mockAgent: schema.Agent = {
        id: 'uuid-1',
        agentId: 'agent-1',
        apiKeyHash: 'hash',
        name: 'Agent 1',
        principal: null,
        environment: 'production',
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPoliciesService.findOne.mockResolvedValue(mockPolicy);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);

      const mockReturning = jest.fn().mockResolvedValue([
        {
          id: 'uuid-123',
          ruleId: 'rule-abc123',
          version: 1,
          name: 'Test Rule',
          agentIds: ['agent-1', 'agent-2'],
        },
      ]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      await service.create(createDto);

      expect((mockAgentsService.findOne as jest.Mock).mock.calls.length).toBe(
        2,
      );
    });
  });

  describe('findOne', () => {
    it('should return latest active version of rule', async () => {
      const mockRule: schema.Rule = {
        id: 'uuid-123',
        ruleId: 'rule-abc123',
        version: 2,
        name: 'Test Rule',
        description: null,
        agentIds: null,
        matchMode: 'AND',
        conditions: [] as schema.Rule['conditions'],
        policyId: 'policy-abc123',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockLimit = jest.fn().mockResolvedValue([mockRule]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findOne('rule-abc123');

      expect(result).toEqual(mockRule);
      expect(result.version).toBe(2);
    });

    it('should throw NotFoundException when rule not found', async () => {
      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      await expect(service.findOne('rule-nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should create new version and deactivate old version', async () => {
      const updateDto: UpdateRuleDto = {
        description: 'Updated description',
      };

      const currentRule: schema.Rule = {
        id: 'uuid-1',
        ruleId: 'rule-abc123',
        version: 1,
        name: 'Test Rule',
        description: 'Old description',
        agentIds: null,
        matchMode: 'AND',
        conditions: [] as schema.Rule['conditions'],
        policyId: 'policy-abc123',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const newRule: schema.Rule = {
        id: 'uuid-2',
        ruleId: 'rule-abc123',
        version: 2,
        name: 'Test Rule',
        description: 'Updated description',
        agentIds: null,
        matchMode: 'AND',
        conditions: [] as schema.Rule['conditions'],
        policyId: 'policy-abc123',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock findOne (current version)
      const mockLimit = jest.fn().mockResolvedValue([currentRule]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      // Mock update (deactivate old)
      const mockSet = jest.fn().mockReturnValue({ where: jest.fn() });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      // Mock insert (new version)
      const mockReturning = jest.fn().mockResolvedValue([newRule]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      const result = await service.update('rule-abc123', updateDto);

      expect(result.version).toBe(2);
      expect(result.description).toBe('Updated description');
      expect((mockDb.update as jest.Mock).mock.calls.length).toBeGreaterThan(0); // Deactivate old
      expect((mockDb.insert as jest.Mock).mock.calls.length).toBeGreaterThan(0); // Create new
    });
  });

  describe('remove', () => {
    it('should soft delete rule', async () => {
      const mockReturning = jest.fn().mockResolvedValue([
        {
          id: 'uuid-123',
          ruleId: 'rule-abc123',
          version: 1,
        },
      ]);
      const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      await service.remove('rule-abc123');

      expect((mockDb.update as jest.Mock).mock.calls).toEqual([[schema.rules]]);
      expect(mockSet.mock.calls).toEqual([[{ active: false }]]);
    });
  });
});
