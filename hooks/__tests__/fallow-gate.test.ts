import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fallow-gate.js is a self-executing PreToolUse hook script (no exports), so it
// must be exercised as a real child process rather than imported and unit-tested
// like pre-commit-gate.js / dangerous-command-guard.js.
const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fallow-gate.js");
const scratch = mkdtempSync(path.join(tmpdir(), "fallow-gate-"));
const mockBinDir = path.join(scratch, "bin");
const mockFallowExe = path.join(mockBinDir, "fallow.exe");

// The `fallow` CLI is invoked via spawnSync without shell:true, which on Windows
// can only launch real PE executables (not .cmd/.bat shims — Node refuses those
// without shell:true). A compiled stub is the only reliable stand-in, driven by
// env vars so each test can control its version string, JSON verdict, stderr
// line, and exit code without touching fallow-gate.js itself.
const MOCK_FALLOW_SOURCE = `
using System;
class MockFallow {
    static int Main(string[] args) {
        if (args.Length > 0 && args[0] == "--version") {
            Console.Out.Write("fallow " + Environment.GetEnvironmentVariable("FALLOW_MOCK_VERSION") + "\\n");
            return 0;
        }
        string stderrMsg = Environment.GetEnvironmentVariable("FALLOW_MOCK_STDERR");
        if (!string.IsNullOrEmpty(stderrMsg)) {
            Console.Error.Write(stderrMsg + "\\n");
        }
        Console.Out.Write(Environment.GetEnvironmentVariable("FALLOW_MOCK_JSON") ?? "");
        string exitCode = Environment.GetEnvironmentVariable("FALLOW_MOCK_EXIT_CODE");
        return string.IsNullOrEmpty(exitCode) ? 0 : int.Parse(exitCode);
    }
}
`;

function findCsc(): string {
  const candidates = [
    String.raw`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`,
    String.raw`C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe`,
  ];
  const found = candidates.find(existsSync);
  if (!found) {
    throw new Error("csc.exe not found; cannot build the mock fallow.exe used by these tests.");
  }
  return found;
}

beforeAll(() => {
  mkdirSync(mockBinDir, { recursive: true });
  const srcPath = path.join(mockBinDir, "mock-fallow.cs");
  writeFileSync(srcPath, MOCK_FALLOW_SOURCE, "utf8");
  execFileSync(findCsc(), ["/nologo", `/out:${mockFallowExe}`, srcPath], { encoding: "utf8" });
});

const ENV_KEYS_TO_RESET = [
  "TERM_PROGRAM",
  "FALLOW_GATE_MIN_VERSION",
  "FALLOW_MOCK_VERSION",
  "FALLOW_MOCK_JSON",
  "FALLOW_MOCK_STDERR",
  "FALLOW_MOCK_EXIT_CODE",
];

interface RunResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runHook(
  command: string,
  envOverrides: Record<string, string | undefined> = {},
  opts: { withMockFallow?: boolean; rawStdin?: string } = {},
): RunResult {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of ENV_KEYS_TO_RESET) delete env[key];
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  if (opts.withMockFallow) {
    env.PATH = `${mockBinDir}${path.delimiter}${env.PATH ?? ""}`;
  }
  const input = opts.rawStdin ?? JSON.stringify({ tool_input: { command } });
  const result = spawnSync("node", [HOOK], { input, env, encoding: "utf8" });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
}

describe("fallow-gate", () => {
  describe("non git commit/push commands pass through untouched", () => {
    it("allows git status without attempting a fallow lookup", () => {
      const { status, stderr } = runHook("git status");
      expect(status).toBe(0);
      expect(stderr).toBe("");
    });

    it("allows ls -la", () => {
      const { status, stderr } = runHook("ls -la");
      expect(status).toBe(0);
      expect(stderr).toBe("");
    });

    it("allows git add -A", () => {
      const { status, stderr } = runHook("git add -A");
      expect(status).toBe(0);
      expect(stderr).toBe("");
    });

    it("does not match a command that merely contains 'git' as a substring", () => {
      const { status, stderr } = runHook("mygit commit -m 'x'");
      expect(status).toBe(0);
      expect(stderr).toBe("");
    });

    it("does not match 'commit' glued onto another word", () => {
      const { status, stderr } = runHook("git commitxyz");
      expect(status).toBe(0);
      expect(stderr).toBe("");
    });
  });

  describe("GIT_COMMIT_OR_PUSH matching triggers a fallow lookup", () => {
    it("matches a bare 'git commit'", () => {
      const { status, stderr } = runHook("git commit");
      expect(status).toBe(0);
      expect(stderr).toContain("fallow-gate:");
    });

    it("matches a bare 'git push'", () => {
      const { status, stderr } = runHook("git push");
      expect(status).toBe(0);
      expect(stderr).toContain("fallow-gate:");
    });

    it("matches git commit preceded by && in a compound command", () => {
      const { status, stderr } = runHook("cd repo && git commit -m 'x'");
      expect(status).toBe(0);
      expect(stderr).toContain("fallow-gate:");
    });
  });

  describe("fallow binary not found (no fallow on PATH, npx --no-install fails)", () => {
    it("skips and allows on git commit", () => {
      const { status, stderr } = runHook("git commit -m 'test'");
      expect(status).toBe(0);
      expect(stderr).toBe(
        "fallow-gate: fallow binary not found (tried PATH and npx --no-install), skipping.\n",
      );
    });

    it("skips and allows on git push", () => {
      const { status, stderr } = runHook("git push origin main");
      expect(status).toBe(0);
      expect(stderr).toBe(
        "fallow-gate: fallow binary not found (tried PATH and npx --no-install), skipping.\n",
      );
    });
  });

  describe("version floor check", () => {
    it("blocks when the resolved fallow is below the default 2.46.0 floor", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        { FALLOW_MOCK_VERSION: "2.40.0" },
        { withMockFallow: true },
      );
      expect(status).toBe(2);
      expect(stderr).toContain("fallow-gate: blocked: fallow is fallow 2.40.0, below required 2.46.0.");
      expect(stderr).toContain("upgrade fallow (npm install -g fallow@latest), or set FALLOW_GATE_MIN_VERSION= to disable.");
    });

    it("blocks below a custom FALLOW_GATE_MIN_VERSION floor", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        { FALLOW_MOCK_VERSION: "2.48.4", FALLOW_GATE_MIN_VERSION: "3.0.0" },
        { withMockFallow: true },
      );
      expect(status).toBe(2);
      expect(stderr).toContain("below required 3.0.0.");
    });

    it("does not block when the version exactly equals the floor, and proceeds to the audit", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        { FALLOW_MOCK_VERSION: "2.46.0", FALLOW_MOCK_JSON: '{"verdict":"pass"}' },
        { withMockFallow: true },
      );
      expect(status).toBe(0);
      expect(stderr).not.toContain("below required");
    });

    it("skips the floor check entirely when FALLOW_GATE_MIN_VERSION is set to an empty string", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        {
          FALLOW_MOCK_VERSION: "1.0.0",
          FALLOW_GATE_MIN_VERSION: "",
          FALLOW_MOCK_JSON: '{"verdict":"fail"}',
        },
        { withMockFallow: true },
      );
      // Reaches the audit-verdict block path (not the version-floor block path),
      // proving the floor check was bypassed despite the very old mock version.
      expect(status).toBe(2);
      expect(stderr).not.toContain("below required");
      expect(stderr).toContain("fallow-gate: blocked by fallow 1.0.0 at fallow");
    });
  });

  describe("audit verdict fail blocks the command", () => {
    it("blocks git commit with exit 2 and dumps the audit JSON to stderr", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        { FALLOW_MOCK_VERSION: "2.48.4", FALLOW_MOCK_JSON: '{"verdict":"fail"}' },
        { withMockFallow: true },
      );
      expect(status).toBe(2);
      expect(stderr).toContain("fallow-gate: blocked by fallow 2.48.4 at fallow\n");
      expect(stderr).toContain('{"verdict":"fail"}');
    });

    it("blocks git push the same way", () => {
      const { status, stderr } = runHook(
        "git push origin main",
        { FALLOW_MOCK_VERSION: "2.48.4", FALLOW_MOCK_JSON: '{"verdict":"fail"}' },
        { withMockFallow: true },
      );
      expect(status).toBe(2);
      expect(stderr).toContain("fallow-gate: blocked by fallow 2.48.4 at fallow\n");
    });
  });

  describe("audit verdict pass or absent allows the command", () => {
    it("allows when verdict is pass", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        { FALLOW_MOCK_VERSION: "2.48.4", FALLOW_MOCK_JSON: '{"verdict":"pass"}' },
        { withMockFallow: true },
      );
      expect(status).toBe(0);
      expect(stderr).toBe("");
    });

    it("allows when the audit JSON has no verdict field at all", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        { FALLOW_MOCK_VERSION: "2.48.4", FALLOW_MOCK_JSON: "{}" },
        { withMockFallow: true },
      );
      expect(status).toBe(0);
      expect(stderr).toBe("");
    });
  });

  describe("audit runtime error fails open", () => {
    it("skips with the error message when the audit reports error:true with a message", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        {
          FALLOW_MOCK_VERSION: "2.48.4",
          FALLOW_MOCK_JSON: '{"error":true,"message":"boom"}',
        },
        { withMockFallow: true },
      );
      expect(status).toBe(0);
      expect(stderr).toBe("fallow-gate: fallow audit runtime error (boom), skipping.\n");
    });

    it("skips with the generic message when error:true has no message", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        { FALLOW_MOCK_VERSION: "2.48.4", FALLOW_MOCK_JSON: '{"error":true}' },
        { withMockFallow: true },
      );
      expect(status).toBe(0);
      expect(stderr).toBe("fallow-gate: fallow audit runtime error, skipping.\n");
    });

    it("skips with the generic message when the process exits with status 2 and unparseable stdout", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        {
          FALLOW_MOCK_VERSION: "2.48.4",
          FALLOW_MOCK_JSON: "not json",
          FALLOW_MOCK_EXIT_CODE: "2",
        },
        { withMockFallow: true },
      );
      expect(status).toBe(0);
      expect(stderr).toBe("fallow-gate: fallow audit runtime error, skipping.\n");
    });
  });

  describe("other non-zero audit exit codes fail open", () => {
    it("skips and includes the first stderr line when present", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        {
          FALLOW_MOCK_VERSION: "2.48.4",
          FALLOW_MOCK_JSON: "",
          FALLOW_MOCK_STDERR: "some git error",
          FALLOW_MOCK_EXIT_CODE: "1",
        },
        { withMockFallow: true },
      );
      expect(status).toBe(0);
      expect(stderr).toBe("fallow-gate: fallow audit exited 1 (some git error), skipping.\n");
    });

    it("skips without a parenthetical when stderr is empty", () => {
      const { status, stderr } = runHook(
        "git commit -m 'x'",
        {
          FALLOW_MOCK_VERSION: "2.48.4",
          FALLOW_MOCK_JSON: "",
          FALLOW_MOCK_EXIT_CODE: "1",
        },
        { withMockFallow: true },
      );
      expect(status).toBe(0);
      expect(stderr).toBe("fallow-gate: fallow audit exited 1, skipping.\n");
    });
  });

  describe("malformed hook input", () => {
    it("skips and allows when stdin is not valid JSON", () => {
      const { status, stderr } = runHook("git commit -m 'x'", {}, { rawStdin: "not valid json {" });
      expect(status).toBe(0);
      expect(stderr).toBe("fallow-gate: failed to parse stdin JSON, skipping.\n");
    });

    it("skips and allows when stdin is empty", () => {
      const { status, stderr } = runHook("git commit -m 'x'", {}, { rawStdin: "" });
      expect(status).toBe(0);
      expect(stderr).toBe("fallow-gate: failed to parse stdin JSON, skipping.\n");
    });
  });

  describe("VS Code Copilot escape hatch", () => {
    it("exits 0 immediately without reading stdin or running fallow", () => {
      const { status, stdout, stderr } = runHook(
        "git commit -m 'x'",
        { TERM_PROGRAM: "vscode" },
        { rawStdin: "" },
      );
      expect(status).toBe(0);
      expect(stdout).toBe("");
      expect(stderr).toBe("");
    });
  });
});
