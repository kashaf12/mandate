import { describe, it, expect } from "vitest";
import { matchesPattern, isToolAllowed } from "../src/patterns";

describe("Pattern Matching", () => {
  describe("matchesPattern", () => {
    it("matches exact string", () => {
      expect(matchesPattern("read_file", "read_file")).toBe(true);
      expect(matchesPattern("read_file", "write_file")).toBe(false);
    });

    it("matches wildcard *", () => {
      expect(matchesPattern("anything", "*")).toBe(true);
      expect(matchesPattern("read_file", "*")).toBe(true);
    });

    it("matches prefix patterns", () => {
      expect(matchesPattern("read_file", "read_*")).toBe(true);
      expect(matchesPattern("read_database", "read_*")).toBe(true);
      expect(matchesPattern("write_file", "read_*")).toBe(false);
    });

    it("matches suffix patterns", () => {
      expect(matchesPattern("exec_dangerous", "*_dangerous")).toBe(true);
      expect(matchesPattern("run_dangerous", "*_dangerous")).toBe(true);
      expect(matchesPattern("safe_operation", "*_dangerous")).toBe(false);
    });

    it("matches middle patterns", () => {
      expect(matchesPattern("read_file_sync", "read_*_sync")).toBe(true);
      expect(matchesPattern("write_file_sync", "read_*_sync")).toBe(false);
    });

    it("handles multiple wildcards", () => {
      expect(matchesPattern("read_user_file_async", "read_*_*_async")).toBe(
        true
      );
      expect(matchesPattern("read_user_file_sync", "read_*_*_async")).toBe(
        false
      );
    });
  });

  describe("isToolAllowed", () => {
    it("allows when no restrictions", () => {
      expect(isToolAllowed("any_tool", [], [])).toBe(true);
      expect(isToolAllowed("another_tool", [], [])).toBe(true);
    });

    it("denies when in denylist", () => {
      expect(isToolAllowed("delete_file", [], ["delete_*"])).toBe(false);
      expect(isToolAllowed("delete_database", [], ["delete_*"])).toBe(false);
    });

    it("allows when in allowlist", () => {
      expect(isToolAllowed("read_file", ["read_*"], [])).toBe(true);
      expect(isToolAllowed("read_database", ["read_*"], [])).toBe(true);
    });

    it("denies when not in allowlist", () => {
      expect(isToolAllowed("write_file", ["read_*"], [])).toBe(false);
      expect(isToolAllowed("delete_file", ["read_*"], [])).toBe(false);
    });

    it("denylist takes precedence over allowlist", () => {
      expect(isToolAllowed("read_password", ["read_*"], ["*_password"])).toBe(
        false
      );
      expect(isToolAllowed("read_secret", ["read_*"], ["*_secret"])).toBe(
        false
      );
    });

    it("allows when both lists exist and tool matches allowlist but not denylist", () => {
      expect(isToolAllowed("read_file", ["read_*"], ["delete_*"])).toBe(true);
      expect(isToolAllowed("read_database", ["read_*"], ["delete_*"])).toBe(
        true
      );
    });

    it("handles exact matches in denylist", () => {
      expect(isToolAllowed("delete_file", ["*"], ["delete_file"])).toBe(false);
      expect(isToolAllowed("delete_database", ["*"], ["delete_file"])).toBe(
        true
      );
    });

    it("handles multiple patterns in allowlist", () => {
      expect(isToolAllowed("read_file", ["read_*", "write_*"], [])).toBe(true);
      expect(isToolAllowed("write_file", ["read_*", "write_*"], [])).toBe(true);
      expect(isToolAllowed("delete_file", ["read_*", "write_*"], [])).toBe(
        false
      );
    });

    it("handles multiple patterns in denylist", () => {
      expect(
        isToolAllowed("delete_file", ["*"], ["delete_*", "execute_*"])
      ).toBe(false);
      expect(
        isToolAllowed("execute_shell", ["*"], ["delete_*", "execute_*"])
      ).toBe(false);
      expect(isToolAllowed("read_file", ["*"], ["delete_*", "execute_*"])).toBe(
        true
      );
    });
  });
});
