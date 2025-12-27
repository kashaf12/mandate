import { Test, TestingModule } from '@nestjs/testing';
import { PolicyComposerService } from './policy-composer.service';
import * as schema from '../database/schema';

describe('PolicyComposerService', () => {
  let service: PolicyComposerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PolicyComposerService],
    }).compile();

    service = module.get<PolicyComposerService>(PolicyComposerService);
  });

  describe('compose', () => {
    it('should return fail-closed authority when no policies', () => {
      const result = service.compose([]);

      expect(result.maxCostTotal).toBe(0);
      expect(result.maxCostPerCall).toBe(0);
      expect(result.allowedTools).toEqual([]);
      expect(result.deniedTools).toEqual(['*']);
    });

    it('should return single policy as-is', () => {
      const policy: schema.Policy = {
        id: 'uuid-1',
        policyId: 'policy-1',
        version: 1,
        name: 'Test Policy',
        description: null,
        authority: {
          maxCostTotal: 1.0,
          allowedTools: ['web_search'],
        } as Record<string, unknown>,
        active: true,
        createdAt: new Date(),
        createdBy: null,
      };

      const result = service.compose([policy]);

      expect(result.maxCostTotal).toBe(1.0);
      expect(result.allowedTools).toEqual(['web_search']);
    });

    it('should take MIN of budgets when multiple policies', () => {
      const policies: schema.Policy[] = [
        {
          id: 'uuid-1',
          policyId: 'policy-1',
          version: 1,
          name: 'Policy 1',
          description: null,
          authority: { maxCostTotal: 2.0, maxCostPerCall: 0.2 } as Record<
            string,
            unknown
          >,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
        {
          id: 'uuid-2',
          policyId: 'policy-2',
          version: 1,
          name: 'Policy 2',
          description: null,
          authority: { maxCostTotal: 1.0, maxCostPerCall: 0.1 } as Record<
            string,
            unknown
          >,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
      ];

      const result = service.compose(policies);

      expect(result.maxCostTotal).toBe(1.0); // MIN
      expect(result.maxCostPerCall).toBe(0.1); // MIN
    });

    it('should INTERSECTION of allowed tools', () => {
      const policies: schema.Policy[] = [
        {
          id: 'uuid-1',
          policyId: 'policy-1',
          version: 1,
          name: 'Policy 1',
          description: null,
          authority: { allowedTools: ['web_search', 'read_file'] } as Record<
            string,
            unknown
          >,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
        {
          id: 'uuid-2',
          policyId: 'policy-2',
          version: 1,
          name: 'Policy 2',
          description: null,
          authority: { allowedTools: ['web_search', 'write_file'] } as Record<
            string,
            unknown
          >,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
      ];

      const result = service.compose(policies);

      expect(result.allowedTools).toEqual(['web_search']); // INTERSECTION
    });

    it('should UNION of denied tools', () => {
      const policies: schema.Policy[] = [
        {
          id: 'uuid-1',
          policyId: 'policy-1',
          version: 1,
          name: 'Policy 1',
          description: null,
          authority: { deniedTools: ['delete_*'] } as Record<string, unknown>,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
        {
          id: 'uuid-2',
          policyId: 'policy-2',
          version: 1,
          name: 'Policy 2',
          description: null,
          authority: { deniedTools: ['execute_*'] } as Record<string, unknown>,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
      ];

      const result = service.compose(policies);

      expect(result.deniedTools).toContain('delete_*');
      expect(result.deniedTools).toContain('execute_*');
    });

    it('should apply deny-always-wins rule', () => {
      const policies: schema.Policy[] = [
        {
          id: 'uuid-1',
          policyId: 'policy-1',
          version: 1,
          name: 'Policy 1',
          description: null,
          authority: {
            allowedTools: ['web_search', 'read_file'],
            deniedTools: ['read_file'],
          } as Record<string, unknown>,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
      ];

      const result = service.compose(policies);

      expect(result.allowedTools).not.toContain('read_file');
      expect(result.allowedTools).toContain('web_search');
    });

    it('should compose tool policies with MIN values', () => {
      const policies: schema.Policy[] = [
        {
          id: 'uuid-1',
          policyId: 'policy-1',
          version: 1,
          name: 'Policy 1',
          description: null,
          authority: {
            toolPolicies: {
              web_search: {
                estimatedCost: 0.1,
                timeout: 60000,
                maxRetries: 5,
              },
            },
          } as Record<string, unknown>,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
        {
          id: 'uuid-2',
          policyId: 'policy-2',
          version: 1,
          name: 'Policy 2',
          description: null,
          authority: {
            toolPolicies: {
              web_search: {
                estimatedCost: 0.05,
                timeout: 30000,
                maxRetries: 3,
              },
            },
          } as Record<string, unknown>,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
      ];

      const result = service.compose(policies);

      const webSearchPolicy = result.toolPolicies?.web_search as {
        estimatedCost: number;
        timeout: number;
        maxRetries: number;
      };
      expect(webSearchPolicy.estimatedCost).toBe(0.05); // MIN
      expect(webSearchPolicy.timeout).toBe(30000); // MIN
      expect(webSearchPolicy.maxRetries).toBe(3); // MIN
    });

    it('should compose executionLimits with MIN values', () => {
      const policies: schema.Policy[] = [
        {
          id: 'uuid-1',
          policyId: 'policy-1',
          version: 1,
          name: 'Policy 1',
          description: null,
          authority: {
            executionLimits: {
              maxSteps: 100,
              maxToolCalls: 50,
              maxTokensPerCall: 8000,
              maxExecutionTime: 600000,
            },
          } as Record<string, unknown>,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
        {
          id: 'uuid-2',
          policyId: 'policy-2',
          version: 1,
          name: 'Policy 2',
          description: null,
          authority: {
            executionLimits: {
              maxSteps: 50,
              maxToolCalls: 20,
              maxTokensPerCall: 4000,
              maxExecutionTime: 300000,
            },
          } as Record<string, unknown>,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
      ];

      const result = service.compose(policies);

      expect(result.executionLimits?.maxSteps).toBe(50); // MIN
      expect(result.executionLimits?.maxToolCalls).toBe(20); // MIN
      expect(result.executionLimits?.maxTokensPerCall).toBe(4000); // MIN
      expect(result.executionLimits?.maxExecutionTime).toBe(300000); // MIN
    });

    it('should compose modelConfig with MIN for numeric, INTERSECTION for arrays', () => {
      const policies: schema.Policy[] = [
        {
          id: 'uuid-1',
          policyId: 'policy-1',
          version: 1,
          name: 'Policy 1',
          description: null,
          authority: {
            modelConfig: {
              temperature: 0.9,
              maxTokens: 4000,
              allowedModels: ['gpt-4', 'claude-3-opus'],
            },
          } as Record<string, unknown>,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
        {
          id: 'uuid-2',
          policyId: 'policy-2',
          version: 1,
          name: 'Policy 2',
          description: null,
          authority: {
            modelConfig: {
              temperature: 0.7,
              maxTokens: 2000,
              allowedModels: ['gpt-4', 'gpt-3.5'],
            },
          } as Record<string, unknown>,
          active: true,
          createdAt: new Date(),
          createdBy: null,
        },
      ];

      const result = service.compose(policies);

      expect(result.modelConfig?.temperature).toBe(0.7); // MIN
      expect(result.modelConfig?.maxTokens).toBe(2000); // MIN
      expect(result.modelConfig?.allowedModels).toEqual(['gpt-4']); // INTERSECTION
    });
  });
});
