import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import * as schema from '../database/schema';

describe('PoliciesController', () => {
  let controller: PoliciesController;
  let mockPoliciesService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const mockPolicy: schema.Policy = {
    id: 'uuid-123',
    policyId: 'policy-abc123',
    version: 1,
    name: 'Test Policy',
    description: 'Test description',
    authority: {
      maxCostTotal: 1.0,
      allowedTools: ['web_search'],
    },
    active: true,
    createdAt: new Date(),
    createdBy: null,
  };

  beforeEach(async () => {
    mockPoliciesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PoliciesController],
      providers: [
        {
          provide: PoliciesService,
          useValue: mockPoliciesService,
        },
      ],
    }).compile();

    controller = module.get<PoliciesController>(PoliciesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create policy and return response', async () => {
      const createDto: CreatePolicyDto = {
        name: 'Test Policy',
        description: 'Test description',
        authority: {
          maxCostTotal: 1.0,
          allowedTools: ['web_search'],
        },
      };

      mockPoliciesService.create.mockResolvedValue(mockPolicy);

      const result = await controller.create(createDto);

      expect(result).toHaveProperty('policyId');
      expect(result).toHaveProperty('version');
      expect(result.policyId).toBe(mockPolicy.policyId);
      expect(result.version).toBe(1);
      expect(mockPoliciesService.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('findAll', () => {
    it('should return all policies', async () => {
      const mockPolicies: schema.Policy[] = [mockPolicy];
      mockPoliciesService.findAll.mockResolvedValue(mockPolicies);

      const result = await controller.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('policyId');
      expect(result[0]).toHaveProperty('version');
      expect(mockPoliciesService.findAll).toHaveBeenCalledWith(false);
    });

    it('should filter by active when active=true query param', async () => {
      const mockPolicies: schema.Policy[] = [mockPolicy];
      mockPoliciesService.findAll.mockResolvedValue(mockPolicies);

      const result = await controller.findAll('true');

      expect(result).toHaveLength(1);
      expect(mockPoliciesService.findAll).toHaveBeenCalledWith(true);
    });
  });

  describe('findOne', () => {
    it('should return policy by ID (latest version)', async () => {
      mockPoliciesService.findOne.mockResolvedValue(mockPolicy);

      const result = await controller.findOne('policy-abc123');

      expect(result).toHaveProperty('policyId');
      expect(result).toHaveProperty('version');
      expect(result.policyId).toBe(mockPolicy.policyId);
      expect(mockPoliciesService.findOne).toHaveBeenCalledWith(
        'policy-abc123',
        undefined,
      );
    });

    it('should return specific version when version query param provided', async () => {
      mockPoliciesService.findOne.mockResolvedValue(mockPolicy);

      const result = await controller.findOne('policy-abc123', '1');

      expect(result).toHaveProperty('policyId');
      expect(result).toHaveProperty('version');
      expect(mockPoliciesService.findOne).toHaveBeenCalledWith(
        'policy-abc123',
        1,
      );
    });

    it('should throw NotFoundException when policy not found', async () => {
      mockPoliciesService.findOne.mockRejectedValue(
        new NotFoundException('Policy not found'),
      );

      await expect(controller.findOne('policy-nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update policy and return new version', async () => {
      const updateDto: UpdatePolicyDto = {
        description: 'Updated description',
      };

      const updatedPolicy = { ...mockPolicy, version: 2 };
      mockPoliciesService.update.mockResolvedValue(updatedPolicy);

      const result = await controller.update('policy-abc123', updateDto);

      expect(result).toHaveProperty('policyId');
      expect(result).toHaveProperty('version');
      expect(result.version).toBe(2);
      expect(mockPoliciesService.update).toHaveBeenCalledWith(
        'policy-abc123',
        updateDto,
      );
    });
  });

  describe('remove', () => {
    it('should remove policy (all versions)', async () => {
      mockPoliciesService.remove.mockResolvedValue(undefined);

      await controller.remove('policy-abc123');

      expect(mockPoliciesService.remove).toHaveBeenCalledWith(
        'policy-abc123',
        undefined,
      );
    });

    it('should remove specific version when version query param provided', async () => {
      mockPoliciesService.remove.mockResolvedValue(undefined);

      await controller.remove('policy-abc123', '1');

      expect(mockPoliciesService.remove).toHaveBeenCalledWith(
        'policy-abc123',
        1,
      );
    });
  });
});
