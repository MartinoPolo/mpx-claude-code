// Shared, harness-agnostic worktree-hub logic: path convention, base-branch
// resolution, `.worktreeinclude` copying, and per-worktree dev-server port
// allocation. The two CLI entries (`setup-worktree.mts`, `remove-worktree.mts`)
// and their tests all consume this module. Everything that touches git or the
// filesystem takes an injectable runner so the pure logic stays unit-testable.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

// --- Constants ---------------------------------------------------------------

export const HUB_CONFIG_FILE = ".worktree-hub.json";
export const WORKTREE_INCLUDE_FILE = ".worktreeinclude";
export const PORTS_FILE = ".worktree-ports.json";
export const REGISTRY_FILE = ".ports.json";
export const WORKTREE_ROOT_SUFFIX = ".worktrees";

export const PACKAGE_MANAGERS = {
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
  npm: "package-lock.json",
} as const;

export type PackageManager = keyof typeof PACKAGE_MANAGERS | "none";

export interface HubConfig {
  /** Absolute worktree root; derived from the repo location when absent. */
  worktreeRoot: string | null;
  /** Base ref to fork from; null = auto-detect via origin/HEAD. */
  defaultBase: string | null;
  /** Package manager to install with; "none" skips install. */
  install: PackageManager | "auto";
  /** Server name → base port. Empty = no managed ports. */
  servers: Record<string, number>;
}

export const DEFAULT_HUB_CONFIG: HubConfig = {
  worktreeRoot: null,
  defaultBase: null,
  install: "auto",
  servers: {},
};

// --- Git runner --------------------------------------------------------------

/**
 * Runs a git command and returns trimmed stdout, or null when git exits
 * non-zero (missing ref, not a repo, …). Injectable for tests.
 */
export type GitRunner = (args: readonly string[], cwd?: string) => string | null;

export const defaultGit: GitRunner = (args, cwd) => {
  try {
    return execFileSync("git", args as string[], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

// --- Repo / path resolution --------------------------------------------------

/**
 * Absolute path of the MAIN checkout for the repo containing `cwd`, i.e. the
 * parent of the shared `.git` common dir. Identical from any worktree, so every
 * tool computes the same worktree root. Null when not in a git repo.
 */
export function resolveMainRepo(cwd: string, git: GitRunner = defaultGit): string | null {
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
  if (!common) return null;
  // `.git` lives inside the main checkout; its parent is the checkout root.
  return path.dirname(path.resolve(common));
}

/**
 * The worktree root for a repo: config override, else a per-repo sibling folder
 * `<parent>/<repo><WORKTREE_ROOT_SUFFIX>` next to the main checkout (visible to
 * Fork and `wtr`, outside the repo tree). Derived from location, never a
 * hard-coded drive.
 */
export function computeWorktreeRoot(mainRepo: string, config: HubConfig): string {
  if (config.worktreeRoot) return path.resolve(config.worktreeRoot);
  const parent = path.dirname(mainRepo);
  const repoName = path.basename(mainRepo);
  return path.join(parent, `${repoName}${WORKTREE_ROOT_SUFFIX}`);
}

/** Target folder for a worktree named `name` (branch name; slashes nest). */
export function computeWorktreePath(worktreeRoot: string, name: string): string {
  return path.join(worktreeRoot, name);
}

// --- Base-branch resolution (§5) --------------------------------------------

export interface BaseResolution {
  base: string | null;
  /** Where the value came from, for logging and for erroring out cleanly. */
  source: "explicit" | "config" | "origin-head" | "remote-show" | "none";
}

/**
 * Resolves the base ref to fork a new worktree from. Order: explicit arg →
 * config.defaultBase → origin/HEAD symbolic-ref → `git remote show origin`.
 * Returns { base: null } when nothing resolves, so the caller decides whether
 * to prompt (interactive) or fail (agent run) — this module never blocks.
 */
export function resolveBaseBranch(
  opts: { explicitBase?: string | null; config: HubConfig; cwd: string; git?: GitRunner },
): BaseResolution {
  const git = opts.git ?? defaultGit;

  if (opts.explicitBase) return { base: opts.explicitBase, source: "explicit" };
  if (opts.config.defaultBase) return { base: opts.config.defaultBase, source: "config" };

  const symbolic = git(["symbolic-ref", "refs/remotes/origin/HEAD"], opts.cwd);
  if (symbolic) {
    const stripped = symbolic.replace(/^refs\/remotes\/origin\//, "");
    if (stripped) return { base: stripped, source: "origin-head" };
  }

  const remoteShow = git(["remote", "show", "origin"], opts.cwd);
  if (remoteShow) {
    const match = remoteShow.match(/HEAD branch:\s*(\S+)/);
    if (match && match[1] !== "(unknown)") return { base: match[1], source: "remote-show" };
  }

  return { base: null, source: "none" };
}

// --- Config loading ----------------------------------------------------------

/**
 * Loads `<repoRoot>/.worktree-hub.json`, filling gaps with defaults. A missing
 * or malformed file yields defaults (auto base, auto package manager, no ports)
 * so repos without a config still work.
 */
export function loadHubConfig(repoRoot: string): HubConfig {
  const file = path.join(repoRoot, HUB_CONFIG_FILE);
  if (!existsSync(file)) return { ...DEFAULT_HUB_CONFIG };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<HubConfig>;
    const servers =
      raw.servers && typeof raw.servers === "object"
        ? Object.fromEntries(
            Object.entries(raw.servers).filter(
              ([, port]) => Number.isInteger(port) && (port as number) > 0,
            ),
          )
        : {};
    return {
      worktreeRoot: typeof raw.worktreeRoot === "string" ? raw.worktreeRoot : null,
      defaultBase: typeof raw.defaultBase === "string" ? raw.defaultBase : null,
      install: (raw.install as HubConfig["install"]) ?? "auto",
      servers,
    };
  } catch {
    return { ...DEFAULT_HUB_CONFIG };
  }
}

// --- Package manager ---------------------------------------------------------

/**
 * Resolves which package manager to install with. An explicit config value
 * wins; "auto" detects from the lockfile; the presence of a `package.json`
 * with no lockfile falls back to npm. Returns "none" when nothing installs.
 */
export function detectPackageManager(dir: string, config: HubConfig): PackageManager {
  if (config.install && config.install !== "auto") return config.install;
  for (const [manager, lockfile] of Object.entries(PACKAGE_MANAGERS)) {
    if (existsSync(path.join(dir, lockfile))) return manager as PackageManager;
  }
  return existsSync(path.join(dir, "package.json")) ? "npm" : "none";
}

// --- .worktreeinclude copy (§4) ---------------------------------------------

/**
 * Gitignored paths matching `.worktreeinclude` in `sourceRoot`, using git's own
 * ignore machinery (`ls-files -o -i --exclude-from`), so the semantics match
 * gitignore exactly. `--directory` collapses a fully-ignored folder to its name.
 * Returns paths relative to `sourceRoot`; empty when the include file is absent.
 */
export function listIncludedPaths(
  sourceRoot: string,
  git: GitRunner = defaultGit,
): string[] {
  const includeFile = path.join(sourceRoot, WORKTREE_INCLUDE_FILE);
  if (!existsSync(includeFile)) return [];
  const out = git(
    [
      "ls-files",
      "-o",
      "-i",
      "--directory",
      `--exclude-from=${includeFile}`,
    ],
    sourceRoot,
  );
  if (!out) return [];
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Copies each `.worktreeinclude` match into the new worktree, preserving
 * relative location. Each path is taken from `sourceRoot` when present, else
 * `mainRepo` (create may run from a worktree that lacks a machine-local file).
 * Returns the relative paths actually copied.
 */
export function copyIncludedPaths(opts: {
  sourceRoot: string;
  mainRepo: string;
  targetRoot: string;
  git?: GitRunner;
}): string[] {
  const git = opts.git ?? defaultGit;
  const fromSource = listIncludedPaths(opts.sourceRoot, git);
  const fromMain = listIncludedPaths(opts.mainRepo, git);
  const relPaths = Array.from(new Set([...fromSource, ...fromMain]));

  const copied: string[] = [];
  for (const rel of relPaths) {
    const source = existsSync(path.join(opts.sourceRoot, rel))
      ? path.join(opts.sourceRoot, rel)
      : path.join(opts.mainRepo, rel);
    if (!existsSync(source)) continue;
    const target = path.join(opts.targetRoot, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
    copied.push(rel);
  }
  return copied;
}

// --- Port allocation (§6) ----------------------------------------------------

export type PortMap = Record<string, number>;

/** Server names sorted by declared base port (stable slot offsets). */
export function sortedServerNames(config: HubConfig): string[] {
  return Object.keys(config.servers).sort(
    (a, b) => config.servers[a] - config.servers[b],
  );
}

/**
 * Block size = number of managed servers. Each worktree occupies one slot `k`;
 * server `s` in slot `k` binds `declaredBase[s] + k * blockSize`. Distinct slots
 * never overlap, so two worktrees never collide within a project.
 */
export function blockSize(config: HubConfig): number {
  return Object.keys(config.servers).length;
}

/** The port map for a given slot. Empty when no servers are managed. */
export function portsForSlot(config: HubConfig, slot: number): PortMap {
  const size = blockSize(config);
  const ports: PortMap = {};
  for (const name of Object.keys(config.servers)) {
    ports[name] = config.servers[name] + slot * size;
  }
  return ports;
}

/**
 * Recovers the slot a `.worktree-ports.json` map represents by inverting the
 * allocation for the lowest-base server. Returns null when the map is empty or
 * inconsistent with the current config (e.g. servers changed since it was
 * written), so a stale file never poisons the taken set.
 */
export function slotForPorts(config: HubConfig, ports: PortMap): number | null {
  const size = blockSize(config);
  if (size === 0) return null;
  const names = sortedServerNames(config);
  const anchor = names[0];
  const port = ports[anchor];
  if (!Number.isInteger(port)) return null;
  const slot = (port - config.servers[anchor]) / size;
  if (!Number.isInteger(slot) || slot < 0) return null;
  // Every server must agree, else the file predates the current server set.
  for (const name of names) {
    if (ports[name] !== config.servers[name] + slot * size) return null;
  }
  return slot;
}

/** Lowest non-negative integer not in `taken`. */
export function lowestFreeSlot(taken: ReadonlySet<number>): number {
  let slot = 0;
  while (taken.has(slot)) slot += 1;
  return slot;
}

/**
 * Probes a TCP port on 127.0.0.1 by attempting to bind it. Resolves true when
 * free, false when held (EADDRINUSE) or otherwise unbindable. `node:net` gives
 * one API across Win/macOS/Linux — no OS-specific `netstat`/`ss` shell-out.
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/** True when every port in a slot's block is bindable right now. */
export async function isSlotFree(config: HubConfig, slot: number): Promise<boolean> {
  const ports = Object.values(portsForSlot(config, slot));
  const results = await Promise.all(ports.map((p) => isPortFree(p)));
  return results.every(Boolean);
}

// --- Worktree enumeration & port files (§6.2–6.4) ---------------------------

/**
 * Absolute paths of every worktree git knows for this repo, via
 * `git worktree list --porcelain`. This is the ground truth that heals
 * out-of-band (Fork/GUI) deletions — a removed worktree simply isn't listed.
 */
export function listWorktreePaths(cwd: string, git: GitRunner = defaultGit): string[] {
  const out = git(["worktree", "list", "--porcelain"], cwd);
  if (!out) return [];
  const paths: string[] = [];
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      paths.push(path.resolve(line.slice("worktree ".length).trim()));
    }
  }
  return paths;
}

/** Reads a worktree's `.worktree-ports.json`, or null when absent/malformed. */
export function readPortsFile(worktreeDir: string): PortMap | null {
  const file = path.join(worktreeDir, PORTS_FILE);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as PortMap;
    }
    return null;
  } catch {
    return null;
  }
}

/** Writes the authoritative per-worktree `.worktree-ports.json`. */
export function writePortsFile(worktreeDir: string, ports: PortMap): void {
  writeFileSync(
    path.join(worktreeDir, PORTS_FILE),
    `${JSON.stringify(ports, null, 2)}\n`,
  );
}

/**
 * Slots already claimed by live worktrees, read from each one's authoritative
 * `.worktree-ports.json`. `excludePath` skips the worktree being created (it may
 * not exist on disk yet). Files inconsistent with the current config are ignored
 * (see `slotForPorts`), so a stale allocation never blocks a fresh one.
 */
export function takenSlotsFromWorktrees(opts: {
  config: HubConfig;
  worktreePaths: readonly string[];
  excludePath?: string;
}): Set<number> {
  const taken = new Set<number>();
  const exclude = opts.excludePath ? path.resolve(opts.excludePath) : null;
  for (const wt of opts.worktreePaths) {
    if (exclude && path.resolve(wt) === exclude) continue;
    const ports = readPortsFile(wt);
    if (!ports) continue;
    const slot = slotForPorts(opts.config, ports);
    if (slot !== null) taken.add(slot);
  }
  return taken;
}

/**
 * Allocates a collision-free slot + port map for a new worktree. Reconciles
 * against live git worktrees first (§6.4 self-heal), then probes each candidate
 * block with `node:net` to dodge ports held by unrelated processes. Returns an
 * empty map (slot 0) when the repo manages no servers.
 */
export async function allocatePorts(opts: {
  config: HubConfig;
  cwd: string;
  newWorktreePath: string;
  git?: GitRunner;
  slotFree?: (config: HubConfig, slot: number) => Promise<boolean>;
}): Promise<{ slot: number; ports: PortMap }> {
  if (blockSize(opts.config) === 0) return { slot: 0, ports: {} };

  const git = opts.git ?? defaultGit;
  const slotFree = opts.slotFree ?? isSlotFree;
  const worktreePaths = listWorktreePaths(opts.cwd, git);
  const taken = takenSlotsFromWorktrees({
    config: opts.config,
    worktreePaths,
    excludePath: opts.newWorktreePath,
  });

  let slot = lowestFreeSlot(taken);
  // Walk upward past any block whose ports an unrelated process is holding.
  while (!(await slotFree(opts.config, slot))) {
    taken.add(slot);
    slot = lowestFreeSlot(taken);
  }
  return { slot, ports: portsForSlot(opts.config, slot) };
}

// --- Advisory registry (§6.2, §6.4) -----------------------------------------

export type Registry = Record<string, number>;

/** Reads the advisory `<worktreeRoot>/.ports.json` cache, or {} when absent. */
export function readRegistry(worktreeRoot: string): Registry {
  const file = path.join(worktreeRoot, REGISTRY_FILE);
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Registry;
    }
    return {};
  } catch {
    return {};
  }
}

/** Writes the advisory registry, creating the worktree root if needed. */
export function writeRegistry(worktreeRoot: string, registry: Registry): void {
  mkdirSync(worktreeRoot, { recursive: true });
  writeFileSync(
    path.join(worktreeRoot, REGISTRY_FILE),
    `${JSON.stringify(registry, null, 2)}\n`,
  );
}

/**
 * Prunes registry entries whose worktree git no longer knows or whose folder is
 * gone on disk (§6.4). Returns the pruned registry; the caller persists it. This
 * is what frees a Fork-deleted worktree's block on the next allocation.
 */
export function reconcileRegistry(opts: {
  registry: Registry;
  liveWorktreePaths: readonly string[];
}): Registry {
  const live = new Set(opts.liveWorktreePaths.map((p) => path.resolve(p)));
  const pruned: Registry = {};
  for (const [wt, slot] of Object.entries(opts.registry)) {
    const abs = path.resolve(wt);
    if (live.has(abs) && existsSync(abs)) pruned[wt] = slot;
  }
  return pruned;
}

/** Drops one worktree from the advisory registry (called at removal). */
export function removeFromRegistry(worktreeRoot: string, worktreePath: string): void {
  const registry = readRegistry(worktreeRoot);
  const abs = path.resolve(worktreePath);
  let changed = false;
  for (const key of Object.keys(registry)) {
    if (path.resolve(key) === abs) {
      delete registry[key];
      changed = true;
    }
  }
  if (changed) writeRegistry(worktreeRoot, registry);
}

/** Removes a directory tree, tolerating locks (best-effort). Returns success. */
export function removeTree(dir: string): boolean {
  try {
    rmSync(dir, { recursive: true, force: true });
    return !existsSync(dir);
  } catch {
    return false;
  }
}
