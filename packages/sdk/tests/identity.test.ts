import { describe, it, expect } from 'vitest';
import {
  createAgentIdentity,
  generateAgentId,
  validateAgentIdentity,
  type AgentIdentity
} from '../src/identity';

describe('Agent Identity', () => {
  describe('createAgentIdentity', () => {
    it('creates identity with required fields', () => {
      const identity = createAgentIdentity('agent-1', 'user@example.com');

      expect(identity.agentId).toBe('agent-1');
      expect(identity.principal).toBe('user@example.com');
      expect(identity.createdAt).toBeGreaterThan(0);
    });

    it('includes optional fields', () => {
      const identity = createAgentIdentity('agent-1', 'user@example.com', {
        description: 'Email automation agent',
        metadata: { team: 'sales' }
      });

      expect(identity.description).toBe('Email automation agent');
      expect(identity.metadata).toEqual({ team: 'sales' });
    });

    it('sets createdAt to current timestamp', () => {
      const before = Date.now();
      const identity = createAgentIdentity('agent-1', 'user@example.com');
      const after = Date.now();

      expect(identity.createdAt).toBeGreaterThanOrEqual(before);
      expect(identity.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe('generateAgentId', () => {
    it('generates unique IDs', () => {
      const id1 = generateAgentId();
      const id2 = generateAgentId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^agent-/);
      expect(id2).toMatch(/^agent-/);
    });

    it('uses custom prefix', () => {
      const id = generateAgentId('email-agent');

      expect(id).toMatch(/^email-agent-/);
    });

    it('generates IDs without prefix', () => {
      const id = generateAgentId();

      expect(id).toMatch(/^agent-[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('validateAgentIdentity', () => {
    it('validates correct identity', () => {
      const identity: AgentIdentity = {
        agentId: 'agent-1',
        principal: 'user@example.com',
        createdAt: Date.now()
      };

      const result = validateAgentIdentity(identity);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing agentId', () => {
      const identity: AgentIdentity = {
        agentId: '',
        principal: 'user@example.com',
        createdAt: Date.now()
      };

      const result = validateAgentIdentity(identity);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('agentId is required');
    });

    it('rejects missing principal', () => {
      const identity: AgentIdentity = {
        agentId: 'agent-1',
        principal: '',
        createdAt: Date.now()
      };

      const result = validateAgentIdentity(identity);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('principal is required');
    });

    it('rejects invalid createdAt', () => {
      const identity: AgentIdentity = {
        agentId: 'agent-1',
        principal: 'user@example.com',
        createdAt: 0
      };

      const result = validateAgentIdentity(identity);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('createdAt must be a positive timestamp');
    });

    it('collects multiple errors', () => {
      const identity: AgentIdentity = {
        agentId: '',
        principal: '',
        createdAt: -1
      };

      const result = validateAgentIdentity(identity);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});

