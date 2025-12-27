import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { DATABASE_CONNECTION, Database } from './database.module';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockDb: Partial<Database> & {
    transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = {
      transaction: jest.fn(),
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      execute: jest.fn(),
    } as Partial<Database> & {
      transaction: jest.Mock;
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connection getter', () => {
    it('should return database connection', () => {
      const connection = service.connection;

      expect(connection).toBe(mockDb);
      expect(connection).toBeDefined();
    });

    it('should return same instance on multiple calls', () => {
      const connection1 = service.connection;
      const connection2 = service.connection;

      expect(connection1).toBe(connection2);
      expect(connection1).toBe(mockDb);
    });
  });

  describe('transaction', () => {
    it('should execute transaction callback', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      const mockTx = {} as Partial<Database>;

      mockDb.transaction.mockImplementation(
        async (cb: (tx: Database) => Promise<unknown>) => {
          return await cb(mockTx as Database);
        },
      );

      const result = await service.transaction(callback);

      expect(result).toBe('result');
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockTx);
    });

    it('should pass transaction context to callback', async () => {
      const callback = jest.fn().mockResolvedValue(undefined);
      const mockTx = {
        select: jest.fn(),
        insert: jest.fn(),
      } as Partial<Database>;

      mockDb.transaction.mockImplementation(
        async (cb: (tx: Database) => Promise<unknown>) => {
          return await cb(mockTx as Database);
        },
      );

      await service.transaction(callback);

      expect(callback).toHaveBeenCalledWith(mockTx);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle transaction with multiple operations', async () => {
      const results: string[] = [];
      const callback = jest.fn().mockImplementation(() => {
        results.push('op1');
        results.push('op2');
        results.push('op3');
        return Promise.resolve(results);
      });

      const mockTx = {} as Partial<Database>;
      mockDb.transaction.mockImplementation(
        async (cb: (tx: Database) => Promise<unknown>) => {
          return await cb(mockTx as Database);
        },
      );

      const result = await service.transaction(callback);

      expect(result).toEqual(['op1', 'op2', 'op3']);
      expect(callback).toHaveBeenCalledWith(mockTx);
    });

    it('should propagate errors from callback', async () => {
      const error = new Error('Transaction failed');
      const callback = jest.fn().mockRejectedValue(error);

      mockDb.transaction.mockImplementation(
        async (cb: (tx: Database) => Promise<unknown>) => {
          return await cb({} as Partial<Database> as Database);
        },
      );

      await expect(service.transaction(callback)).rejects.toThrow(
        'Transaction failed',
      );
      expect(callback).toHaveBeenCalled();
    });

    it('should handle transaction rollback on error', async () => {
      const error = new Error('Rollback error');
      const callback = jest.fn().mockRejectedValue(error);

      mockDb.transaction.mockImplementation(
        async (cb: (tx: Database) => Promise<unknown>) => {
          return await cb({} as Partial<Database> as Database);
        },
      );

      await expect(service.transaction(callback)).rejects.toThrow(
        'Rollback error',
      );
    });

    it('should handle async operations in transaction', async () => {
      const callback = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'async-result';
      });

      const mockTx = {} as Partial<Database>;
      mockDb.transaction.mockImplementation(
        async (cb: (tx: Database) => Promise<unknown>) => {
          return await cb(mockTx as Database);
        },
      );

      const result = await service.transaction(callback);

      expect(result).toBe('async-result');
      expect(callback).toHaveBeenCalledWith(mockTx);
    });

    it('should handle transaction with return value', async () => {
      const returnValue = { id: '123', name: 'test' };
      const callback = jest.fn().mockResolvedValue(returnValue);

      const mockTx = {} as Partial<Database>;
      mockDb.transaction.mockImplementation(
        async (cb: (tx: Database) => Promise<unknown>) => {
          return await cb(mockTx as Database);
        },
      );

      const result = await service.transaction(callback);

      expect(result).toEqual(returnValue);
      expect((result as { id: string; name: string }).id).toBe('123');
      expect((result as { id: string; name: string }).name).toBe('test');
    });

    it('should handle concurrent transactions', async () => {
      const callback1 = jest.fn().mockResolvedValue('result1');
      const callback2 = jest.fn().mockResolvedValue('result2');
      const callback3 = jest.fn().mockResolvedValue('result3');

      const mockTx1 = { id: 1 } as Partial<Database>;
      const mockTx2 = { id: 2 } as Partial<Database>;
      const mockTx3 = { id: 3 } as Partial<Database>;

      let callCount = 0;
      mockDb.transaction.mockImplementation(
        async (cb: (tx: Database) => Promise<unknown>) => {
          callCount++;
          const mockTx =
            callCount === 1 ? mockTx1 : callCount === 2 ? mockTx2 : mockTx3;
          return await cb(mockTx as Database);
        },
      );

      const [result1, result2, result3] = await Promise.all([
        service.transaction(callback1),
        service.transaction(callback2),
        service.transaction(callback3),
      ]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(result3).toBe('result3');
      expect(mockDb.transaction).toHaveBeenCalledTimes(3);
    });

    it('should handle transaction with null return value', async () => {
      const callback = jest.fn().mockResolvedValue(null);

      const mockTx = {} as Partial<Database>;
      mockDb.transaction.mockImplementation(
        async (cb: (tx: Database) => Promise<unknown>) => {
          return await cb(mockTx as Database);
        },
      );

      const result = await service.transaction(callback);

      expect(result).toBeNull();
      expect(callback).toHaveBeenCalledWith(mockTx);
    });

    it('should handle transaction with undefined return value', async () => {
      const callback = jest.fn().mockResolvedValue(undefined);

      const mockTx = {} as Partial<Database>;
      mockDb.transaction.mockImplementation(
        async (cb: (tx: Database) => Promise<unknown>) => {
          return await cb(mockTx as Database);
        },
      );

      const result = await service.transaction(callback);

      expect(result).toBeUndefined();
      expect(callback).toHaveBeenCalledWith(mockTx);
    });
  });
});
