import { z } from "zod";

/**
 * Argument Validation
 *
 * Validates tool arguments against Zod schemas and custom rules.
 *
 * Use cases:
 * - Block dangerous paths: read_file('/etc/passwd')
 * - Enforce email domains: send_email(to: '@company.com')
 * - Validate SQL: execute_query(sql: 'SELECT only')
 */

/**
 * Validation context passed to custom validator.
 */
export interface ValidationContext {
  tool: string;
  args: Record<string, unknown>;
  agentId: string;
}

/**
 * Validation result.
 */
export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  transformedArgs?: Record<string, unknown>; // Optional sanitization
}

/**
 * Argument validation configuration.
 */
export interface ArgumentValidation {
  // Zod schema for type validation
  schema?: z.ZodObject<any>;

  // Custom validation function (pure, deterministic)
  validate?: (ctx: ValidationContext) => ValidationResult;
}

/**
 * Validate arguments against Zod schema.
 */
export function validateSchema(
  args: Record<string, unknown>,
  schema: z.ZodObject<any>
): ValidationResult {
  const result = schema.safeParse(args);

  if (!result.success) {
    // Extract first error for cleaner message
    const error = result.error.errors[0];
    const field = error.path.join(".");

    return {
      allowed: false,
      reason: field ? `Field '${field}': ${error.message}` : error.message,
    };
  }

  return {
    allowed: true,
    transformedArgs: result.data, // Zod can transform data
  };
}

/**
 * Common validation patterns.
 */
export const ValidationPatterns = {
  /**
   * Block system paths and path traversal.
   */
  noSystemPaths: (ctx: ValidationContext): ValidationResult => {
    const path = ctx.args.path as string;

    if (!path) {
      return { allowed: true };
    }

    const forbidden = ["/etc/", "/sys/", "/proc/", "/root/"];

    for (const prefix of forbidden) {
      if (path.startsWith(prefix)) {
        return {
          allowed: false,
          reason: `System paths not allowed: ${prefix}`,
        };
      }
    }

    if (path.includes("../")) {
      return {
        allowed: false,
        reason: "Path traversal not allowed",
      };
    }

    return { allowed: true };
  },

  /**
   * Restrict emails to a specific domain.
   */
  internalEmailOnly:
    (domain: string) =>
    (ctx: ValidationContext): ValidationResult => {
      const to = ctx.args.to as string;

      if (!to || !to.includes("@")) {
        return {
          allowed: false,
          reason: "Invalid email format",
        };
      }

      const emailDomain = to.split("@")[1];

      if (emailDomain !== domain) {
        return {
          allowed: false,
          reason: `Only ${domain} emails allowed`,
        };
      }

      return { allowed: true };
    },

  /**
   * Block write SQL operations (INSERT, UPDATE, DELETE, DROP, etc.).
   */
  readOnlySql: (ctx: ValidationContext): ValidationResult => {
    const sql = (ctx.args.sql as string)?.toLowerCase() || "";

    const writes = ["insert", "update", "delete", "drop", "alter", "create"];

    for (const keyword of writes) {
      if (sql.includes(keyword)) {
        return {
          allowed: false,
          reason: "Only SELECT queries allowed",
        };
      }
    }

    return { allowed: true };
  },
};

/**
 * Common Zod schemas for tool arguments.
 */
export const CommonSchemas = {
  /**
   * File path argument.
   */
  filePath: z.object({
    path: z.string().min(1, "Path cannot be empty"),
  }),

  /**
   * Email argument.
   */
  email: z.object({
    to: z.string().email("Invalid email format"),
    subject: z.string().optional(),
    body: z.string().optional(),
  }),

  /**
   * SQL query argument.
   */
  sqlQuery: z.object({
    sql: z.string().min(1, "SQL query cannot be empty"),
  }),

  /**
   * API call argument.
   */
  apiCall: z.object({
    endpoint: z.string().url("Invalid URL"),
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional(),
    body: z.record(z.unknown()).optional(),
  }),
};
