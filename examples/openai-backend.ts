/**
 * Example: OpenAI integration with Mandate backend
 *
 * This example shows how to use MandateClient with backend integration
 * to enforce budgets and policies dynamically.
 *
 * Prerequisites:
 * 1. Backend running at http://localhost:3000
 * 2. Agent registered in backend
 * 3. API key from backend
 * 4. OpenAI API key
 *
 * Environment variables:
 * - MANDATE_API_KEY: Backend API key (sk-org-xxx-yyy)
 * - OPENAI_API_KEY: OpenAI API key
 * - MANDATE_BACKEND_URL: Backend URL (default: http://localhost:3000)
 */

import { MandateClient } from '../packages/sdk/src';
import OpenAI from 'openai';

async function main() {
  console.log('🚀 Starting OpenAI + Mandate Backend Example\n');

  // ============================================
  // 1. Create MandateClient with Backend
  // ============================================

  console.log('📡 Connecting to Mandate backend...');

  const client = await MandateClient.create({
    agentId: 'openai-agent',
    apiKey: process.env.MANDATE_API_KEY || 'sk-org-demo-test123',
    backendUrl: process.env.MANDATE_BACKEND_URL || 'http://localhost:3000',
    context: {
      user_tier: 'free', // Determines which policies apply
      environment: 'development', // dev/staging/prod
    },
  });

  const mandate = client.getMandate();
  console.log('✅ Connected to backend');
  console.log(`   Mandate ID: ${mandate?.id}`);
  console.log(`   Budget: $${mandate?.maxCostTotal || 'unlimited'}`);
  console.log(
    `   Allowed tools: ${mandate?.allowedTools?.join(', ') || 'all'}\n`
  );

  // ============================================
  // 2. Initialize OpenAI Client
  // ============================================

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // ============================================
  // 3. Make LLM Call with Budget Enforcement
  // ============================================

  console.log('💬 Making LLM call (with budget enforcement)...');

  try {
    const response = await client.executeLLMWithBudget(
      'openai',
      'gpt-4o-mini',
      [
        {
          role: 'user',
          content: 'Explain quantum computing in one sentence.',
        },
      ],
      (maxTokens) =>
        openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: 'Explain quantum computing in one sentence.',
            },
          ],
          max_tokens: maxTokens,
        })
    );

    console.log('✅ LLM call succeeded');
    console.log(`   Response: ${response.choices[0].message.content}`);
    console.log(`   Tokens: ${response.usage?.total_tokens}`);
    console.log(
      `   Cost: $${(response as any).actualCost?.toFixed(6) || 'unknown'}\n`
    );
  } catch (error) {
    console.error('❌ LLM call failed:', error);
  }

  // ============================================
  // 4. Check Statistics
  // ============================================

  console.log('📊 Client Statistics:');

  const cacheStats = client.getCacheStats();
  console.log(`   Cache: ${cacheStats.size} entries`);

  const auditStats = client.getAuditStats();
  console.log(`   Audit logs buffered: ${auditStats.bufferedLogs}`);
  console.log(`   Audit logs flushed: ${auditStats.totalFlushed}\n`);

  // ============================================
  // 5. Graceful Shutdown
  // ============================================

  console.log('👋 Shutting down client...');
  await client.close();
  console.log('✅ Shutdown complete\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

