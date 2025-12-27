import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { AgentsService } from '../agents/agents.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { BulkCreateAuditLogDto } from './dto/bulk-create-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import * as schema from '../database/schema';
import { Agent } from '../database/schema';
import { Request } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

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

    const mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        {
          provide: AuditService,
          useValue: mockService,
        },
        {
          provide: AgentsService,
          useValue: {},
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

    controller = module.get<AuditController>(AuditController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create audit log and force agentId from authenticated agent', async () => {
      const dto: CreateAuditLogDto = {
        agentId: 'agent-attacker', // ❌ Should be ignored
        actionId: 'act-xyz',
        timestamp: '2025-12-27T15:00:00Z',
        actionType: 'mandate_issued',
        decision: 'ALLOW',
      };

      const mockAgent: Agent = {
        id: 'uuid-agent',
        agentId: 'agent-123', // ✅ Authenticated agent
        apiKeyHash: 'hash',
        name: 'Test Agent',
        principal: null,
        environment: 'production',
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const request = {
        agent: mockAgent,
      } as Request & { agent: Agent };

      const mockLog: schema.AuditLog = {
        id: 'uuid-123',
        agentId: 'agent-123', // ✅ Should use authenticated agent ID
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

      const result = await controller.create(request, dto);

      expect(result.id).toBe('uuid-123');
      expect(result.agent_id).toBe('agent-123');
      // ✅ CRITICAL: Verify agentId was forced from authenticated agent
      expect(mockCreate).toHaveBeenCalledWith({
        ...dto,
        agentId: 'agent-123', // Forced from request.agent.agentId
      });
    });
  });

  describe('bulkCreate', () => {
    it('should bulk insert logs and force agentId from authenticated agent', async () => {
      const mockAgent: Agent = {
        id: 'uuid-agent',
        agentId: 'agent-123',
        apiKeyHash: 'hash',
        name: 'Test Agent',
        principal: null,
        environment: 'production',
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const request = {
        agent: mockAgent,
      } as Request & { agent: Agent };

      const dto: BulkCreateAuditLogDto = {
        logs: [
          {
            agentId: 'agent-attacker', // ❌ Should be overridden
            actionId: 'act-1',
            timestamp: '2025-12-27T15:00:00Z',
            actionType: 'tool_call',
            decision: 'ALLOW',
          },
        ],
      };

      mockBulkCreate.mockResolvedValue(1);

      const result = await controller.bulkCreate(request, dto);

      expect(result.inserted).toBe(1);
      // ✅ CRITICAL: Verify all logs had agentId forced
      expect(mockBulkCreate).toHaveBeenCalledWith([
        {
          ...dto.logs[0],
          agentId: 'agent-123', // Forced from request.agent.agentId
        },
      ]);
    });
  });

  describe('query', () => {
    it('should query audit logs and filter by authenticated agent', async () => {
      const mockAgent: Agent = {
        id: 'uuid-agent',
        agentId: 'agent-123',
        apiKeyHash: 'hash',
        name: 'Test Agent',
        principal: null,
        environment: 'production',
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const request = {
        agent: mockAgent,
      } as Request & { agent: Agent };

      const queryDto: QueryAuditLogDto = {
        decision: 'ALLOW',
        limit: 10,
        // ❌ No agentId in query - should be added automatically
      };

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

      const result = await controller.query(request, queryDto);

      expect(result).toHaveLength(1);
      expect(result[0]?.agent_id).toBe('agent-123');
      // ✅ CRITICAL: Verify agentId was forced in query (prevents cross-agent access)
      expect(mockQuery).toHaveBeenCalledWith({
        ...queryDto,
        agentId: 'agent-123', // Forced from request.agent.agentId
      });
    });

    it('should override query agentId with authenticated agent', async () => {
      const mockAgent: Agent = {
        id: 'uuid-agent',
        agentId: 'agent-123',
        apiKeyHash: 'hash',
        name: 'Test Agent',
        principal: null,
        environment: 'production',
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const request = {
        agent: mockAgent,
      } as Request & { agent: Agent };

      const queryDto: QueryAuditLogDto = {
        agentId: 'agent-other', // ❌ Attempted cross-agent access
        limit: 10,
      };

      const mockLogs: schema.AuditLog[] = [];
      mockQuery.mockResolvedValue(mockLogs);

      await controller.query(request, queryDto);

      // ✅ CRITICAL: Verify attempted cross-agent access was prevented
      expect(mockQuery).toHaveBeenCalledWith({
        ...queryDto,
        agentId: 'agent-123', // Overridden by authenticated agent
      });
    });
  });
});
