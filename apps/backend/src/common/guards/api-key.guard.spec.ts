import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { AgentsService } from '../../agents/agents.service';
import * as schema from '../../database/schema';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

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

  const mockAgentsService = {
    findByApiKey: jest.fn(),
  } as unknown as jest.Mocked<Pick<AgentsService, 'findByApiKey'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
      ],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should return true for valid API key', async () => {
      const apiKey = 'sk-test-api-key-123';
      const request = {
        headers: {
          get: jest.fn((header: string) => {
            if (header === 'authorization') {
              return `Bearer ${apiKey}`;
            }
            return null;
          }),
        },
        agent: null as unknown as { agentId: string },
      };

      const context = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as unknown as ExecutionContext;

      (mockAgentsService.findByApiKey as jest.Mock).mockResolvedValue(
        mockAgent,
      );

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.agent).toEqual(mockAgent);
      expect(mockAgentsService.findByApiKey).toHaveBeenCalledWith(apiKey);
    });

    it('should throw UnauthorizedException when Authorization header is missing', async () => {
      const request = {
        headers: {
          get: jest.fn(() => null),
        },
      };

      const context = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Missing Authorization header',
      );
    });

    it('should throw UnauthorizedException for invalid API key format', async () => {
      const request = {
        headers: {
          get: jest.fn((header: string) => {
            if (header === 'authorization') {
              return 'Bearer invalid-key';
            }
            return null;
          }),
        },
      };

      const context = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Invalid API key format',
      );
    });

    it('should throw UnauthorizedException when agent is inactive', async () => {
      const apiKey = 'sk-test-api-key-123';
      const inactiveAgent = { ...mockAgent, status: 'inactive' };

      const request = {
        headers: {
          get: jest.fn((header: string) => {
            if (header === 'authorization') {
              return `Bearer ${apiKey}`;
            }
            return null;
          }),
        },
        agent: null as unknown as { agentId: string },
      };

      const context = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as unknown as ExecutionContext;

      (mockAgentsService.findByApiKey as jest.Mock).mockResolvedValue(
        inactiveAgent,
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Agent is not active',
      );
    });

    it('should throw UnauthorizedException for invalid API key', async () => {
      const apiKey = 'sk-invalid-key';
      const request = {
        headers: {
          get: jest.fn((header: string) => {
            if (header === 'authorization') {
              return `Bearer ${apiKey}`;
            }
            return null;
          }),
        },
      };

      const context = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as unknown as ExecutionContext;

      (mockAgentsService.findByApiKey as jest.Mock).mockRejectedValue(
        new Error('Invalid API key'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Invalid or inactive API key',
      );
    });

    it('should handle Bearer token with different casing', async () => {
      const apiKey = 'sk-test-api-key-123';
      const request = {
        headers: {
          get: jest.fn((header: string) => {
            if (header === 'authorization') {
              return `bearer ${apiKey}`; // lowercase
            }
            return null;
          }),
        },
        agent: null as unknown as { agentId: string },
      };

      const context = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as unknown as ExecutionContext;

      mockAgentsService.findByApiKey.mockResolvedValue(mockAgent);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockAgentsService.findByApiKey).toHaveBeenCalledWith(apiKey);
    });
  });
});
