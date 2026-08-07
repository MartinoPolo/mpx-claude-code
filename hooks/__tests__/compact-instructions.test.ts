import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCompactInstructions } from "../compact-instructions.js";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "compact-instructions.js");
const scratch = mkdtempSync(path.join(tmpdir(), "compact-instructions-"));

function runHook(sourcePath: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [HOOK, sourcePath], {
      encoding: "utf8",
      input: "{}",
    });
    return { stdout, status: 0 };
  } catch (error) {
    const err = error as { stdout?: string; status?: number };
    return { stdout: err.stdout ?? "", status: err.status ?? 1 };
  }
}

function writeFixture(name: string, contents: string): string {
  const filePath = path.join(scratch, name);
  writeFileSync(filePath, contents, "utf8");
  return filePath;
}

describe("readCompactInstructions", () => {
  it("returns the trimmed contents of the first readable source", () => {
    const source = writeFixture("instructions.md", "\nKeep the sections.\n\n");
    expect(readCompactInstructions([source])).toBe("Keep the sections.");
  });

  it("falls through past missing and empty candidates", () => {
    const empty = writeFixture("empty.md", "  \n\n");
    const fallback = writeFixture("fallback.md", "Fallback instructions.");
    const missing = path.join(scratch, "missing.md");
    expect(readCompactInstructions([missing, empty, fallback])).toBe("Fallback instructions.");
  });

  it("returns an empty string when no candidate is usable", () => {
    expect(readCompactInstructions([path.join(scratch, "missing.md")])).toBe("");
  });
});

describe("compact-instructions hook process", () => {
  it("exits 0 and prints the source file contents", () => {
    const source = writeFixture(
      "with-content.md",
      "Preserve file paths.\n\n- **Key Decisions** — what and why.\n",
    );
    const { stdout, status } = runHook(source);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("Preserve file paths.\n\n- **Key Decisions** — what and why.");
  });

  it("exits 0 and prints nothing when the source file is missing", () => {
    const { stdout, status } = runHook(path.join(scratch, "does-not-exist.md"));
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("exits 0 and prints nothing when the source file is empty", () => {
    const source = writeFixture("empty-source.md", "\n  \n");
    const { stdout, status } = runHook(source);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });
});
