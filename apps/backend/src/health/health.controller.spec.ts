import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './database.health';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: jest.Mocked<HealthCheckService>;
  let databaseHealthIndicator: jest.Mocked<DatabaseHealthIndicator>;

  beforeEach(async () => {
    const mockHealthCheckService = {
      check: jest.fn(),
    };

    const mockDatabaseHealthIndicator = {
      isHealthy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
        {
          provide: DatabaseHealthIndicator,
          useValue: mockDatabaseHealthIndicator,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get(HealthCheckService);
    databaseHealthIndicator = module.get(DatabaseHealthIndicator);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('check', () => {
    it('should return health status when database is healthy', async () => {
      const mockHealthResult = {
        status: 'ok',
        info: {
          database: { status: 'up' },
        },
        error: {},
        details: {
          database: { status: 'up' },
        },
      };

      healthCheckService.check.mockResolvedValue(
        mockHealthResult as unknown as Awaited<
          ReturnType<typeof healthCheckService.check>
        >,
      );

      const result = await controller.check();

      expect(result).toEqual(mockHealthResult);
      const checkCalls = (healthCheckService.check as jest.Mock).mock.calls;
      const firstCallArgs = checkCalls[0] as unknown[];
      expect(firstCallArgs?.[0]).toHaveLength(1);
      const firstArg = firstCallArgs?.[0] as unknown[];
      expect(typeof firstArg?.[0]).toBe('function');
    });

    it('should return unhealthy status when database is down', async () => {
      const mockHealthResult = {
        status: 'error',
        info: {},
        error: {
          database: { status: 'down', message: 'Connection refused' },
        },
        details: {
          database: { status: 'down', message: 'Connection refused' },
        },
      };

      healthCheckService.check.mockResolvedValue(
        mockHealthResult as unknown as Awaited<
          ReturnType<typeof healthCheckService.check>
        >,
      );

      const result = await controller.check();

      expect(result).toEqual(mockHealthResult);
      expect(result.status).toBe('error');
      expect(result.error.database.status).toBe('down');
    });

    it('should call database health indicator', async () => {
      const mockHealthResult = {
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      };

      healthCheckService.check.mockImplementation(async (checks) => {
        // Execute the check function
        const checkFn = checks[0];
        if (checkFn) {
          await checkFn();
        }
        return mockHealthResult as unknown as Awaited<
          ReturnType<typeof healthCheckService.check>
        >;
      });

      databaseHealthIndicator.isHealthy.mockResolvedValue({
        database: { status: 'up' },
      } as unknown as Awaited<
        ReturnType<typeof databaseHealthIndicator.isHealthy>
      >);

      await controller.check();

      expect(
        (healthCheckService.check as jest.Mock).mock.calls.length,
      ).toBeGreaterThan(0);
      // Verify the check function calls isHealthy
      const checkCalls = (healthCheckService.check as jest.Mock).mock.calls;
      const firstCallArgs = checkCalls[0] as unknown[];
      const firstArg = firstCallArgs?.[0] as unknown[];
      const checkFn = firstArg?.[0] as (() => Promise<void>) | undefined;
      if (checkFn) {
        await checkFn();
      }
      // isHealthy is called once by controller.check() and once by checkFn()
      const isHealthyCalls = (databaseHealthIndicator.isHealthy as jest.Mock)
        .mock.calls;
      expect(isHealthyCalls.length).toBeGreaterThanOrEqual(1);
      expect(isHealthyCalls[0]).toEqual(['database']);
    });

    it('should handle health check service errors', async () => {
      const error = new Error('Health check failed');
      healthCheckService.check.mockRejectedValue(error);

      await expect(controller.check()).rejects.toThrow('Health check failed');
    });

    it('should handle multiple health checks', async () => {
      const mockHealthResult = {
        status: 'ok',
        info: {
          database: { status: 'up' },
        },
        error: {},
        details: {
          database: { status: 'up' },
        },
      };

      healthCheckService.check.mockResolvedValue(
        mockHealthResult as unknown as Awaited<
          ReturnType<typeof healthCheckService.check>
        >,
      );

      // Call multiple times
      await controller.check();
      await controller.check();
      await controller.check();

      expect((healthCheckService.check as jest.Mock).mock.calls.length).toBe(3);
    });

    it('should return correct health status structure', async () => {
      const mockHealthResult = {
        status: 'ok',
        info: {
          database: { status: 'up' },
        },
        error: {},
        details: {
          database: { status: 'up' },
        },
      };

      healthCheckService.check.mockResolvedValue(
        mockHealthResult as unknown as Awaited<
          ReturnType<typeof healthCheckService.check>
        >,
      );

      const result = await controller.check();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('info');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('details');
      expect(result.details).toHaveProperty('database');
    });

    it('should handle partial health status (some services down)', async () => {
      const mockHealthResult = {
        status: 'error',
        info: {},
        error: {
          database: { status: 'down' },
        },
        details: {
          database: { status: 'down' },
        },
      };

      healthCheckService.check.mockResolvedValue(
        mockHealthResult as unknown as Awaited<
          ReturnType<typeof healthCheckService.check>
        >,
      );

      const result = await controller.check();

      expect(result.status).toBe('error');
      expect(result.error.database.status).toBe('down');
    });

    it('should handle concurrent health check requests', async () => {
      const mockHealthResult = {
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      };

      healthCheckService.check.mockResolvedValue(
        mockHealthResult as unknown as Awaited<
          ReturnType<typeof healthCheckService.check>
        >,
      );

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(controller.check());
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect((healthCheckService.check as jest.Mock).mock.calls.length).toBe(5);
      results.forEach((result) => {
        expect((result as { status: string }).status).toBe('ok');
      });
    });
  });
});
