import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  validateSchema,
  ValidationPatterns,
  CommonSchemas,
  type ValidationContext,
} from "../src/validation";

describe("Argument Validation", () => {
  describe("validateSchema (Zod)", () => {
    it("validates required fields", () => {
      const schema = z.object({
        path: z.string(),
      });

      const result = validateSchema({}, schema);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("path");
      expect(result.reason).toContain("Required");
    });

    it("allows when required fields present", () => {
      const schema = z.object({
        path: z.string(),
      });

      const result = validateSchema({ path: "/data.txt" }, schema);

      expect(result.allowed).toBe(true);
    });

    it("validates string type", () => {
      const schema = z.object({
        path: z.string(),
      });

      const result = validateSchema({ path: 123 }, schema);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Expected string");
    });

    it("validates number type", () => {
      const schema = z.object({
        count: z.number(),
      });

      const result = validateSchema({ count: "not a number" }, schema);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Expected number");
    });

    it("validates string pattern (regex)", () => {
      const schema = z.object({
        email: z.string().regex(/^[^@]+@[^@]+\.[^@]+$/, "Invalid email format"),
      });

      const result = validateSchema({ email: "invalid" }, schema);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Invalid email format");
    });

    it("validates number range (minimum)", () => {
      const schema = z.object({
        age: z.number().min(0, "Age must be non-negative"),
      });

      const result = validateSchema({ age: -1 }, schema);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Age must be non-negative");
    });

    it("validates number range (maximum)", () => {
      const schema = z.object({
        age: z.number().max(120, "Age must be <= 120"),
      });

      const result = validateSchema({ age: 150 }, schema);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Age must be <= 120");
    });

    it("allows optional fields", () => {
      const schema = z.object({
        optional: z.string().optional(),
      });

      const result = validateSchema({}, schema);

      expect(result.allowed).toBe(true);
    });

    it("transforms data (Zod feature)", () => {
      const schema = z.object({
        count: z.string().transform((val) => parseInt(val, 10)),
      });

      const result = validateSchema({ count: "42" }, schema);

      expect(result.allowed).toBe(true);
      expect(result.transformedArgs?.count).toBe(42);
    });
  });

  describe("CommonSchemas", () => {
    it("validates file path schema", () => {
      const result = validateSchema(
        { path: "/data/file.txt" },
        CommonSchemas.filePath
      );
      expect(result.allowed).toBe(true);
    });

    it("rejects empty file path", () => {
      const result = validateSchema({ path: "" }, CommonSchemas.filePath);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Path cannot be empty");
    });

    it("validates email schema", () => {
      const result = validateSchema(
        { to: "user@example.com", subject: "Test" },
        CommonSchemas.email
      );
      expect(result.allowed).toBe(true);
    });

    it("rejects invalid email format", () => {
      const result = validateSchema(
        { to: "not-an-email" },
        CommonSchemas.email
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Invalid email format");
    });

    it("validates SQL query schema", () => {
      const result = validateSchema(
        { sql: "SELECT * FROM users" },
        CommonSchemas.sqlQuery
      );
      expect(result.allowed).toBe(true);
    });

    it("validates API call schema", () => {
      const result = validateSchema(
        { endpoint: "https://api.example.com/data", method: "GET" },
        CommonSchemas.apiCall
      );
      expect(result.allowed).toBe(true);
    });

    it("rejects invalid URL in API call", () => {
      const result = validateSchema(
        { endpoint: "not-a-url" },
        CommonSchemas.apiCall
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Invalid URL");
    });
  });

  describe("ValidationPatterns", () => {
    describe("noSystemPaths", () => {
      it("blocks /etc/ paths", () => {
        const ctx: ValidationContext = {
          tool: "read_file",
          args: { path: "/etc/passwd" },
          agentId: "agent-1",
        };

        const result = ValidationPatterns.noSystemPaths(ctx);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("System paths not allowed");
      });

      it("blocks /sys/ paths", () => {
        const ctx: ValidationContext = {
          tool: "read_file",
          args: { path: "/sys/kernel" },
          agentId: "agent-1",
        };

        const result = ValidationPatterns.noSystemPaths(ctx);

        expect(result.allowed).toBe(false);
      });

      it("blocks path traversal", () => {
        const ctx: ValidationContext = {
          tool: "read_file",
          args: { path: "/data/../etc/passwd" },
          agentId: "agent-1",
        };

        const result = ValidationPatterns.noSystemPaths(ctx);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Path traversal not allowed");
      });

      it("allows safe paths", () => {
        const ctx: ValidationContext = {
          tool: "read_file",
          args: { path: "/data/file.txt" },
          agentId: "agent-1",
        };

        const result = ValidationPatterns.noSystemPaths(ctx);

        expect(result.allowed).toBe(true);
      });
    });

    describe("internalEmailOnly", () => {
      it("blocks external emails", () => {
        const validator = ValidationPatterns.internalEmailOnly("company.com");

        const ctx: ValidationContext = {
          tool: "send_email",
          args: { to: "user@external.com" },
          agentId: "agent-1",
        };

        const result = validator(ctx);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Only company.com emails allowed");
      });

      it("allows internal emails", () => {
        const validator = ValidationPatterns.internalEmailOnly("company.com");

        const ctx: ValidationContext = {
          tool: "send_email",
          args: { to: "user@company.com" },
          agentId: "agent-1",
        };

        const result = validator(ctx);

        expect(result.allowed).toBe(true);
      });

      it("rejects invalid email format", () => {
        const validator = ValidationPatterns.internalEmailOnly("company.com");

        const ctx: ValidationContext = {
          tool: "send_email",
          args: { to: "not-an-email" },
          agentId: "agent-1",
        };

        const result = validator(ctx);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Invalid email format");
      });
    });

    describe("readOnlySql", () => {
      it("allows SELECT queries", () => {
        const ctx: ValidationContext = {
          tool: "execute_query",
          args: { sql: "SELECT * FROM users" },
          agentId: "agent-1",
        };

        const result = ValidationPatterns.readOnlySql(ctx);

        expect(result.allowed).toBe(true);
      });

      it("blocks INSERT queries", () => {
        const ctx: ValidationContext = {
          tool: "execute_query",
          args: { sql: 'INSERT INTO users VALUES (1, "admin")' },
          agentId: "agent-1",
        };

        const result = ValidationPatterns.readOnlySql(ctx);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Only SELECT queries allowed");
      });

      it("blocks UPDATE queries", () => {
        const ctx: ValidationContext = {
          tool: "execute_query",
          args: { sql: 'UPDATE users SET role="admin"' },
          agentId: "agent-1",
        };

        const result = ValidationPatterns.readOnlySql(ctx);

        expect(result.allowed).toBe(false);
      });

      it("blocks DELETE queries", () => {
        const ctx: ValidationContext = {
          tool: "execute_query",
          args: { sql: "DELETE FROM users" },
          agentId: "agent-1",
        };

        const result = ValidationPatterns.readOnlySql(ctx);

        expect(result.allowed).toBe(false);
      });

      it("blocks DROP queries", () => {
        const ctx: ValidationContext = {
          tool: "execute_query",
          args: { sql: "DROP TABLE users" },
          agentId: "agent-1",
        };

        const result = ValidationPatterns.readOnlySql(ctx);

        expect(result.allowed).toBe(false);
      });
    });
  });
});
