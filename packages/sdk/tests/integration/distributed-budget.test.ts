import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  spawnAgent,
  waitForMessage,
  sendMessage,
  killAgent,
} from "./helpers/spawn-agent";
import type { ChildProcess } from "child_process";

describe("Distributed Budget Enforcement", () => {
  let agent1: ChildProcess;
  let agent2: ChildProcess;

  beforeAll(async () => {
    // Spawn two agent processes with unique mandate ID to avoid state persistence
    const uniqueMandateId = `distributed-mandate-${Date.now()}`;

    agent1 = spawnAgent("budget-test-agent", {
      AGENT_ID: "distributed-agent",
      MANDATE_ID: uniqueMandateId,
      REDIS_HOST: "localhost",
      REDIS_PORT: "6379",
    });

    agent2 = spawnAgent("budget-test-agent", {
      AGENT_ID: "distributed-agent", // Same agent ID
      MANDATE_ID: uniqueMandateId, // Same mandate ID
      REDIS_HOST: "localhost",
      REDIS_PORT: "6379",
    });

    // Wait for both to be ready
    await waitForMessage(agent1);
    await waitForMessage(agent2);
  }, 10000);

  afterAll(async () => {
    await killAgent(agent1);
    await killAgent(agent2);
  });

  it("enforces global budget across multiple processes", async () => {
    // Both agents try to spend $0.8 each (total $1.6)
    // Budget is $10, maxCostPerCall is $1.0, so both should be allowed
    // But we want to test total budget, so let's use $5.5 each (total $11)
    // One should be blocked by total budget

    sendMessage(agent1, { action: "execute", cost: 5.5 });
    sendMessage(agent2, { action: "execute", cost: 5.5 });

    const result1 = await waitForMessage(agent1);
    const result2 = await waitForMessage(agent2);

    // Exactly one should succeed
    const successes = [result1.success, result2.success].filter(Boolean);
    expect(successes).toHaveLength(1);

    // One should be blocked with COST_LIMIT_EXCEEDED
    const blocked = [result1, result2].find((r) => !r.success);
    expect(blocked!.code).toBe("COST_LIMIT_EXCEEDED");

    // Get total cost from either agent
    sendMessage(agent1, { action: "get_cost" });
    const costResult = await waitForMessage(agent1);

    // Total cost should be $5.5, not $11 (if atomic worked)
    // But if both succeeded, it might be $11
    expect(costResult.cost).toBe(5.5);
  }, 10000);

  it("prevents race conditions with concurrent requests", async () => {
    // Reset: Create new agents with unique mandate ID to avoid state persistence
    await killAgent(agent1);
    await killAgent(agent2);

    const uniqueMandateId = `race-mandate-${Date.now()}`;

    agent1 = spawnAgent("budget-test-agent", {
      AGENT_ID: "race-agent",
      MANDATE_ID: uniqueMandateId,
      MANDATE_BUDGET: "1.0", // $1.0 budget for race condition test
    });

    agent2 = spawnAgent("budget-test-agent", {
      AGENT_ID: "race-agent",
      MANDATE_ID: uniqueMandateId,
      MANDATE_BUDGET: "1.0", // $1.0 budget for race condition test
    });

    await waitForMessage(agent1);
    await waitForMessage(agent2);

    // Both try to spend $0.6 simultaneously (budget $1.0, maxCostPerCall $10.0)
    // This tests atomic operations: exactly one should succeed
    sendMessage(agent1, { action: "execute", cost: 0.6 });
    sendMessage(agent2, { action: "execute", cost: 0.6 });

    const result1 = await waitForMessage(agent1);
    const result2 = await waitForMessage(agent2);

    // Exactly one succeeds (atomic Lua script prevents double-spend)
    const successes = [result1.success, result2.success].filter(Boolean);
    expect(successes).toHaveLength(1);

    // Verify budget never exceeded
    sendMessage(agent1, { action: "get_cost" });
    const costResult = await waitForMessage(agent1);
    expect(costResult.cost).toBeLessThanOrEqual(1.0);
  }, 10000);
});
