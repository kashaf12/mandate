/**
 * Helper functions to validate dependencies before running examples.
 */

import Redis from "ioredis";
import { isError } from "./error-guards.js";

/**
 * Check if Redis is accessible at the given host and port.
 */
export async function checkRedis(
  host: string = "localhost",
  port: number = 6379,
  timeout: number = 2000
): Promise<{ available: boolean; error?: string }> {
  const redis = new Redis({
    host,
    port,
    connectTimeout: timeout,
    lazyConnect: true,
    maxRetriesPerRequest: 0, // Don't retry for health check
  });

  try {
    await redis.ping();
    await redis.quit();
    return { available: true };
  } catch (error: unknown) {
    await redis.quit().catch(() => {}); // Ignore quit errors
    const message = isError(error) ? error.message : "Unknown error";
    return {
      available: false,
      error: message,
    };
  }
}

/**
 * Check if OpenAI API is accessible (requires API key).
 */
export function checkOpenAI(): { available: boolean; error?: string } {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      available: false,
      error: "OPENAI_API_KEY environment variable not set",
    };
  }
  return { available: true };
}

/**
 * Check if Ollama is running locally.
 */
export async function checkOllama(
  baseUrl: string = "http://localhost:11434"
): Promise<{ available: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      return { available: true };
    }
    return {
      available: false,
      error: `Ollama returned status ${response.status}`,
    };
  } catch (error: unknown) {
    const message = isError(error) ? error.message : "Cannot connect to Ollama";
    return {
      available: false,
      error: message,
    };
  }
}

/**
 * Validate dependencies for examples.
 */
export async function validateDependencies(options: {
  redis?: { host?: string; port?: number };
  llm?: "openai" | "ollama" | "none";
}): Promise<void> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check Redis if needed
  if (options.redis !== undefined) {
    const redisCheck = await checkRedis(options.redis.host, options.redis.port);
    if (!redisCheck.available) {
      errors.push(
        `❌ Redis not available at ${options.redis.host || "localhost"}:${
          options.redis.port || 6379
        }\n` +
          `   Error: ${redisCheck.error}\n` +
          `   Solution: Run 'pnpm docker:start' to start Redis`
      );
    }
  }

  // Check LLM if needed
  if (options.llm === "openai") {
    const openAICheck = checkOpenAI();
    if (!openAICheck.available) {
      errors.push(
        `❌ OpenAI API key not found\n` +
          `   Error: ${openAICheck.error}\n` +
          `   Solution: Set OPENAI_API_KEY environment variable`
      );
    }
  } else if (options.llm === "ollama") {
    const ollamaCheck = await checkOllama();
    if (!ollamaCheck.available) {
      warnings.push(
        `⚠️  Ollama not available\n` +
          `   Error: ${ollamaCheck.error}\n` +
          `   Solution: Install and start Ollama (https://ollama.ai) or set OPENAI_API_KEY`
      );
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    console.warn("\n" + "=".repeat(60));
    console.warn("⚠️  WARNINGS");
    console.warn("=".repeat(60));
    warnings.forEach((w) => console.warn(w));
    console.warn("=".repeat(60) + "\n");
  }

  // Print errors and exit
  if (errors.length > 0) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ DEPENDENCY ERRORS");
    console.error("=".repeat(60));
    errors.forEach((e) => console.error(e));
    console.error("=".repeat(60));
    console.error("\n💡 Quick Fix:");
    console.error("   For Redis: pnpm docker:start");
    console.error("   For OpenAI: export OPENAI_API_KEY=your-key");
    console.error("   For Ollama: Install from https://ollama.ai\n");
    process.exit(1);
  }
}
