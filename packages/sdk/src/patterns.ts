/**
 * Match a string against a glob pattern.
 *
 * Supports:
 * - Exact match: 'read_file' matches 'read_file'
 * - Wildcard: '*' matches anything
 * - Prefix: 'read_*' matches 'read_file', 'read_database'
 * - Suffix: '*_dangerous' matches 'exec_dangerous', 'run_dangerous'
 * - Middle: 'read_*_sync' matches 'read_file_sync'
 * - Multiple wildcards: 'read_*_*_async' matches 'read_user_file_async'
 *
 * @param str - The string to test
 * @param pattern - The glob pattern
 * @returns true if the string matches the pattern
 */
export function matchesPattern(str: string, pattern: string): boolean {
  // Wildcard matches everything
  if (pattern === "*") {
    return true;
  }

  // Exact match (no wildcard)
  if (!pattern.includes("*")) {
    return str === pattern;
  }

  // Convert glob pattern to regex
  // Escape regex special characters except *
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
    .replace(/\*/g, ".*"); // Replace * with .*

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}

/**
 * Check if a tool is allowed based on allowlist and denylist.
 *
 * Precedence rules:
 * 1. If in denylist → DENY (takes precedence)
 * 2. If allowlist is empty → ALLOW (no restrictions)
 * 3. If in allowlist → ALLOW
 * 4. If not in allowlist → DENY (fail-closed)
 *
 * @param tool - Tool name to check
 * @param allowedTools - Whitelist of allowed tool patterns
 * @param deniedTools - Blacklist of denied tool patterns (takes precedence)
 * @returns true if the tool is allowed
 */
export function isToolAllowed(
  tool: string,
  allowedTools: string[],
  deniedTools: string[]
): boolean {
  // Check denylist first (takes precedence)
  for (const denied of deniedTools) {
    if (matchesPattern(tool, denied)) {
      return false;
    }
  }

  // No allowlist = everything allowed (unless denied)
  if (allowedTools.length === 0) {
    return true;
  }

  // Check allowlist
  for (const allowed of allowedTools) {
    if (matchesPattern(tool, allowed)) {
      return true;
    }
  }

  // Not in allowlist = denied (fail-closed)
  return false;
}
