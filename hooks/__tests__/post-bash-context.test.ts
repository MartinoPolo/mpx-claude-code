import { describe, it, expect, vi } from "vitest";
import { determineContext } from "../post-bash-context.js";

describe("post-bash-context", () => {
  describe("git push", () => {
    it("returns no-PR message when push succeeds and no PR exists", () => {
      const err = new Error("no pull requests found") as Error & { status: number; stderr: string };
      err.status = 1;
      err.stderr = "no pull requests found for branch";
      const mockExec = vi.fn(() => {
        throw err;
      });
      const result = determineContext(
        "git push origin feature/42",
        { stdout: "", stderr: "", exit_code: 0 },
        "/repo",
        { execSync: mockExec },
      );
      expect(result).toBe(
        "Pushed to remote. No PR exists for this branch yet.",
      );
      expect(mockExec).toHaveBeenCalledWith("gh pr view --json url", {
        cwd: "/repo",
        stdio: "pipe",
        timeout: 10000,
      });
    });

    it("returns null when push succeeds and PR already exists", () => {
      const mockExec = vi.fn(() =>
        JSON.stringify({ url: "https://github.com/org/repo/pull/1" }),
      );
      const result = determineContext(
        "git push origin main",
        { stdout: "", stderr: "", exit_code: 0 },
        "/repo",
        { execSync: mockExec },
      );
      expect(result).toBeNull();
    });

    it("returns null when gh is unavailable (network error)", () => {
      const mockExec = vi.fn(() => {
        throw new Error("ENOENT: gh not found");
      });
      const result = determineContext(
        "git push origin feature/42",
        { stdout: "", stderr: "", exit_code: 0 },
        "/repo",
        { execSync: mockExec },
      );
      expect(result).toBeNull();
    });

    it("returns null when git push fails (exit_code 1)", () => {
      const mockExec = vi.fn();
      const result = determineContext(
        "git push origin feature/42",
        { stdout: "", stderr: "error: failed to push", exit_code: 1 },
        "/repo",
        { execSync: mockExec },
      );
      expect(result).toBeNull();
      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe("package install", () => {
    it("returns vulnerability warning when stderr contains vulnerabilities", () => {
      const result = determineContext(
        "npm install",
        {
          stdout: "added 50 packages",
          stderr: "found 3 vulnerabilities",
          exit_code: 0,
        },
        "/repo",
      );
      expect(result).toBe(
        "Package install detected vulnerabilities in stderr. Consider running audit.",
      );
    });

    it("returns null when no vulnerabilities in stderr", () => {
      const result = determineContext(
        "npm install",
        { stdout: "added 50 packages", stderr: "", exit_code: 0 },
        "/repo",
      );
      expect(result).toBeNull();
    });

    it("returns vulnerability warning for yarn add with vulnerabilities", () => {
      const result = determineContext(
        "yarn add react",
        {
          stdout: "",
          stderr: "2 vulnerabilities found",
          exit_code: 0,
        },
        "/repo",
      );
      expect(result).toBe(
        "Package install detected vulnerabilities in stderr. Consider running audit.",
      );
    });
  });

  describe("gh pr create", () => {
    it("returns PR created message with URL on success", () => {
      const result = determineContext(
        "gh pr create --title 'feat' --body 'desc'",
        {
          stdout:
            "https://github.com/org/repo/pull/42\n",
          stderr: "",
          exit_code: 0,
        },
        "/repo",
      );
      expect(result).toBe(
        "PR created: https://github.com/org/repo/pull/42",
      );
    });
  });

  describe("unrelated commands", () => {
    it("returns null for ls -la", () => {
      const result = determineContext(
        "ls -la",
        { stdout: "total 0", stderr: "", exit_code: 0 },
        "/repo",
      );
      expect(result).toBeNull();
    });

    it("returns null for empty command", () => {
      const result = determineContext(
        "",
        { stdout: "", stderr: "", exit_code: 0 },
        "/repo",
      );
      expect(result).toBeNull();
    });
  });
});
