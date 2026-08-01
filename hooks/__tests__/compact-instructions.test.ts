import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractCompactInstructions } from "../compact-instructions.js";

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

describe("extractCompactInstructions", () => {
  it("returns the section body and stops at the next '## ' heading", () => {
    const result = extractCompactInstructions(
      ["# Title", "", "## Compact instructions", "", "Keep the sections.", "", "## Preferences", "", "Other."].join("\n"),
    );
    expect(result).toBe("Keep the sections.");
  });

  it("returns the section body when it runs to end of file", () => {
    const result = extractCompactInstructions(["## Compact instructions", "", "Last line.", ""].join("\n"));
    expect(result).toBe("Last line.");
  });

  it("ignores '###' subheadings inside the section", () => {
    const result = extractCompactInstructions(
      ["## Compact instructions", "", "Intro.", "", "### Detail", "", "More.", "", "## Next"].join("\n"),
    );
    expect(result).toBe("Intro.\n\n### Detail\n\nMore.");
  });

  it("returns an empty string when the heading is absent", () => {
    expect(extractCompactInstructions("# Title\n\n## Preferences\n\nText.")).toBe("");
  });
});

describe("compact-instructions hook process", () => {
  it("exits 0 and prints the section body", () => {
    const source = writeFixture(
      "with-section.md",
      ["## Compact instructions", "", "Preserve file paths.", "", "## Preferences", "", "Ignored."].join("\n"),
    );
    const { stdout, status } = runHook(source);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("Preserve file paths.");
  });

  it("exits 0 and prints nothing when the source file is missing", () => {
    const { stdout, status } = runHook(path.join(scratch, "does-not-exist.md"));
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("exits 0 and prints nothing when the heading is absent", () => {
    const source = writeFixture("no-section.md", "# Title\n\n## Preferences\n\nText.\n");
    const { stdout, status } = runHook(source);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });
});
