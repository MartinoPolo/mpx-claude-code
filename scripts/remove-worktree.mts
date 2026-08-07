#!/usr/bin/env node
// Cross-platform worktree remover (Phase 1 + 2 of the worktree hub). Replaces
// remove-worktree.sh: releases the worktree's port block from the advisory
// registry before deleting the folder, then removes the worktree, branch, and
// tree, tolerating locked files.
//
// Usage: node remove-worktree.mts [--skip-confirmation] [--reconcile] [name...]

import { createInterface } from "node:readline/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  computeWorktreePath,
  computeWorktreeRoot,
  defaultGit,
  listWorktreePaths,
  loadHubConfig,
  reconcileRegistry,
  readRegistry,
  removeFromRegistry,
  removeTree,
  resolveMainRepo,
  writeRegistry,
} from "./lib/worktree-hub.mts";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[0;33m";
const CYAN = "\x1b[0;36m";

const info = (msg: string) => console.log(`${CYAN}→${RESET} ${msg}`);
const detail = (msg: string) => console.log(`  ${DIM}${msg}${RESET}`);
const warn = (msg: string) => console.log(`${YELLOW}⚠${RESET} ${msg}`);

interface Args {
  names: string[];
  skipConfirmation: boolean;
  reconcile: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { names: [], skipConfirmation: false, reconcile: false };
  for (const arg of argv) {
    if (arg === "--skip-confirmation") args.skipConfirmation = true;
    else if (arg === "--reconcile") args.reconcile = true;
    else arg.split(",").map((s) => s.trim()).filter(Boolean).forEach((n) => args.names.push(n));
  }
  return args;
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Worktree folder names living directly under the hub's worktree root. */
function managedWorktreeNames(cwd: string, worktreeRoot: string): string[] {
  const root = path.resolve(worktreeRoot);
  return listWorktreePaths(cwd)
    .filter((wt) => path.resolve(wt).startsWith(`${root}${path.sep}`))
    .map((wt) => path.relative(root, wt));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  const mainRepo = resolveMainRepo(cwd);
  if (!mainRepo) {
    console.error(`${RED}✗${RESET} Not inside a git repository.`);
    process.exit(1);
  }
  const config = loadHubConfig(mainRepo);
  const worktreeRoot = computeWorktreeRoot(mainRepo, config);

  // Always reconcile the registry against live worktrees first.
  writeRegistry(worktreeRoot, reconcileRegistry({ registry: readRegistry(worktreeRoot), liveWorktreePaths: listWorktreePaths(cwd) }));
  if (args.reconcile) {
    info(`Reconciled port registry for ${path.basename(mainRepo)}.`);
    return;
  }

  let names = args.names;
  if (names.length === 0) {
    const available = managedWorktreeNames(cwd, worktreeRoot);
    if (available.length === 0) {
      warn("No worktrees found.");
      return;
    }
    if (!process.stdin.isTTY) {
      info("Usage: node remove-worktree.mts [--skip-confirmation] [name...]");
      console.log("Available worktrees:");
      available.forEach((n) => detail(n));
      return;
    }
    console.log("Available worktrees:");
    available.forEach((n, i) => console.log(`  ${DIM}${i + 1})${RESET} ${n}`));
    const selection = await prompt("Enter numbers or names to remove (space/comma separated, q to quit): ");
    if (!selection || selection === "q") return;
    names = selection
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((item) => {
        if (/^\d+$/.test(item)) {
          const idx = Number(item) - 1;
          if (idx < 0 || idx >= available.length) {
            console.error(`${RED}✗${RESET} Invalid selection: ${item}`);
            process.exit(1);
          }
          return available[idx];
        }
        return item;
      });
  }

  // Validate targets exist.
  const targets = names.map((name) => {
    const worktreePath = computeWorktreePath(worktreeRoot, name);
    if (!existsSync(worktreePath)) {
      console.error(`${RED}✗${RESET} Worktree '${name}' not found at ${worktreePath}`);
      process.exit(1);
    }
    return { name, worktreePath };
  });

  if (!args.skipConfirmation && process.stdin.isTTY) {
    warn("Remove the following worktrees?");
    targets.forEach((t) => detail(`- ${t.name} (${t.worktreePath})`));
    const confirm = await prompt("Confirm (Y/n): ");
    if (confirm.toLowerCase() === "n") {
      warn("Cancelled");
      return;
    }
  }

  for (const { name, worktreePath } of targets) {
    console.log("");
    info(`Removing worktree '${BOLD}${name}${RESET}'...`);

    // Release the port block from the advisory registry BEFORE deleting. §6.4
    removeFromRegistry(worktreeRoot, worktreePath);

    if (defaultGit(["worktree", "remove", "--force", worktreePath]) === null) {
      detail("git worktree remove failed; unregistering manually...");
      const common = defaultGit(["rev-parse", "--git-common-dir"]);
      if (common) {
        const admin = path.join(path.resolve(common), "worktrees", name);
        if (existsSync(admin)) removeTree(admin);
      }
    }

    defaultGit(["branch", "-D", name]);

    if (existsSync(worktreePath) && !removeTree(worktreePath)) {
      warn("Branch removed, but folder deletion failed (files are locked).");
      detail(`Manually delete after closing programs using it: ${worktreePath}`);
      detail("Common causes: editor open, terminal cd'd in, dev server / watcher running.");
      continue;
    }
    console.log(`${GREEN}✓${RESET} Removed '${name}'`);
  }

  defaultGit(["worktree", "prune"]);
  console.log("");
  console.log(`${GREEN}✓${RESET} Done.`);
}

main().catch((err) => {
  console.error(`${RED}✗${RESET} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
