import { createHash } from 'crypto';
import { nanoid } from 'nanoid';

const AGENT_ID_LENGTH = 12;
const POLICY_ID_LENGTH = 12;
const RULE_ID_LENGTH = 12;
const MANDATE_ID_LENGTH = 12;
const ORG_ID_LENGTH = 12;
const KEY_ID_LENGTH = 16;

export function generateAgentId(): string {
  return `agent-${nanoid(AGENT_ID_LENGTH)}`;
}

export function generatePolicyId(): string {
  return `policy-${nanoid(POLICY_ID_LENGTH)}`;
}

export function generateRuleId(): string {
  return `rule-${nanoid(RULE_ID_LENGTH)}`;
}

export function generateMandateId(): string {
  return `mnd-${nanoid(MANDATE_ID_LENGTH)}`;
}

export function generateOrgId(): string {
  return `org-${nanoid(ORG_ID_LENGTH)}`;
}

export function generateKeyId(): string {
  return `key-${nanoid(KEY_ID_LENGTH)}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}
