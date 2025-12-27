import { createHash } from 'crypto';
import { nanoid } from 'nanoid';

const AGENT_ID_LENGTH = 12;
const POLICY_ID_LENGTH = 12;
const API_KEY_LENGTH = 32;

export function generateAgentId(): string {
  return `agent-${nanoid(AGENT_ID_LENGTH)}`;
}

export function generatePolicyId(): string {
  return `policy-${nanoid(POLICY_ID_LENGTH)}`;
}

export function generateApiKey(): string {
  return `sk-${nanoid(API_KEY_LENGTH)}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}
