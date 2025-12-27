import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import * as schema from '../database/schema';

describe('RulesController', () => {
  let controller: RulesController;
  let mockRulesService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findAllActive: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const mockRule: schema.Rule = {
    id: 'uuid-123',
    ruleId: 'rule-abc123',
    version: 1,
    name: 'Test Rule',
    description: 'Test description',
    agentIds: null,
    matchMode: 'AND',
    conditions: [{ field: 'user_tier', operator: '==', value: 'free' }],
    policyId: 'policy-abc123',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockRulesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RulesController],
      providers: [
        {
          provide: RulesService,
          useValue: mockRulesService,
        },
      ],
    }).compile();

    controller = module.get<RulesController>(RulesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create rule and return response', async () => {
      const createDto: CreateRuleDto = {
        name: 'Test Rule',
        conditions: [{ field: 'user_tier', operator: '==', value: 'free' }],
        policyId: 'policy-abc123',
      };

      mockRulesService.create.mockResolvedValue(mockRule);

      const result = await controller.create(createDto);

      expect(result).toHaveProperty('ruleId');
      expect(result.ruleId).toBe(mockRule.ruleId);
      expect(mockRulesService.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('findAll', () => {
    it('should return all rules', async () => {
      const mockRules: schema.Rule[] = [mockRule];
      mockRulesService.findAll.mockResolvedValue(mockRules);

      const result = await controller.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('ruleId');
      expect(mockRulesService.findAll).toHaveBeenCalledWith(false);
    });

    it('should filter by active when active=true query param', async () => {
      const mockRules: schema.Rule[] = [mockRule];
      mockRulesService.findAll.mockResolvedValue(mockRules);

      const result = await controller.findAll('true');

      expect(result).toHaveLength(1);
      expect(mockRulesService.findAll).toHaveBeenCalledWith(true);
    });
  });

  describe('findOne', () => {
    it('should return rule by ID', async () => {
      mockRulesService.findOne.mockResolvedValue(mockRule);

      const result = await controller.findOne('rule-abc123');

      expect(result).toHaveProperty('ruleId');
      expect(result.ruleId).toBe(mockRule.ruleId);
      expect(mockRulesService.findOne).toHaveBeenCalledWith('rule-abc123');
    });

    it('should throw NotFoundException when rule not found', async () => {
      mockRulesService.findOne.mockRejectedValue(
        new NotFoundException('Rule not found'),
      );

      await expect(controller.findOne('rule-nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update rule and return new version', async () => {
      const updateDto: UpdateRuleDto = {
        description: 'Updated description',
      };

      const updatedRule = { ...mockRule, version: 2 };
      mockRulesService.update.mockResolvedValue(updatedRule);

      const result = await controller.update('rule-abc123', updateDto);

      expect(result).toHaveProperty('ruleId');
      expect(result).toHaveProperty('version');
      expect(result.version).toBe(2);
      expect(mockRulesService.update).toHaveBeenCalledWith(
        'rule-abc123',
        updateDto,
      );
    });
  });

  describe('remove', () => {
    it('should remove rule', async () => {
      mockRulesService.remove.mockResolvedValue(undefined);

      await controller.remove('rule-abc123');

      expect(mockRulesService.remove).toHaveBeenCalledWith('rule-abc123');
    });
  });
});
