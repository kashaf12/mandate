import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  describe('getHello', () => {
    it('should return "Hello World!"', () => {
      const result = service.getHello();

      expect(result).toBe('Hello World!');
      expect(typeof result).toBe('string');
    });

    it('should return same value on multiple calls', () => {
      const result1 = service.getHello();
      const result2 = service.getHello();
      const result3 = service.getHello();

      expect(result1).toBe('Hello World!');
      expect(result2).toBe('Hello World!');
      expect(result3).toBe('Hello World!');
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('should return exact string match', () => {
      const result = service.getHello();

      expect(result).toBe('Hello World!');
      expect(result).not.toBe('hello world!'); // Case sensitive
      expect(result).not.toBe('Hello World'); // No exclamation
      expect(result).not.toBe('Hello World!!'); // Extra exclamation
    });

    it('should handle rapid successive calls', () => {
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(service.getHello());
      }

      expect(results).toHaveLength(100);
      results.forEach((result) => {
        expect(result).toBe('Hello World!');
      });
    });

    it('should return non-empty string', () => {
      const result = service.getHello();

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBe(12); // "Hello World!" length
    });
  });
});
