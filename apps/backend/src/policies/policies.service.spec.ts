import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PoliciesService } from './policies.service';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';

// Mock crypto utils
jest.mock('../common/utils/crypto.utils', () => ({
  generatePolicyId: jest.fn(() => 'policy-abc123'),
}));

describe('PoliciesService', () => {
  let service: PoliciesService;
  let mockDb: Partial<Database>;

  beforeEach(async () => {
    // Mock database with proper Drizzle ORM method chaining
    mockDb = {
      insert: jest.fn(),
      select: jest.fn(),
      update: jest.fn(),
    } as Partial<Database>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoliciesService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<PoliciesService>(PoliciesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a policy with version 1', async () => {
      const createDto: CreatePolicyDto = {
        name: 'Test Policy',
        description: 'Test description',
        authority: {
          maxCostTotal: 1.0,
          allowedTools: ['web_search'],
        },
      };

      const mockPolicy: schema.Policy = {
        id: 'uuid-123',
        policyId: 'policy-abc123',
        version: 1,
        name: 'Test Policy',
        description: 'Test description',
        authority: createDto.authority as schema.Policy['authority'],
        active: true,
        createdAt: new Date(),
        createdBy: null,
      };

      const mockReturning = jest.fn().mockResolvedValue([mockPolicy]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      const result = await service.create(createDto);

      expect(result).toEqual(mockPolicy);
      expect(result.version).toBe(1);
      expect(mockDb.insert).toHaveBeenCalledWith(schema.policies);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          policyId: 'policy-abc123',
          version: 1,
          name: 'Test Policy',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return all policies when activeOnly is false', async () => {
      const mockPolicies: schema.Policy[] = [
        {
          id: 'uuid-1',
          policyId: 'policy-1',
          version: 1,
          name: 'Policy 1',
          description: null,
          authority: {} as schema.Policy['authority'],
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
      ];

      const mockOrderBy = jest.fn().mockResolvedValue(mockPolicies);
      const mockFrom = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findAll(false);

      expect(result).toEqual(mockPolicies);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return only active policies when activeOnly is true', async () => {
      const mockPolicies: schema.Policy[] = [
        {
          id: 'uuid-1',
          policyId: 'policy-1',
          version: 1,
          name: 'Policy 1',
          description: null,
          authority: {} as schema.Policy['authority'],
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
      ];

      const mockOrderBy = jest.fn().mockResolvedValue(mockPolicies);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findAll(true);

      expect(result).toEqual(mockPolicies);
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return latest version when version not specified', async () => {
      const mockPolicies: schema.Policy[] = [
        {
          id: 'uuid-1',
          policyId: 'policy-abc123',
          version: 2,
          name: 'Test Policy',
          description: null,
          authority: {} as schema.Policy['authority'],
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
      ];

      const mockLimit = jest.fn().mockResolvedValue(mockPolicies);
      const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findOne('policy-abc123');

      expect(result).toEqual(mockPolicies[0]);
      expect(result.version).toBe(2);
    });

    it('should return specific version when version is specified', async () => {
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

      const mockLimit = jest.fn().mockResolvedValue([mockPolicy]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findOne('policy-abc123', 1);

      expect(result).toEqual(mockPolicy);
      expect(result.version).toBe(1);
    });

    it('should throw NotFoundException when policy not found', async () => {
      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      await expect(service.findOne('policy-nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should create new version when updating policy', async () => {
      const updateDto: UpdatePolicyDto = {
        description: 'Updated description',
      };

      const currentPolicy: schema.Policy = {
        id: 'uuid-1',
        policyId: 'policy-abc123',
        version: 1,
        name: 'Test Policy',
        description: 'Old description',
        authority: {} as schema.Policy['authority'],
        active: true,
        createdAt: new Date(),
        createdBy: null,
      };

      const newPolicy: schema.Policy = {
        id: 'uuid-2',
        policyId: 'policy-abc123',
        version: 2,
        name: 'Test Policy',
        description: 'Updated description',
        authority: {} as schema.Policy['authority'],
        active: true,
        createdAt: new Date(),
        createdBy: null,
      };

      // Mock findOne (current version)
      const mockLimit = jest.fn().mockResolvedValue([currentPolicy]);
      const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      // Mock insert (new version)
      const mockReturning = jest.fn().mockResolvedValue([newPolicy]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      const result = await service.update('policy-abc123', updateDto);

      expect(result.version).toBe(2);
      expect(result.description).toBe('Updated description');
      expect(mockDb.insert).toHaveBeenCalledWith(schema.policies);
    });
  });

  describe('findByIds', () => {
    it('should return policies by IDs', async () => {
      const policyIds = ['policy-1', 'policy-2'];
      const mockPolicies: schema.Policy[] = [
        {
          id: 'uuid-1',
          policyId: 'policy-1',
          version: 1,
          name: 'Policy 1',
          description: null,
          authority: {} as schema.Policy['authority'],
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
        {
          id: 'uuid-2',
          policyId: 'policy-2',
          version: 1,
          name: 'Policy 2',
          description: null,
          authority: {} as schema.Policy['authority'],
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
      ];

      const mockOrderBy = jest.fn().mockResolvedValue(mockPolicies);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.findByIds(policyIds);

      expect(result).toHaveLength(2);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return empty array if no IDs provided', async () => {
      const result = await service.findByIds([]);

      expect(result).toEqual([]);
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft delete all versions when version not specified', async () => {
      const mockReturning = jest.fn().mockResolvedValue([
        {
          id: 'uuid-1',
          policyId: 'policy-abc123',
          version: 1,
        },
      ]);
      const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      await service.remove('policy-abc123');

      expect(mockDb.update).toHaveBeenCalledWith(schema.policies);
      expect(mockSet).toHaveBeenCalledWith({ active: false });
    });

    it('should soft delete specific version when version is specified', async () => {
      const mockReturning = jest.fn().mockResolvedValue([
        {
          id: 'uuid-1',
          policyId: 'policy-abc123',
          version: 1,
        },
      ]);
      const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      await service.remove('policy-abc123', 1);

      expect(mockDb.update).toHaveBeenCalledWith(schema.policies);
      expect(mockSet).toHaveBeenCalledWith({ active: false });
    });

    it('should throw NotFoundException when policy not found', async () => {
      const mockReturning = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.update as jest.Mock).mockReturnValue({ set: mockSet });

      await expect(service.remove('policy-nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
