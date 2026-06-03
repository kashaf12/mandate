import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { generateOrgId } from '../common/utils/crypto.utils';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

// Mock crypto utils
jest.mock('../common/utils/crypto.utils', () => ({
  generateOrgId: jest.fn(() => 'org-abc123xyz789'),
}));

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let mockDb: Partial<Database>;
  let mockLogger: any;

  beforeEach(async () => {
    // Mock database with proper Drizzle ORM method chaining
    const createInsertChain = () => ({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([]),
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

    mockDb = {
      insert: jest.fn().mockReturnValue(createInsertChain()),
      select: jest.fn().mockReturnValue(createSelectChain()),
      update: jest.fn().mockReturnValue(createUpdateChain()),
    } as Partial<Database>;

    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create organization with custom orgId', async () => {
      const dto: CreateOrganizationDto = {
        name: 'Acme Corporation',
        orgId: 'acme',
      };

      const mockOrg: schema.Organization = {
        id: 'uuid-123',
        orgId: 'acme',
        name: 'Acme Corporation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertChain = {
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockOrg]),
        }),
      };

      (mockDb.insert as jest.Mock).mockReturnValue(insertChain);

      const result = await service.create(dto);

      expect(result).toEqual(mockOrg);
      expect(mockDb.insert).toHaveBeenCalledWith(schema.organizations);
      expect(insertChain.values).toHaveBeenCalledWith({
        orgId: 'acme',
        name: 'Acme Corporation',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Organization created', {
        orgId: 'acme',
        name: 'Acme Corporation',
        customOrgId: true,
      });
    });

    it('should lowercase custom orgId', async () => {
      const dto: CreateOrganizationDto = {
        name: 'Acme Corporation',
        orgId: 'ACME-CORP',
      };

      const mockOrg: schema.Organization = {
        id: 'uuid-123',
        orgId: 'acme-corp',
        name: 'Acme Corporation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertChain = {
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockOrg]),
        }),
      };

      (mockDb.insert as jest.Mock).mockReturnValue(insertChain);

      const result = await service.create(dto);

      expect(insertChain.values).toHaveBeenCalledWith({
        orgId: 'acme-corp',
        name: 'Acme Corporation',
      });
      expect(result).toEqual(mockOrg);
    });

    it('should create organization with auto-generated orgId when not provided', async () => {
      const dto: CreateOrganizationDto = {
        name: 'Acme Corporation',
      };

      const mockOrg: schema.Organization = {
        id: 'uuid-123',
        orgId: 'org-abc123xyz789',
        name: 'Acme Corporation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertChain = {
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockOrg]),
        }),
      };

      (mockDb.insert as jest.Mock).mockReturnValue(insertChain);

      const result = await service.create(dto);

      expect(result).toEqual(mockOrg);
      expect(generateOrgId).toHaveBeenCalled();
      expect(insertChain.values).toHaveBeenCalledWith({
        orgId: 'org-abc123xyz789',
        name: 'Acme Corporation',
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Organization created', {
        orgId: 'org-abc123xyz789',
        name: 'Acme Corporation',
        customOrgId: false,
      });
    });

    it('should throw ConflictException on unique constraint violation', async () => {
      const dto: CreateOrganizationDto = {
        name: 'Acme Corporation',
        orgId: 'acme',
      };

      const insertChain = {
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockRejectedValue({
            code: '23505',
            message: 'duplicate key value violates unique constraint',
          }),
        }),
      };

      (mockDb.insert as jest.Mock).mockReturnValue(insertChain);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow(
        "Organization with ID 'acme' already exists",
      );
    });

    it('should throw ConflictException on duplicate message', async () => {
      const dto: CreateOrganizationDto = {
        name: 'Acme Corporation',
        orgId: 'acme',
      };

      const insertChain = {
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockRejectedValue({
            message: 'duplicate key',
          }),
        }),
      };

      (mockDb.insert as jest.Mock).mockReturnValue(insertChain);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException on unique message', async () => {
      const dto: CreateOrganizationDto = {
        name: 'Acme Corporation',
      };

      const insertChain = {
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockRejectedValue({
            message: 'unique constraint violation',
          }),
        }),
      };

      (mockDb.insert as jest.Mock).mockReturnValue(insertChain);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should handle other database errors', async () => {
      const dto: CreateOrganizationDto = {
        name: 'Acme Corporation',
        orgId: 'acme',
      };

      const insertChain = {
        values: jest.fn().mockReturnValue({
          returning: jest
            .fn()
            .mockRejectedValue(new Error('Database connection failed')),
        }),
      };

      (mockDb.insert as jest.Mock).mockReturnValue(insertChain);

      await expect(service.create(dto)).rejects.toThrow(
        'Database connection failed',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findByOrgId', () => {
    it('should return organization when found', async () => {
      const orgId = 'acme';
      const mockOrg: schema.Organization = {
        id: 'uuid-123',
        orgId: 'acme',
        name: 'Acme Corporation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const selectChain = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrg]),
          }),
        }),
      };

      (mockDb.select as jest.Mock).mockReturnValue(selectChain);

      const result = await service.findByOrgId(orgId);

      expect(result).toEqual(mockOrg);
      expect(selectChain.from).toHaveBeenCalledWith(schema.organizations);
    });

    it('should throw NotFoundException when organization not found', async () => {
      const orgId = 'nonexistent';

      const selectChain = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      };

      (mockDb.select as jest.Mock).mockReturnValue(selectChain);

      await expect(service.findByOrgId(orgId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findByOrgId(orgId)).rejects.toThrow(
        'Organization nonexistent not found',
      );
    });
  });

  describe('findAll', () => {
    it('should return all organizations', async () => {
      const mockOrgs: schema.Organization[] = [
        {
          id: 'uuid-1',
          orgId: 'acme',
          name: 'Acme Corporation',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'uuid-2',
          orgId: 'org-abc123',
          name: 'Another Org',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const selectChain = {
        from: jest.fn().mockResolvedValue(mockOrgs),
      };

      (mockDb.select as jest.Mock).mockReturnValue(selectChain);

      const result = await service.findAll();

      expect(result).toEqual(mockOrgs);
      expect(selectChain.from).toHaveBeenCalledWith(schema.organizations);
    });

    it('should return empty array when no organizations exist', async () => {
      const selectChain = {
        from: jest.fn().mockResolvedValue([]),
      };

      (mockDb.select as jest.Mock).mockReturnValue(selectChain);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update organization name', async () => {
      const orgId = 'acme';
      const newName = 'Acme Corp (Updated)';

      const mockOrg: schema.Organization = {
        id: 'uuid-123',
        orgId: 'acme',
        name: newName,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updateChain = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockOrg]),
          }),
        }),
      };

      (mockDb.update as jest.Mock).mockReturnValue(updateChain);

      const result = await service.update(orgId, newName);

      expect(result).toEqual(mockOrg);
      expect(updateChain.set).toHaveBeenCalledWith({
        name: newName,
        updatedAt: expect.any(Date),
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Organization updated', {
        orgId,
        name: newName,
      });
    });

    it('should throw NotFoundException when organization not found', async () => {
      const orgId = 'nonexistent';
      const newName = 'New Name';

      const updateChain = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      };

      (mockDb.update as jest.Mock).mockReturnValue(updateChain);

      await expect(service.update(orgId, newName)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.update(orgId, newName)).rejects.toThrow(
        'Organization nonexistent not found',
      );
    });
  });
});
