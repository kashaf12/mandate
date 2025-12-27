import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { BulkCreateAuditLogDto } from './dto/bulk-create-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import * as schema from '../database/schema';

describe('AuditController', () => {
  let controller: AuditController;
  let mockCreate: jest.Mock;
  let mockBulkCreate: jest.Mock;
  let mockQuery: jest.Mock;

  beforeEach(async () => {
    mockCreate = jest.fn();
    mockBulkCreate = jest.fn();
    mockQuery = jest.fn();

    const mockService = {
      create: mockCreate,
      bulkCreate: mockBulkCreate,
      query: mockQuery,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        {
          provide: AuditService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<AuditController>(AuditController);
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

      mockCreate.mockResolvedValue(mockLog);

      const result = await controller.create(dto);

      expect(result.id).toBe('uuid-123');
      expect(result.agent_id).toBe('agent-123');
      expect(mockCreate).toHaveBeenCalledWith(dto);
    });
  });

  describe('bulkCreate', () => {
    it('should bulk insert logs', async () => {
      const dto: BulkCreateAuditLogDto = {
        logs: [
          {
            agentId: 'agent-123',
            actionId: 'act-1',
            timestamp: '2025-12-27T15:00:00Z',
            actionType: 'tool_call',
            decision: 'ALLOW',
          },
        ],
      };

      mockBulkCreate.mockResolvedValue(1);

      const result = await controller.bulkCreate(dto);

      expect(result.inserted).toBe(1);
      expect(mockBulkCreate).toHaveBeenCalledWith(dto.logs);
    });
  });

  describe('query', () => {
    it('should query audit logs', async () => {
      const queryDto: QueryAuditLogDto = { agentId: 'agent-123', limit: 10 };
      const mockLogs: schema.AuditLog[] = [
        {
          id: 'uuid-1',
          agentId: 'agent-123',
          actionId: 'act-1',
          timestamp: new Date(),
          actionType: 'tool_call',
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
        },
      ];

      mockQuery.mockResolvedValue(mockLogs);

      const result = await controller.query(queryDto);

      expect(result).toHaveLength(1);
      expect(result[0]?.agent_id).toBe('agent-123');
      expect(mockQuery).toHaveBeenCalledWith(queryDto);
    });
  });
});
