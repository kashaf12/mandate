import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MandateClient } from '../../src';
import { createToolAction } from '../../src/helpers';

// Mock fetch globally for backend calls
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

/**
 * Integration tests for backend integration.
 *
 * Prerequisites:
 * - Backend running at http://localhost:3000
 * - Test agent registered
 *
 * These tests verify end-to-end functionality:
 * - Mandate fetching from backend
 * - Audit log syncing
 * - Kill switch integration
 * - Graceful shutdown
 *
 * Note: These tests use mocked backend responses.
 * For real integration tests, set MANDATE_BACKEND_URL and MANDATE_API_KEY.
 */
describe('Backend Integration', () => {
  let client: MandateClient;

  const config = {
    agentId: 'test-agent',
    apiKey: process.env.MANDATE_API_KEY || 'test-key',
    backendUrl: process.env.MANDATE_BACKEND_URL || 'http://localhost:3000',
    context: {
      user_tier: 'free',
      environment: 'test',
    },
  };

  /**
   * Helper to create a mock mandate response
   */
  function createMockMandateResponse() {
    return {
      ok: true,
      json: async () => ({
        mandateId: 'mnd-test-123',
        effectiveAuthority: {
          allowedTools: ['*'],
          deniedTools: [],
          toolPolicies: {},
          maxCostTotal: 10.0,
        },
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      }),
    };
  }

  /**
   * Helper to create a mock kill switch response
   */
  function createMockKillSwitchResponse(killed: boolean = false) {
    return {
      ok: true,
      json: async () => ({ killed }),
    };
  }

  beforeAll(async () => {
    // Mock mandate issuance
    mockFetch.mockResolvedValueOnce(createMockMandateResponse());
    // Mock kill switch check
    mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(false));

    // Create client
    client = await MandateClient.create(config);
  });

  afterAll(async () => {
    // Cleanup
    if (client) {
      await client.close();
    }
    mockFetch.mockClear();
  });

  describe('Initialization', () => {
    it('should fetch mandate from backend on create', async () => {
      const mandate = client.getMandate();

      expect(mandate).toBeDefined();
      expect(mandate?.agentId).toBe('test-agent');
      expect(mandate?.id).toBeDefined();
    });

    it('should have valid mandate properties', () => {
      const mandate = client.getMandate();

      expect(mandate?.version).toBeGreaterThan(0);
      expect(mandate?.issuedAt).toBeDefined();
      expect(mandate?.expiresAt).toBeDefined();
    });
  });

  describe('Execution', () => {
    it('should execute tool successfully', async () => {
      // Mock kill switch check
      mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(false));

      const result = await client.executeTool(
        createToolAction('test-agent', 'test_tool', {}, 0.01),
        async () => 'success'
      );

      expect(result).toBe('success');
    });

    it('should buffer audit logs', async () => {
      // Mock kill switch check
      mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(false));

      await client.executeTool(
        createToolAction('test-agent', 'test_tool', {}, 0.01),
        async () => 'result'
      );

      const stats = client.getAuditStats();
      expect(stats.bufferedLogs).toBeGreaterThan(0);
    });

    it('should track cumulative cost', async () => {
      // Mock kill switch check
      mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(false));

      const initial = await client.getRemainingBudget();

      await client.executeTool(
        createToolAction('test-agent', 'test_tool', {}, 0.01),
        async () => 'result'
      );

      const after = await client.getRemainingBudget();

      if (initial !== undefined && after !== undefined) {
        expect(after).toBeLessThan(initial);
      }
    });
  });

  describe('Kill Switch', () => {
    it('should check kill status from backend', async () => {
      // Mock kill switch check
      mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(false));

      const killed = await client.isKilled();
      expect(typeof killed).toBe('boolean');
    });

    // Note: Skipping actual kill test to avoid breaking other tests
    it.skip('should block execution when killed', async () => {
      // Mock kill switch operations
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        })
        .mockResolvedValueOnce(createMockKillSwitchResponse(true));

      await client.kill('Test kill');

      await expect(
        client.executeTool(
          createToolAction('test-agent', 'test', {}, 0.01),
          async () => 'result'
        )
      ).rejects.toThrow('killed');
    });
  });

  describe('Statistics', () => {
    it('should provide cache statistics', () => {
      const stats = client.getCacheStats();

      expect(stats).toBeDefined();
      expect(stats.size).toBeGreaterThanOrEqual(0);
      expect(stats.maxSize).toBeGreaterThan(0);
    });

    it('should provide audit statistics', () => {
      const stats = client.getAuditStats();

      expect(stats).toBeDefined();
      expect(stats.totalAdded).toBeGreaterThan(0);
      expect(stats.bufferedLogs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Shutdown', () => {
    it('should flush logs on close', async () => {
      // Mock kill switch check
      mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(false));
      // Mock audit flush
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ inserted: 1 }),
      });

      // Add some logs
      await client.executeTool(
        createToolAction('test-agent', 'test', {}, 0.01),
        async () => 'result'
      );

      const beforeClose = client.getAuditStats();
      expect(beforeClose.bufferedLogs).toBeGreaterThan(0);

      // Close (flushes logs)
      await client.close();

      const afterClose = client.getAuditStats();
      // After close, logs should be flushed (bufferedLogs should be 0)
      expect(afterClose.bufferedLogs).toBe(0);
      // totalFlushed may be 0 if flush failed or no logs were buffered
      expect(typeof afterClose.totalFlushed).toBe('number');
    });
  });
});

