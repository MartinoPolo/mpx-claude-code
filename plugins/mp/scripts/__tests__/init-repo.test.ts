import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "..", "init-repo.mjs");
const temporaryDirectories: string[] = [];

function createTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "mpx-init-repo-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runInitializer(directory: string) {
  execFileSync("node", [scriptPath], {
    cwd: directory,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test Author",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test Author",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
    stdio: "ignore",
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("init-repo", () => {
  it("creates minimal shared agent instructions", () => {
    const directory = createTemporaryDirectory();

    runInitializer(directory);

    expect(readFileSync(join(directory, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
    expect(readFileSync(join(directory, "AGENTS.md"), "utf8")).toContain(
      "project-specific conventions",
    );
    expect(
      execFileSync("git", ["log", "-1", "--format=%s"], {
        cwd: directory,
        encoding: "utf8",
      }).trim(),
    ).toBe("Initial project setup");
  });

  it("preserves existing instruction files", () => {
    const directory = createTemporaryDirectory();
    writeFileSync(join(directory, "AGENTS.md"), "existing shared instructions\n");
    writeFileSync(join(directory, "CLAUDE.md"), "existing Claude instructions\n");

    runInitializer(directory);

    expect(readFileSync(join(directory, "AGENTS.md"), "utf8")).toBe(
      "existing shared instructions\n",
    );
    expect(readFileSync(join(directory, "CLAUDE.md"), "utf8")).toBe(
      "existing Claude instructions\n",
    );
  });
});
