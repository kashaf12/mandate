import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MandatesController } from './mandates.controller';
import { MandatesService } from './mandates.service';
import { AgentsService } from '../agents/agents.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { IssueMandateDto } from './dto/issue-mandate.dto';
import * as schema from '../database/schema';
import { Request } from 'express';
import { Agent } from '../database/schema';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

describe('MandatesController', () => {
  let controller: MandatesController;
  let mockMandatesService: {
    issue: jest.Mock;
    findOne: jest.Mock;
  };
  let mockAgentsService: {
    findByApiKey: jest.Mock;
  };

  const mockAgent: Agent = {
    id: 'uuid-agent-abc123',
    agentId: 'agent-abc123',
    apiKeyHash: 'hashed-key',
    name: 'Test Agent',
    principal: 'test@example.com',
    environment: 'production',
    status: 'active',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockOtherAgent: Agent = {
    ...mockAgent,
    id: 'uuid-agent-other',
    agentId: 'agent-other',
    name: 'Other Agent',
  };

  const mockMandate: schema.Mandate = {
    id: 'uuid-1',
    mandateId: 'mnd-abc123',
    agentId: 'agent-abc123',
    context: { user_tier: 'free' },
    authority: {
      maxCostTotal: 1.0,
      allowedTools: ['web_search'],
    } as schema.Mandate['authority'],
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

  beforeEach(async () => {
    mockMandatesService = {
      issue: jest.fn(),
      findOne: jest.fn(),
    };

    mockAgentsService = {
      findByApiKey: jest.fn().mockResolvedValue(mockAgent),
    };

    const mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MandatesController],
      providers: [
        {
          provide: MandatesService,
          useValue: mockMandatesService,
        },
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: mockLogger,
        },
        ApiKeyGuard,
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({
        canActivate: jest.fn(() => true),
      })
      .compile();

    controller = module.get<MandatesController>(MandatesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('issue', () => {
    it('should issue mandate and return response', async () => {
      const dto: IssueMandateDto = {
        context: { user_tier: 'free', environment: 'production' },
      };

      const request = {
        agent: { agentId: 'agent-abc123' },
      };

      mockMandatesService.issue.mockResolvedValue(mockMandate);

      const result = await controller.issue(
        request as { agent: { agentId: string } },
        dto,
      );

      expect(result).toHaveProperty('mandateId');
      expect(result.mandateId).toBe(mockMandate.mandateId);
      expect(mockMandatesService.issue).toHaveBeenCalledWith(
        'agent-abc123',
        dto.context,
      );
    });

    it('should throw ForbiddenException if agent is inactive', async () => {
      const dto: IssueMandateDto = {
        context: { user_tier: 'free' },
      };

      const request = {
        agent: { agentId: 'agent-abc123' },
      };

      mockMandatesService.issue.mockRejectedValue(
        new ForbiddenException('Agent is inactive'),
      );

      await expect(
        controller.issue(request as { agent: { agentId: string } }, dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('should return mandate details when owned by authenticated agent', async () => {
      mockMandatesService.findOne.mockResolvedValue(mockMandate);

      const request = {
        agent: mockAgent,
      } as Request & { agent: Agent };

      const result = await controller.findOne('mnd-abc123', request);

      expect(result).toHaveProperty('mandateId');
      expect(result.mandateId).toBe(mockMandate.mandateId);
      expect(mockMandatesService.findOne).toHaveBeenCalledWith('mnd-abc123');
    });

    it("should throw ForbiddenException when accessing another agent's mandate", async () => {
      mockMandatesService.findOne.mockResolvedValue(mockMandate);

      const request = {
        agent: mockOtherAgent,
      } as Request & { agent: Agent };

      await expect(controller.findOne('mnd-abc123', request)).rejects.toThrow(
        ForbiddenException,
      );

      expect(mockMandatesService.findOne).toHaveBeenCalledWith('mnd-abc123');
    });

    it('should throw NotFoundException when mandate not found', async () => {
      mockMandatesService.findOne.mockRejectedValue(
        new NotFoundException('Mandate not found'),
      );

      const request = {
        agent: mockAgent,
      } as Request & { agent: Agent };

      await expect(
        controller.findOne('mnd-nonexistent', request),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when mandate expired', async () => {
      mockMandatesService.findOne.mockRejectedValue(
        new NotFoundException('Mandate expired'),
      );

      const request = {
        agent: mockAgent,
      } as Request & { agent: Agent };

      await expect(controller.findOne('mnd-expired', request)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
