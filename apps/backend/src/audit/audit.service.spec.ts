import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import * as schema from '../database/schema';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

describe('AuditService', () => {
  let service: AuditService;
  let mockDb: Partial<Database>;

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn(),
      select: jest.fn(),
    } as Partial<Database>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create audit log', async () => {
      const dto: CreateAuditLogDto = {
        agentId: 'agent-123',
        actionId: 'act-xyz',
        timestamp: '2025-12-27T15:00:00Z',
        actionType: 'mandate_issued',
        decision: 'ALLOW',
      };

      const mockLog: schema.AuditLog = {
        id: 'uuid-123',
        agentId: 'agent-123',
        actionId: 'act-xyz',
        timestamp: new Date('2025-12-27T15:00:00Z'),
        actionType: 'mandate_issued',
        toolName: null,
        decision: 'ALLOW',
        reason: null,
        estimatedCost: null,
        actualCost: null,
        cumulativeCost: null,
        context: null,
        matchedRules: null,
        metadata: null,
        createdAt: new Date(),
      };

      const mockReturning = jest.fn().mockResolvedValue([mockLog]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      const result = await service.create(dto);

      expect(result.id).toBe('uuid-123');
      expect(result.agentId).toBe('agent-123');
      expect(mockDb.insert).toHaveBeenCalledWith(schema.auditLogs);
    });

    it('should create audit log with all optional fields', async () => {
      const dto: CreateAuditLogDto = {
        agentId: 'agent-123',
        actionId: 'act-xyz',
        timestamp: '2025-12-27T15:00:00Z',
        actionType: 'tool_call',
        toolName: 'web_search',
        decision: 'ALLOW',
        reason: 'Within budget',
        estimatedCost: 0.05,
        actualCost: 0.048,
        cumulativeCost: 2.35,
        context: { user_tier: 'free' },
        matchedRules: [{ rule_id: 'rule-1', rule_version: 2 }],
        metadata: { mandate_id: 'mnd-xyz' },
      };

      const mockLog: schema.AuditLog = {
        id: 'uuid-123',
        agentId: 'agent-123',
        actionId: 'act-xyz',
        timestamp: new Date('2025-12-27T15:00:00Z'),
        actionType: 'tool_call',
        toolName: 'web_search',
        decision: 'ALLOW',
        reason: 'Within budget',
        estimatedCost: '0.05',
        actualCost: '0.048',
        cumulativeCost: '2.35',
        context: { user_tier: 'free' },
        matchedRules: [{ rule_id: 'rule-1', rule_version: 2 }] as Array<{
          rule_id: string;
          rule_version: number;
        }>,
        metadata: { mandate_id: 'mnd-xyz' },
        createdAt: new Date(),
      };

      const mockReturning = jest.fn().mockResolvedValue([mockLog]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      const result = await service.create(dto);

      expect(result.toolName).toBe('web_search');
      expect(result.reason).toBe('Within budget');
    });
  });

  describe('bulkCreate', () => {
    it('should insert multiple logs', async () => {
      const dtos: CreateAuditLogDto[] = [
        {
          agentId: 'agent-123',
          actionId: 'act-1',
          timestamp: '2025-12-27T15:00:00Z',
          actionType: 'tool_call',
          decision: 'ALLOW',
        },
        {
          agentId: 'agent-123',
          actionId: 'act-2',
          timestamp: '2025-12-27T15:01:00Z',
          actionType: 'tool_call',
          decision: 'BLOCK',
        },
      ];

      const mockLogs = dtos.map((dto, idx) => ({
        id: `uuid-${idx}`,
        agentId: dto.agentId,
        actionId: dto.actionId,
        timestamp: new Date(dto.timestamp),
        actionType: dto.actionType,
        toolName: null,
        decision: dto.decision,
        reason: null,
        estimatedCost: null,
        actualCost: null,
        cumulativeCost: null,
        context: null,
        matchedRules: null,
        metadata: null,
        createdAt: new Date(),
      }));

      const mockReturning = jest.fn().mockResolvedValue(mockLogs);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      const count = await service.bulkCreate(dtos);

      expect(count).toBe(2);
      expect(mockDb.insert).toHaveBeenCalledWith(schema.auditLogs);
    });

    it('should return 0 for empty array', async () => {
      const count = await service.bulkCreate([]);
      expect(count).toBe(0);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('query', () => {
    it('should query with filters', async () => {
      const queryDto: QueryAuditLogDto = {
        agentId: 'agent-123',
        decision: 'BLOCK',
        limit: 10,
        offset: 0,
      };

      const mockLogs: schema.AuditLog[] = [
        {
          id: 'uuid-1',
          agentId: 'agent-123',
          actionId: 'act-1',
          timestamp: new Date(),
          actionType: 'tool_call',
          toolName: null,
          decision: 'BLOCK',
          reason: null,
          estimatedCost: null,
          actualCost: null,
          cumulativeCost: null,
          context: null,
          matchedRules: null,
          metadata: null,
          createdAt: new Date(),
        },
      ];

      const mockOffset = jest.fn().mockResolvedValue(mockLogs);
      const mockLimit = jest.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.query(queryDto);

      expect(result).toEqual(mockLogs);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should query without filters', async () => {
      const queryDto: QueryAuditLogDto = {
        limit: 100,
        offset: 0,
      };

      const mockLogs: schema.AuditLog[] = [];

      const mockOffset = jest.fn().mockResolvedValue(mockLogs);
      const mockLimit = jest.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      (mockDb.select as jest.Mock).mockReturnValue({ from: mockFrom });

      const result = await service.query(queryDto);

      expect(result).toEqual(mockLogs);
    });
  });

  describe('logMandateIssuance', () => {
    it('should log mandate issuance event', async () => {
      const mockReturning = jest.fn().mockResolvedValue([{ id: 'uuid-123' }]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      await service.logMandateIssuance(
        'agent-123',
        'mnd-xyz',
        { user_tier: 'free' },
        [{ rule_id: 'rule-1', rule_version: 2 }],
      );

      expect(mockDb.insert).toHaveBeenCalledWith(schema.auditLogs);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-123',
          actionId: 'mnd-xyz',
          actionType: 'mandate_issued',
          decision: 'ALLOW',
        }),
      );
    });
  });

  describe('logKillSwitch', () => {
    it('should log kill switch activation', async () => {
      const mockReturning = jest.fn().mockResolvedValue([{ id: 'uuid-123' }]);
      const mockValues = jest
        .fn()
        .mockReturnValue({ returning: mockReturning });
      (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

      await service.logKillSwitch(
        'agent-123',
        'Runaway cost detected',
        'admin@example.com',
      );

      expect(mockDb.insert).toHaveBeenCalledWith(schema.auditLogs);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-123',
          actionType: 'agent_killed',
          decision: 'BLOCK',
          reason: 'Runaway cost detected',
        }),
      );
    });
  });
});
