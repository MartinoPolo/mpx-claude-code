#!/usr/bin/env node

import { spawn } from "node:child_process";
import { appendFileSync, closeSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function runLoggedCommand(
  executable: string,
  args: string[],
  cwd: string,
  logPath: string,
  { shell = false }: { shell?: boolean } = {},
): Promise<number> {
  const logDescriptor = openSync(logPath, "w");
  const child = (() => {
    try {
      return spawn(executable, args, {
        cwd,
        stdio: ["ignore", logDescriptor, logDescriptor],
        shell,
        windowsHide: true,
      });
    } finally {
      closeSync(logDescriptor);
    }
  })();

  const exitCode = await new Promise<number>((resolve) => {
    child.once("error", (error) => {
      appendFileSync(logPath, `${error.message}\n`);
      resolve(1);
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
  if (exitCode === 0) rmSync(logPath, { force: true });
  return exitCode;
}

async function main(): Promise<void> {
  const [manager, worktreePath] = process.argv.slice(2);
  if (!manager || !["npm", "pnpm", "yarn"].includes(manager) ||
      !worktreePath || !path.isAbsolute(worktreePath)) {
    process.exitCode = 2;
    return;
  }
  process.exitCode = await runLoggedCommand(
    manager,
    ["install"],
    worktreePath,
    path.join(worktreePath, ".worktree-install.log"),
    { shell: process.platform === "win32" },
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
