import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { MandatesService } from './mandates.service';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { AgentsService } from '../agents/agents.service';
import { RuleEvaluatorService } from '../rules/rule-evaluator.service';
import { PolicyComposerService } from '../rules/policy-composer.service';
import { AuditService } from '../audit/audit.service';
import * as schema from '../database/schema';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

// Mock crypto utils
jest.mock('../common/utils/crypto.utils', () => ({
  generateMandateId: jest.fn(() => 'mnd-abc123'),
}));

describe('MandatesService', () => {
  let service: MandatesService;
  let mockDb: Partial<Database>;
  let mockAgentsService: jest.Mocked<AgentsService>;
  let mockRuleEvaluator: jest.Mocked<RuleEvaluatorService>;
  let mockPolicyComposer: jest.Mocked<PolicyComposerService>;
  let mockAuditService: jest.Mocked<AuditService>;

  const mockAgent: schema.Agent = {
    id: 'uuid-1',
    agentId: 'agent-abc123',
    apiKeyHash: 'hash',
    name: 'Test Agent',
    principal: null,
    environment: 'production',
    status: 'active',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPolicy: schema.Policy = {
    id: 'uuid-1',
    policyId: 'policy-abc123',
    version: 1,
    name: 'Test Policy',
    description: null,
    authority: {
      maxCostTotal: 1.0,
      allowedTools: ['web_search'],
    } as schema.Policy['authority'],
    active: true,
    createdAt: new Date(),
    createdBy: null,
  };

  const mockRule: schema.Rule = {
    id: 'uuid-1',
    ruleId: 'rule-abc123',
    version: 1,
    name: 'Test Rule',
    description: null,
    agentIds: null,
    matchMode: 'AND',
    conditions: [],
    policyId: 'policy-abc123',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockAgentsService = {
      findOne: jest.fn(),
      isKilled: jest.fn(),
    } as unknown as jest.Mocked<AgentsService>;

    mockRuleEvaluator = {
      evaluateContext: jest.fn(),
    } as unknown as jest.Mocked<RuleEvaluatorService>;

    mockPolicyComposer = {
      compose: jest.fn(),
    } as unknown as jest.Mocked<PolicyComposerService>;

    mockAuditService = {
      logMandateIssuance: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    mockDb = {
      insert: jest.fn(),
      select: jest.fn(),
    } as Partial<Database>;

    const mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MandatesService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
        {
          provide: RuleEvaluatorService,
          useValue: mockRuleEvaluator,
        },
        {
          provide: PolicyComposerService,
          useValue: mockPolicyComposer,
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

    service = module.get<MandatesService>(MandatesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('issue', () => {
    it('should issue a mandate successfully', async () => {
      const context = { user_tier: 'free', environment: 'production' };
      const effectiveAuthority = {
        maxCostTotal: 1.0,
        allowedTools: ['web_search'],
      };

      const mockMandate: schema.Mandate = {
        id: 'uuid-1',
        mandateId: 'mnd-abc123',
        agentId: 'agent-abc123',
        context,
        authority: effectiveAuthority as schema.Mandate['authority'],
        matchedRules: [
          { ruleId: 'rule-abc123', ruleVersion: 1 },
        ] as schema.Mandate['matchedRules'],
        appliedPolicies: [
          { policyId: 'policy-abc123', policyVersion: 1 },
        ] as schema.Mandate['appliedPolicies'],
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        version: 1,
      };

      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockRuleEvaluator.evaluateContext.mockResolvedValue({
        policies: [mockPolicy],
        matchedRules: [mockRule],
      });
      mockPolicyComposer.compose.mockReturnValue(effectiveAuthority);

      const mockReturning = jest.fn().mockResolvedValue([mockMandate]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      const result = await service.issue('agent-abc123', context);

      expect(result).toEqual(mockMandate);
      expect(result.mandateId).toBe('mnd-abc123');
      expect((mockAgentsService.findOne as jest.Mock).mock.calls).toEqual([
        ['agent-abc123'],
      ]);
      expect(
        (mockRuleEvaluator.evaluateContext as jest.Mock).mock.calls,
      ).toEqual([['agent-abc123', context]]);
      expect((mockPolicyComposer.compose as jest.Mock).mock.calls).toEqual([
        [[mockPolicy]],
      ]);
    });

    it('should throw ForbiddenException if agent is inactive', async () => {
      const inactiveAgent = { ...mockAgent, status: 'inactive' };
      mockAgentsService.findOne.mockResolvedValue(inactiveAgent);

      await expect(
        service.issue('agent-abc123', { user_tier: 'free' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if agent is killed', async () => {
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockAgentsService.isKilled.mockResolvedValue(true);

      await expect(
        service.issue('agent-abc123', { user_tier: 'free' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.issue('agent-abc123', { user_tier: 'free' }),
      ).rejects.toThrow('Agent is killed - mandate issuance blocked');
    });

    it('should set expiration to 5 minutes from now', async () => {
      const context = { user_tier: 'free' };
      const effectiveAuthority = { maxCostTotal: 1.0 };

      const now = new Date();
      const expectedExpiresAt = new Date(now.getTime() + 5 * 60 * 1000);

      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockAgentsService.isKilled.mockResolvedValue(false);
      mockRuleEvaluator.evaluateContext.mockResolvedValue({
        policies: [mockPolicy],
        matchedRules: [mockRule],
      });
      mockPolicyComposer.compose.mockReturnValue(effectiveAuthority);
      mockAuditService.logMandateIssuance.mockResolvedValue(undefined);

      const mockReturning = jest.fn().mockResolvedValue([
        {
          id: 'uuid-1',
          mandateId: 'mnd-abc123',
          agentId: 'agent-abc123',
          context,
          authority: effectiveAuthority,
          matchedRules: [],
          appliedPolicies: [],
          issuedAt: now,
          expiresAt: expectedExpiresAt,
          version: 1,
        },
      ]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      await service.issue('agent-abc123', context);

      const mockCall = mockValues.mock.calls[0] as
        | [{ expiresAt: Date }]
        | undefined;
      const valuesCall = (mockCall?.[0] as { expiresAt: Date }) || {
        expiresAt: new Date(),
      };
      const expiresAt = valuesCall.expiresAt;
      const timeDiff = expiresAt.getTime() - now.getTime();

      // Use toBeCloseTo to handle timing differences (allow 100ms variance)
      expect(timeDiff).toBeCloseTo(5 * 60 * 1000, -2); // 5 minutes, within 100ms
    });
  });

  describe('findOne', () => {
    it('should return mandate by ID', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      const mockMandate: schema.Mandate = {
        id: 'uuid-1',
        mandateId: 'mnd-abc123',
        agentId: 'agent-abc123',
        context: {},
        authority: {} as schema.Mandate['authority'],
        matchedRules: [] as schema.Mandate['matchedRules'],
        appliedPolicies: [] as schema.Mandate['appliedPolicies'],
        issuedAt: new Date(),
        expiresAt: futureDate,
        version: 1,
      };

      const mockLimit = jest.fn().mockResolvedValue([mockMandate]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findOne('mnd-abc123');

      expect(result).toEqual(mockMandate);
    });

    it('should throw NotFoundException when mandate not found', async () => {
      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      await expect(service.findOne('mnd-nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when mandate expired', async () => {
      const pastDate = new Date(Date.now() - 1000);
      const mockMandate: schema.Mandate = {
        id: 'uuid-1',
        mandateId: 'mnd-abc123',
        agentId: 'agent-abc123',
        context: {},
        authority: {} as schema.Mandate['authority'],
        matchedRules: [] as schema.Mandate['matchedRules'],
        appliedPolicies: [] as schema.Mandate['appliedPolicies'],
        issuedAt: new Date(),
        expiresAt: pastDate,
        version: 1,
      };

      const mockLimit = jest.fn().mockResolvedValue([mockMandate]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      await expect(service.findOne('mnd-abc123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByAgentAndContext', () => {
    it('should return matching mandate if found', async () => {
      const context = { user_tier: 'free' };
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      const mockMandate: schema.Mandate = {
        id: 'uuid-1',
        mandateId: 'mnd-abc123',
        agentId: 'agent-abc123',
        context,
        authority: {} as schema.Mandate['authority'],
        matchedRules: [] as unknown as schema.Mandate['matchedRules'],
        appliedPolicies: [] as unknown as schema.Mandate['appliedPolicies'],
        issuedAt: new Date(),
        expiresAt: futureDate,
        version: 1,
      };

      const mockWhere = jest.fn().mockResolvedValue([mockMandate]);
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findByAgentAndContext(
        'agent-abc123',
        context,
      );

      expect(result).toEqual(mockMandate);
    });

    it('should return null if no matching mandate found', async () => {
      const mockWhere = jest.fn().mockResolvedValue([]);
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findByAgentAndContext('agent-abc123', {
        user_tier: 'free',
      });

      expect(result).toBeNull();
    });

    it('should return null if context does not match', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      const mockMandate: schema.Mandate = {
        id: 'uuid-1',
        mandateId: 'mnd-abc123',
        agentId: 'agent-abc123',
        context: { user_tier: 'premium' }, // Different context
        authority: {} as schema.Mandate['authority'],
        matchedRules: [] as unknown as schema.Mandate['matchedRules'],
        appliedPolicies: [] as unknown as schema.Mandate['appliedPolicies'],
        issuedAt: new Date(),
        expiresAt: futureDate,
        version: 1,
      };

      const mockWhere = jest.fn().mockResolvedValue([mockMandate]);
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findByAgentAndContext('agent-abc123', {
        user_tier: 'free',
      });

      expect(result).toBeNull();
    });
  });
});
