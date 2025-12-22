import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Spawn agent process for integration testing.
 */
export function spawnAgent(
  scriptName: string,
  env?: Record<string, string>
): ChildProcess {
  // Try .mjs first (ES modules), fall back to .js
  const scriptPathMjs = path.join(
    __dirname,
    "..",
    "agents",
    `${scriptName}.mjs`
  );
  const scriptPathJs = path.join(__dirname, "..", "agents", `${scriptName}.js`);
  const scriptPath = existsSync(scriptPathMjs) ? scriptPathMjs : scriptPathJs;

  return spawn("node", [scriptPath], {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });
}

/**
 * Wait for message from agent process.
 */
export function waitForMessage(
  proc: ChildProcess,
  timeout = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for message"));
    }, timeout);

    proc.once("message", (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

/**
 * Send message to agent process.
 */
export function sendMessage(proc: ChildProcess, msg: any): void {
  proc.send(msg);
}

/**
 * Kill agent process.
 */
export function killAgent(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    proc.once("exit", () => resolve());
    proc.kill("SIGTERM");
  });
}
