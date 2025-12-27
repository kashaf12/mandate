import { Test, TestingModule } from '@nestjs/testing';
import { RulesService } from './rules.service';
import { PoliciesService } from '../policies/policies.service';
import { AgentsService } from '../agents/agents.service';
import { RuleEvaluatorService } from './rule-evaluator.service';
import * as schema from '../database/schema';

describe('RuleEvaluatorService', () => {
  let service: RuleEvaluatorService;
  let rulesService: jest.Mocked<RulesService>;
  let policiesService: jest.Mocked<PoliciesService>;
  let agentsService: jest.Mocked<AgentsService>;

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

  beforeEach(async () => {
    const mockRulesService = {
      findAllActive: jest.fn(),
    };

    const mockPoliciesService = {
      findOne: jest.fn(),
    };

    const mockAgentsService = {
      findOne: jest.fn(),
      findByIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleEvaluatorService,
        {
          provide: RulesService,
          useValue: mockRulesService,
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

    service = module.get<RuleEvaluatorService>(RuleEvaluatorService);
    rulesService = module.get(RulesService);
    policiesService = module.get(PoliciesService);
    agentsService = module.get(AgentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateContext', () => {
    it('should return matching policies and rules', async () => {
      const context = { user_tier: 'free', environment: 'production' };

      const mockRule: schema.Rule = {
        id: 'uuid-1',
        ruleId: 'rule-abc123',
        version: 1,
        name: 'Free Tier Rule',
        description: null,
        agentIds: null,
        matchMode: 'AND',
        conditions: [
          { field: 'user_tier', operator: '==', value: 'free' },
        ] as schema.Rule['conditions'],
        policyId: 'policy-abc123',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      agentsService.findOne.mockResolvedValue(mockAgent);
      rulesService.findAllActive.mockResolvedValue([mockRule]);
      policiesService.findOne.mockResolvedValue(mockPolicy);

      const result = await service.evaluateContext('agent-abc123', context);

      expect(result.policies).toHaveLength(1);
      expect(result.matchedRules).toHaveLength(1);
      expect(result.matchedRules[0].ruleId).toBe('rule-abc123');
      expect(result.policies[0].policyId).toBe('policy-abc123');
    });

    it('should filter by agent scope', async () => {
      const context = { user_tier: 'free' };

      const universalRule: schema.Rule = {
        id: 'uuid-1',
        ruleId: 'rule-universal',
        version: 1,
        name: 'Universal Rule',
        description: null,
        agentIds: null, // Universal rule
        matchMode: 'AND',
        conditions: [
          { field: 'user_tier', operator: '==', value: 'free' },
        ] as schema.Rule['conditions'],
        policyId: 'policy-abc123',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const scopedRule: schema.Rule = {
        id: 'uuid-2',
        ruleId: 'rule-scoped',
        version: 1,
        name: 'Scoped Rule',
        description: null,
        agentIds: ['agent-other'], // Different agent
        matchMode: 'AND',
        conditions: [
          { field: 'user_tier', operator: '==', value: 'free' },
        ] as schema.Rule['conditions'],
        policyId: 'policy-abc123',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      agentsService.findOne.mockResolvedValue(mockAgent);
      rulesService.findAllActive.mockResolvedValue([universalRule, scopedRule]);
      policiesService.findOne.mockResolvedValue(mockPolicy);

      const result = await service.evaluateContext('agent-abc123', context);

      // Should only match universal rule (scoped rule is for different agent)
      expect(result.matchedRules).toHaveLength(1);
      expect(result.matchedRules[0].ruleId).toBe('rule-universal');
    });

    it('should support AND match mode', async () => {
      const context = { user_tier: 'free', environment: 'production' };

      const andRule: schema.Rule = {
        id: 'uuid-1',
        ruleId: 'rule-and',
        version: 1,
        name: 'AND Rule',
        description: null,
        agentIds: null,
        matchMode: 'AND',
        conditions: [
          { field: 'user_tier', operator: '==', value: 'free' },
          { field: 'environment', operator: '==', value: 'production' },
        ] as schema.Rule['conditions'],
        policyId: 'policy-abc123',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      agentsService.findOne.mockResolvedValue(mockAgent);
      rulesService.findAllActive.mockResolvedValue([andRule]);
      policiesService.findOne.mockResolvedValue(mockPolicy);

      const result = await service.evaluateContext('agent-abc123', context);

      expect(result.matchedRules).toHaveLength(1);
    });

    it('should support OR match mode', async () => {
      const context = { user_tier: 'free' };

      const orRule: schema.Rule = {
        id: 'uuid-1',
        ruleId: 'rule-or',
        version: 1,
        name: 'OR Rule',
        description: null,
        agentIds: null,
        matchMode: 'OR',
        conditions: [
          { field: 'user_tier', operator: '==', value: 'free' },
          { field: 'user_tier', operator: '==', value: 'premium' },
        ] as schema.Rule['conditions'],
        policyId: 'policy-abc123',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      agentsService.findOne.mockResolvedValue(mockAgent);
      rulesService.findAllActive.mockResolvedValue([orRule]);
      policiesService.findOne.mockResolvedValue(mockPolicy);

      const result = await service.evaluateContext('agent-abc123', context);

      expect(result.matchedRules).toHaveLength(1);
    });

    it('should throw error if agent is inactive', async () => {
      const inactiveAgent = { ...mockAgent, status: 'inactive' };
      agentsService.findOne.mockResolvedValue(inactiveAgent);

      await expect(
        service.evaluateContext('agent-abc123', { user_tier: 'free' }),
      ).rejects.toThrow('Agent agent-abc123 is not active');
    });
  });

  describe('evaluateCondition', () => {
    it('should evaluate == operator correctly', () => {
      const condition = { field: 'user_tier', operator: '==', value: 'free' };
      const context = { user_tier: 'free' };

      // Access private method via type assertion for testing
      const result = (
        service as unknown as {
          evaluateCondition: (
            condition: { field: string; operator: string; value: string },
            context: Record<string, string>,
          ) => boolean;
        }
      ).evaluateCondition(condition, context);

      expect(result).toBe(true);
    });

    it('should evaluate != operator correctly', () => {
      const condition = {
        field: 'user_tier',
        operator: '!=',
        value: 'premium',
      };
      const context = { user_tier: 'free' };

      const result = (
        service as unknown as {
          evaluateCondition: (
            condition: { field: string; operator: string; value: string },
            context: Record<string, string>,
          ) => boolean;
        }
      ).evaluateCondition(condition, context);

      expect(result).toBe(true);
    });

    it('should return false for missing field (fail-closed)', () => {
      const condition = { field: 'user_tier', operator: '==', value: 'free' };
      const context = {}; // Missing field

      const result = (
        service as unknown as {
          evaluateCondition: (
            condition: { field: string; operator: string; value: string },
            context: Record<string, string>,
          ) => boolean;
        }
      ).evaluateCondition(condition, context);

      expect(result).toBe(false);
    });
  });
});
