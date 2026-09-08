import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runLoggedCommand } from "../install-worktree-dependencies.mts";

let temporaryDirectory: string;

beforeEach(() => {
  temporaryDirectory = mkdtempSync(path.join(tmpdir(), "worktree-install-"));
});

afterEach(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("runLoggedCommand", () => {
  it("removes output after a successful command", async () => {
    const command = path.join(temporaryDirectory, "success.mjs");
    const log = path.join(temporaryDirectory, ".worktree-install.log");
    writeFileSync(command, 'console.log("installed"); console.error("warning");\n');

    await expect(runLoggedCommand(process.execPath, [command], temporaryDirectory, log))
      .resolves.toBe(0);
    expect(existsSync(log)).toBe(false);
  });

  it("retains stdout and stderr after a failed command", async () => {
    const command = path.join(temporaryDirectory, "failure.mjs");
    const log = path.join(temporaryDirectory, ".worktree-install.log");
    writeFileSync(command, 'console.log("install output"); console.error("install error"); process.exitCode = 7;\n');

    await expect(runLoggedCommand(process.execPath, [command], temporaryDirectory, log))
      .resolves.toBe(7);
    expect(readFileSync(log, "utf8")).toContain("install output");
    expect(readFileSync(log, "utf8")).toContain("install error");
  });

  it("retains the launch error when the command cannot start", async () => {
    const log = path.join(temporaryDirectory, ".worktree-install.log");

    await expect(runLoggedCommand(path.join(temporaryDirectory, "missing"), [], temporaryDirectory, log))
      .resolves.toBe(1);
    expect(readFileSync(log, "utf8")).toMatch(/ENOENT|not found/i);
  });
});
