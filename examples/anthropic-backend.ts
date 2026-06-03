/**
 * Example: Anthropic integration with Mandate backend
 *
 * Shows multi-turn conversation with budget tracking.
 */

import { MandateClient } from '../packages/sdk/src';
import Anthropic from '@anthropic-ai/sdk';

async function main() {
  console.log('🚀 Starting Anthropic + Mandate Backend Example\n');

  // Create client
  const client = await MandateClient.create({
    agentId: 'anthropic-agent',
    apiKey: process.env.MANDATE_API_KEY || 'sk-org-demo-test123',
    backendUrl: process.env.MANDATE_BACKEND_URL || 'http://localhost:3000',
    context: {
      user_tier: 'pro',
      environment: 'development',
    },
  });

  const mandate = client.getMandate();
  console.log('✅ Connected to backend');
  console.log(`   Budget: $${mandate?.maxCostTotal || 'unlimited'}\n`);

  // Initialize Anthropic
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Multi-turn conversation
  const messages: any[] = [];

  for (let i = 1; i <= 3; i++) {
    console.log(`💬 Turn ${i}...`);

    messages.push({
      role: 'user',
      content: `This is message ${i}. Say hi!`,
    });

    try {
      const response = await client.executeLLMWithBudget(
        'anthropic',
        'claude-3-5-sonnet-20241022',
        messages,
        (maxTokens) =>
          anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: maxTokens,
            messages,
          })
      );

      const content =
        response.content[0].type === 'text'
          ? response.content[0].text
          : '[non-text]';

      console.log(`   Response: ${content.slice(0, 100)}...`);
      console.log(`   Cost: $${(response as any).actualCost?.toFixed(6)}`);

      messages.push({
        role: 'assistant',
        content,
      });
    } catch (error) {
      console.error(`   ❌ Failed: ${error}`);
      break;
    }

    console.log();
  }

  // Show final stats
  const remaining = await client.getRemainingBudget();
  console.log(
    `💰 Remaining budget: $${remaining?.toFixed(6) || 'unlimited'}\n`
  );

  // Cleanup
  console.log('👋 Shutting down...');
  await client.close();
  console.log('✅ Done\n');
}

main().catch(console.error);

