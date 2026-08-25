#!/usr/bin/env node
// Cross-platform worktree creator: derives the path from the repo location,
// auto-detects the base branch, copies editor config + `.worktreeinclude`
// matches, allocates per-worktree dev-server ports, and installs dependencies
// in the background.
//
// Usage: node setup-worktree.mts <name> [--base <ref>] [--color <hex>]
//                                        [--reconcile]

import { spawn } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  PORTS_FILE,
  allocatePorts,
  computeWorktreePath,
  computeWorktreeRoot,
  copyIncludedPaths,
  defaultGit,
  detectPackageManager,
  listWorktreePaths,
  loadHubConfig,
  reconcileRegistry,
  readRegistry,
  resolveBaseBranch,
  resolveMainRepo,
  writePortsFile,
  writeRegistry,
} from "./lib/worktree-hub.mts";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const CYAN = "\x1b[0;36m";

function printBanner(): void {
  console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║                                          ║${RESET}`);
  console.log(`${BOLD}${CYAN}║              WORKTREE SETUP              ║${RESET}`);
  console.log(`${BOLD}${CYAN}║                                          ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════╝${RESET}`);
  console.log("");
}

const info = (msg: string) => console.log(`${CYAN}→${RESET} ${msg}`);
const detail = (msg: string) => console.log(`  ${DIM}${msg}${RESET}`);
const fail = (msg: string): never => {
  console.error(`${RED}✗${RESET} ${msg}`);
  process.exit(1);
};

interface Args {
  name: string;
  base: string | null;
  color: string | null;
  reconcile: boolean;
}

function normalizeHex(raw: string): string | null {
  const normalized = raw.replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? `#${normalized}` : null;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { name: "", base: null, color: null, reconcile: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--base":
      case "-b":
        args.base = argv[++i] ?? fail("--base needs a ref");
        break;
      case "--color":
      case "-c": {
        const raw = argv[++i] ?? fail("--color needs a hex value");
        args.color = normalizeHex(raw) ?? fail(`Invalid color '${raw}'. Use 6-char hex like 7C3AED.`);
        break;
      }
      case "--reconcile":
        args.reconcile = true;
        break;
      case "-h":
      case "--help":
        console.log("Usage: node setup-worktree.mts <name> [--base <ref>] [--color <hex>] [--reconcile]");
        process.exit(0);
        break;
      default:
        if (arg.startsWith("-")) fail(`Unknown option: ${arg}`);
        else if (!args.name) args.name = arg;
        else fail(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

/** Appends a line to the repo's .gitignore when it is not already ignored. */
function ensureGitignored(repoRoot: string, entry: string): void {
  const already = defaultGit(["check-ignore", "-q", entry], repoRoot) !== null;
  if (already) return;
  const gitignore = path.join(repoRoot, ".gitignore");
  const current = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  appendFileSync(gitignore, `${prefix}${entry}\n`);
  detail(`Added ${entry} to .gitignore`);
}

/** Copies a directory if it exists; used for editor config carried into the worktree. */
function copyDirIfPresent(source: string, target: string): void {
  if (!existsSync(source)) return;
  cpSync(source, target, { recursive: true });
  detail(`Copied: ${path.basename(source)}/`);
}

/** Sets the Peacock color in the worktree's .vscode/settings.json. */
function setPeacockColor(worktreeDir: string, color: string): void {
  const vscodeDir = path.join(worktreeDir, ".vscode");
  mkdirSync(vscodeDir, { recursive: true });
  const settingsFile = path.join(vscodeDir, "settings.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsFile)) {
    try {
      settings = JSON.parse(readFileSync(settingsFile, "utf8")) as Record<string, unknown>;
    } catch {
      settings = {};
    }
  }
  settings["peacock.color"] = color;
  writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
  detail(`Set Peacock color: ${color}`);
}

async function main(): Promise<void> {
  printBanner();
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const sourceRoot = cwd;

  const mainRepo = resolveMainRepo(cwd);
  if (!mainRepo) fail("Not inside a git repository.");
  const config = loadHubConfig(mainRepo);
  const worktreeRoot = computeWorktreeRoot(mainRepo, config);

  // Lazy reconciliation before any allocation: prune registry entries whose
  // worktree git no longer knows (heals Fork/GUI deletions). §6.4
  const liveWorktrees = listWorktreePaths(cwd);
  writeRegistry(worktreeRoot, reconcileRegistry({ registry: readRegistry(worktreeRoot), liveWorktreePaths: liveWorktrees }));

  if (args.reconcile) {
    info(`Reconciled port registry for ${path.basename(mainRepo)}.`);
    return;
  }

  if (!args.name) fail("Usage: node setup-worktree.mts <name> [--base <ref>] [--color <hex>]");

  info(`Base repository: ${BOLD}${mainRepo}${RESET}`);

  const resolved = resolveBaseBranch({ explicitBase: args.base, config, cwd });
  if (!resolved.base) {
    fail("Could not determine a base branch. Pass --base <ref> or set defaultBase in .worktree-hub.json.");
  }
  const base = resolved.base;
  info(`Base branch: ${BOLD}${base}${RESET} ${DIM}(${resolved.source})${RESET}`);

  // Resolve a concrete start-point: local branch if present, else origin/<base>.
  const startPoint =
    defaultGit(["rev-parse", "--verify", "--quiet", base]) !== null
      ? base
      : defaultGit(["rev-parse", "--verify", "--quiet", `origin/${base}`]) !== null
        ? `origin/${base}`
        : base;

  const worktreePath = computeWorktreePath(worktreeRoot, args.name);
  mkdirSync(worktreeRoot, { recursive: true });

  info(`Creating worktree '${BOLD}${args.name}${RESET}' from '${BOLD}${startPoint}${RESET}'...`);
  if (defaultGit(["worktree", "add", "-b", args.name, worktreePath, startPoint]) === null) {
    fail(`git worktree add failed for '${args.name}'. Does the branch already exist?`);
  }

  // Editor config carried into every worktree (machine/editor-local conveniences).
  info("Copying editor config...");
  copyDirIfPresent(path.join(sourceRoot, ".vscode"), path.join(worktreePath, ".vscode"));
  copyDirIfPresent(path.join(sourceRoot, ".cursor"), path.join(worktreePath, ".cursor"));
  copyDirIfPresent(path.join(sourceRoot, ".local"), path.join(worktreePath, ".local"));
  const localSettings = path.join(sourceRoot, ".claude", "settings.local.json");
  if (existsSync(localSettings)) {
    mkdirSync(path.join(worktreePath, ".claude"), { recursive: true });
    cpSync(localSettings, path.join(worktreePath, ".claude", "settings.local.json"));
    detail("Copied: .claude/settings.local.json");
  }

  if (args.color) {
    info("Applying Peacock color...");
    setPeacockColor(worktreePath, args.color);
  }

  // Repo-declared gitignored paths (certs, machine-local env). §4
  info("Copying .worktreeinclude matches...");
  const copied = copyIncludedPaths({ sourceRoot, mainRepo, targetRoot: worktreePath });
  if (copied.length === 0) detail("Nothing declared (or no .worktreeinclude).");
  else copied.forEach((rel) => detail(`Copied: ${rel}`));

  // Per-worktree dev-server ports. §6 — inert when the repo manages no servers.
  if (Object.keys(config.servers).length > 0) {
    info("Allocating dev-server ports...");
    const { slot, ports } = await allocatePorts({ config, cwd, newWorktreePath: worktreePath });
    writePortsFile(worktreePath, ports);
    ensureGitignored(mainRepo, PORTS_FILE);
    const registry = readRegistry(worktreeRoot);
    registry[worktreePath] = slot;
    writeRegistry(worktreeRoot, registry);
    Object.entries(ports).forEach(([name, port]) => detail(`${name}: ${port}`));
  }

  const manager = detectPackageManager(worktreePath, config);
  if (manager !== "none") {
    info(`Installing dependencies with ${BOLD}${manager}${RESET} in the background...`);
    const logPath = path.join(worktreePath, ".worktree-install.log");
    const logFd = openSync(logPath, "w");
    spawn(manager, ["install"], {
      cwd: worktreePath,
      stdio: ["ignore", logFd, logFd],
      detached: true,
      shell: true,
    }).unref();
    detail(`Install running detached → ${path.relative(worktreePath, logPath)}`);
  }

  console.log("");
  console.log(`${GREEN}✓${RESET} Worktree ready: ${BOLD}${worktreePath}${RESET}`);
  console.log(`   ${BOLD}cd ${worktreePath}${RESET}`);
  // Machine-readable last line: the shell wrapper greps this to `cd` there.
  // A stdout marker sidesteps Windows temp-path translation between Git Bash
  // and Node that a shared temp file would need.
  console.log(`WORKTREE_PATH=${worktreePath}`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
