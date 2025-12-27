import { Test, TestingModule } from '@nestjs/testing';
import { HealthIndicatorService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health';
import { DATABASE_CONNECTION, Database } from '../database/database.module';

describe('DatabaseHealthIndicator', () => {
  let indicator: DatabaseHealthIndicator;
  let mockDb: Partial<Database> & {
    execute: jest.Mock;
  };
  let mockHealthIndicatorService: jest.Mocked<HealthIndicatorService>;

  beforeEach(async () => {
    mockDb = {
      execute: jest.fn(),
    } as Partial<Database> & {
      execute: jest.Mock;
    };

    mockHealthIndicatorService = {
      check: jest.fn(),
    } as jest.Mocked<HealthIndicatorService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseHealthIndicator,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
        {
          provide: HealthIndicatorService,
          useValue: mockHealthIndicatorService,
        },
      ],
    }).compile();

    indicator = module.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isHealthy', () => {
    it('should return up status when database is healthy', async () => {
      const mockUp = jest.fn().mockReturnValue({ database: { status: 'up' } });
      mockHealthIndicatorService.check.mockReturnValue({
        up: mockUp,
      } as unknown as ReturnType<typeof mockHealthIndicatorService.check>);

      (mockDb.execute as jest.Mock).mockResolvedValue(undefined);

      const result = await indicator.isHealthy('database');

      expect(result).toEqual({ database: { status: 'up' } });
      expect((mockDb.execute as jest.Mock).mock.calls).toEqual([['SELECT 1']]);
      expect(
        (mockHealthIndicatorService.check as jest.Mock).mock.calls,
      ).toEqual([['database']]);
      expect(mockUp.mock.calls.length).toBeGreaterThan(0);
    });

    it('should return down status when database query fails', async () => {
      const error = new Error('Connection refused');
      const mockDown = jest.fn().mockReturnValue({
        database: { status: 'down', message: 'Connection refused' },
      });
      mockHealthIndicatorService.check.mockReturnValue({
        down: mockDown,
      } as unknown as ReturnType<typeof mockHealthIndicatorService.check>);

      (mockDb.execute as jest.Mock).mockRejectedValue(error);

      const result = await indicator.isHealthy('database');

      expect(result).toEqual({
        database: { status: 'down', message: 'Connection refused' },
      });
      expect(mockDb.execute).toHaveBeenCalledWith('SELECT 1');
      expect(mockDown).toHaveBeenCalledWith({
        message: 'Connection refused',
      });
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Query timeout');
      timeoutError.name = 'TimeoutError';
      const mockDown = jest.fn().mockReturnValue({
        database: { status: 'down', message: 'Query timeout' },
      });
      mockHealthIndicatorService.check.mockReturnValue({
        down: mockDown,
      } as unknown as ReturnType<typeof mockHealthIndicatorService.check>);

      (mockDb.execute as jest.Mock).mockRejectedValue(timeoutError);

      const result = await indicator.isHealthy('database');

      expect(result.database.status).toBe('down');
      expect(result.database.message).toBe('Query timeout');
    });

    it('should handle connection pool exhaustion', async () => {
      const poolError = new Error('Connection pool exhausted');
      poolError.name = 'PoolError';
      const mockDown = jest.fn().mockReturnValue({
        database: { status: 'down', message: 'Connection pool exhausted' },
      });
      mockHealthIndicatorService.check.mockReturnValue({
        down: mockDown,
      } as unknown as ReturnType<typeof mockHealthIndicatorService.check>);

      (mockDb.execute as jest.Mock).mockRejectedValue(poolError);

      const result = await indicator.isHealthy('database');

      expect(result.database.status).toBe('down');
      expect(result.database.message).toBe('Connection pool exhausted');
    });

    it('should handle errors without message property', async () => {
      const error = { code: 'ECONNREFUSED' } as unknown as Error;
      const mockDown = jest.fn().mockReturnValue({
        database: { status: 'down', message: undefined },
      });
      mockHealthIndicatorService.check.mockReturnValue({
        down: mockDown,
      } as unknown as ReturnType<typeof mockHealthIndicatorService.check>);

      (mockDb.execute as jest.Mock).mockRejectedValue(error);

      const result = await indicator.isHealthy('database');

      expect(result.database.status).toBe('down');
      // Should handle missing message gracefully
      expect(mockDown).toHaveBeenCalled();
    });

    it('should handle non-Error objects thrown', async () => {
      const nonError = { toString: () => 'String error' };
      const mockDown = jest.fn().mockReturnValue({
        database: { status: 'down' },
      });
      mockHealthIndicatorService.check.mockReturnValue({
        down: mockDown,
      } as unknown as ReturnType<typeof mockHealthIndicatorService.check>);

      (mockDb.execute as jest.Mock).mockRejectedValue(nonError);

      const result = await indicator.isHealthy('database');

      expect(result.database.status).toBe('down');
      expect(mockDown).toHaveBeenCalled();
    });

    it('should use correct key parameter', async () => {
      const mockUp = jest.fn().mockReturnValue({ custom: { status: 'up' } });
      mockHealthIndicatorService.check.mockReturnValue({
        up: mockUp,
      } as unknown as ReturnType<typeof mockHealthIndicatorService.check>);

      (mockDb.execute as jest.Mock).mockResolvedValue(undefined);

      await indicator.isHealthy('custom-key');

      expect(
        (mockHealthIndicatorService.check as jest.Mock).mock.calls,
      ).toEqual([['custom-key']]);
    });

    it('should handle rapid successive health checks', async () => {
      const mockUp = jest.fn().mockReturnValue({ database: { status: 'up' } });
      mockHealthIndicatorService.check.mockReturnValue({
        up: mockUp,
      } as unknown as ReturnType<typeof mockHealthIndicatorService.check>);

      (mockDb.execute as jest.Mock).mockResolvedValue(undefined);

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(indicator.isHealthy('database'));
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(mockDb.execute as jest.Mock).toHaveBeenCalledTimes(10);
      results.forEach((result) => {
        expect(
          (result as { database: { status: string } }).database.status,
        ).toBe('up');
      });
    });

    it('should handle database returning result (not just undefined)', async () => {
      const mockUp = jest.fn().mockReturnValue({ database: { status: 'up' } });
      mockHealthIndicatorService.check.mockReturnValue({
        up: mockUp,
      } as unknown as ReturnType<typeof mockHealthIndicatorService.check>);

      // Some databases might return a result object
      (mockDb.execute as jest.Mock).mockResolvedValue({
        rows: [{ '?column?': 1 }],
      });

      const result = await indicator.isHealthy('database');

      expect(result.database.status).toBe('up');
      expect(mockDb.execute).toHaveBeenCalledWith('SELECT 1');
    });
  });
});
