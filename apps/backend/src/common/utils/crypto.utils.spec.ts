import {
  generateAgentId,
  generatePolicyId,
  generateRuleId,
  generateMandateId,
  generateApiKey,
  hashApiKey,
} from './crypto.utils';

describe('Crypto Utils', () => {
  describe('generateAgentId', () => {
    it('should generate agent ID with correct format', () => {
      const id = generateAgentId();

      expect(id).toMatch(/^agent-[A-Za-z0-9_-]{12}$/);
      expect(id.startsWith('agent-')).toBe(true);
      expect(id.length).toBe(18); // 'agent-' (6) + 12 chars
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateAgentId());
      }

      expect(ids.size).toBe(100);
    });

    it('should generate IDs with only alphanumeric characters', () => {
      const id = generateAgentId();
      const suffix = id.replace('agent-', '');

      expect(suffix).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('generatePolicyId', () => {
    it('should generate policy ID with correct format', () => {
      const id = generatePolicyId();

      expect(id).toMatch(/^policy-[A-Za-z0-9_-]{12}$/);
      expect(id.startsWith('policy-')).toBe(true);
      expect(id.length).toBe(19); // 'policy-' (7) + 12 chars
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generatePolicyId());
      }

      expect(ids.size).toBe(100);
    });

    it('should not collide with agent IDs', () => {
      const agentId = generateAgentId();
      const policyId = generatePolicyId();

      expect(agentId).not.toBe(policyId);
      expect(agentId.startsWith('agent-')).toBe(true);
      expect(policyId.startsWith('policy-')).toBe(true);
    });
  });

  describe('generateRuleId', () => {
    it('should generate rule ID with correct format', () => {
      const id = generateRuleId();

      expect(id).toMatch(/^rule-[A-Za-z0-9_-]{12}$/);
      expect(id.startsWith('rule-')).toBe(true);
      expect(id.length).toBe(17); // 'rule-' (5) + 12 chars
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRuleId());
      }

      expect(ids.size).toBe(100);
    });
  });

  describe('generateMandateId', () => {
    it('should generate mandate ID with correct format', () => {
      const id = generateMandateId();

      expect(id).toMatch(/^mnd-[A-Za-z0-9_-]{12}$/);
      expect(id.startsWith('mnd-')).toBe(true);
      expect(id.length).toBe(16); // 'mnd-' (4) + 12 chars
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateMandateId());
      }

      expect(ids.size).toBe(100);
    });
  });

  describe('generateApiKey', () => {
    it('should generate API key with correct format', () => {
      const apiKey = generateApiKey();

      expect(apiKey).toMatch(/^sk-[A-Za-z0-9_-]{32}$/);
      expect(apiKey.startsWith('sk-')).toBe(true);
      expect(apiKey.length).toBe(35); // 'sk-' (3) + 32 chars
    });

    it('should generate unique API keys', () => {
      const keys = new Set();
      for (let i = 0; i < 100; i++) {
        keys.add(generateApiKey());
      }

      expect(keys.size).toBe(100);
    });

    it('should generate keys with sufficient entropy', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      // Keys should be different
      expect(key1).not.toBe(key2);

      // Suffix should be different (high probability)
      const suffix1 = key1.replace('sk-', '');
      const suffix2 = key2.replace('sk-', '');
      expect(suffix1).not.toBe(suffix2);
    });
  });

  describe('hashApiKey', () => {
    it('should hash API key using SHA-256', () => {
      const apiKey = 'sk-test-api-key-123';
      const hash = hashApiKey(apiKey);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce same hash for same input', () => {
      const apiKey = 'sk-test-api-key-123';
      const hash1 = hashApiKey(apiKey);
      const hash2 = hashApiKey(apiKey);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const apiKey1 = 'sk-test-api-key-123';
      const apiKey2 = 'sk-test-api-key-456';

      const hash1 = hashApiKey(apiKey1);
      const hash2 = hashApiKey(apiKey2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashApiKey('');

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
      // Empty string SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      expect(hash).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });

    it('should handle special characters in API key', () => {
      const apiKey = 'sk-test-key-!@#$%^&*()';
      const hash = hashApiKey(apiKey);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle very long API keys', () => {
      const longKey = 'sk-' + 'a'.repeat(1000);
      const hash = hashApiKey(longKey);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should handle unicode characters', () => {
      const unicodeKey = 'sk-test-🔑-key-测试';
      const hash = hashApiKey(unicodeKey);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should produce deterministic hashes', () => {
      const apiKey = 'sk-deterministic-test-key';
      const hashes = [];

      for (let i = 0; i < 10; i++) {
        hashes.push(hashApiKey(apiKey));
      }

      // All hashes should be identical
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });

    it('should handle whitespace correctly', () => {
      const apiKey1 = 'sk-test-key';
      const apiKey2 = 'sk-test-key '; // trailing space
      const apiKey3 = ' sk-test-key'; // leading space

      const hash1 = hashApiKey(apiKey1);
      const hash2 = hashApiKey(apiKey2);
      const hash3 = hashApiKey(apiKey3);

      // Different inputs should produce different hashes
      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash2).not.toBe(hash3);
    });
  });

  describe('ID Generation Edge Cases', () => {
    it('should generate all ID types with different prefixes', () => {
      const agentId = generateAgentId();
      const policyId = generatePolicyId();
      const ruleId = generateRuleId();
      const mandateId = generateMandateId();

      expect(agentId.startsWith('agent-')).toBe(true);
      expect(policyId.startsWith('policy-')).toBe(true);
      expect(ruleId.startsWith('rule-')).toBe(true);
      expect(mandateId.startsWith('mnd-')).toBe(true);
    });

    it('should handle rapid successive ID generation', () => {
      const ids = [];
      for (let i = 0; i < 1000; i++) {
        ids.push(generateAgentId());
      }

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1000);
    });

    it('should generate IDs that are URL-safe', () => {
      const agentId = generateAgentId();
      const policyId = generatePolicyId();
      const ruleId = generateRuleId();
      const mandateId = generateMandateId();

      // IDs should not contain characters that need URL encoding
      const urlUnsafeChars = /[^A-Za-z0-9_-]/;
      expect(agentId).not.toMatch(urlUnsafeChars);
      expect(policyId).not.toMatch(urlUnsafeChars);
      expect(ruleId).not.toMatch(urlUnsafeChars);
      expect(mandateId).not.toMatch(urlUnsafeChars);
    });
  });
});
