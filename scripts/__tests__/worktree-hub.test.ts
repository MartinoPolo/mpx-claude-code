import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import path from "node:path";

import {
  DEFAULT_HUB_CONFIG,
  type GitRunner,
  type HubConfig,
  allocatePorts,
  blockSize,
  computeWorktreePath,
  computeWorktreeRoot,
  copyIncludedPaths,
  detectPackageManager,
  isPortFree,
  listIncludedPaths,
  listWorktreePaths,
  loadHubConfig,
  lowestFreeSlot,
  portsForSlot,
  readPortsFile,
  reconcileRegistry,
  removeFromRegistry,
  resolveBaseBranch,
  slotForPorts,
  sortedServerNames,
  takenSlotsFromWorktrees,
  writePortsFile,
  writeRegistry,
} from "../lib/worktree-hub.mts";

function config(overrides: Partial<HubConfig> = {}): HubConfig {
  return { ...DEFAULT_HUB_CONFIG, ...overrides };
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "wthub-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("path convention", () => {
  it("derives a per-repo sibling worktree root", () => {
    const root = computeWorktreeRoot("C:/work/my-repo", config());
    expect(root).toBe(path.join("C:/work", "my-repo.worktrees"));
  });

  it("honors a worktreeRoot override", () => {
    const root = computeWorktreeRoot("C:/work/my-repo", config({ worktreeRoot: "D:/wt" }));
    expect(root).toBe(path.resolve("D:/wt"));
  });

  it("nests slashed branch names under the root", () => {
    const p = computeWorktreePath("C:/work/my-repo.worktrees", "martas/ci-faster");
    expect(p).toBe(path.join("C:/work/my-repo.worktrees", "martas/ci-faster"));
  });
});

describe("resolveBaseBranch", () => {
  const noGit: GitRunner = () => null;

  it("prefers an explicit base", () => {
    const r = resolveBaseBranch({ explicitBase: "release", config: config(), cwd: ".", git: noGit });
    expect(r).toEqual({ base: "release", source: "explicit" });
  });

  it("falls back to config.defaultBase", () => {
    const r = resolveBaseBranch({ config: config({ defaultBase: "develop" }), cwd: ".", git: noGit });
    expect(r).toEqual({ base: "develop", source: "config" });
  });

  it("reads origin/HEAD symbolic-ref", () => {
    const git: GitRunner = (args) =>
      args[0] === "symbolic-ref" ? "refs/remotes/origin/main" : null;
    const r = resolveBaseBranch({ config: config(), cwd: ".", git });
    expect(r).toEqual({ base: "main", source: "origin-head" });
  });

  it("parses `remote show origin` when symbolic-ref is missing", () => {
    const git: GitRunner = (args) =>
      args[0] === "remote" ? "* remote origin\n  HEAD branch: trunk\n" : null;
    const r = resolveBaseBranch({ config: config(), cwd: ".", git });
    expect(r).toEqual({ base: "trunk", source: "remote-show" });
  });

  it("returns null base when nothing resolves", () => {
    const r = resolveBaseBranch({ config: config(), cwd: ".", git: noGit });
    expect(r.base).toBeNull();
    expect(r.source).toBe("none");
  });

  it("ignores an (unknown) HEAD branch", () => {
    const git: GitRunner = (args) =>
      args[0] === "remote" ? "  HEAD branch: (unknown)\n" : null;
    expect(resolveBaseBranch({ config: config(), cwd: ".", git }).base).toBeNull();
  });
});

describe("loadHubConfig", () => {
  it("returns defaults when the file is absent", () => {
    expect(loadHubConfig(tmp)).toEqual(DEFAULT_HUB_CONFIG);
  });

  it("parses a valid config and drops invalid server ports", () => {
    writeFileSync(
      path.join(tmp, ".worktree-hub.json"),
      JSON.stringify({ install: "yarn", servers: { a: 8100, b: 8101, bad: -1, worse: "x" } }),
    );
    const cfg = loadHubConfig(tmp);
    expect(cfg.install).toBe("yarn");
    expect(cfg.servers).toEqual({ a: 8100, b: 8101 });
  });

  it("falls back to defaults on malformed JSON", () => {
    writeFileSync(path.join(tmp, ".worktree-hub.json"), "{ not json");
    expect(loadHubConfig(tmp)).toEqual(DEFAULT_HUB_CONFIG);
  });
});

describe("detectPackageManager", () => {
  it("honors an explicit config value", () => {
    expect(detectPackageManager(tmp, config({ install: "pnpm" }))).toBe("pnpm");
  });

  it("detects from a lockfile under auto", () => {
    writeFileSync(path.join(tmp, "yarn.lock"), "");
    expect(detectPackageManager(tmp, config())).toBe("yarn");
  });

  it("falls back to npm for a package.json without lockfile", () => {
    writeFileSync(path.join(tmp, "package.json"), "{}");
    expect(detectPackageManager(tmp, config())).toBe("npm");
  });

  it("returns none for a non-node repo", () => {
    expect(detectPackageManager(tmp, config())).toBe("none");
  });
});

describe(".worktreeinclude", () => {
  it("returns [] when the include file is absent", () => {
    expect(listIncludedPaths(tmp, () => "config/ssh/")).toEqual([]);
  });

  it("returns git-matched paths when the include file exists", () => {
    writeFileSync(path.join(tmp, ".worktreeinclude"), "config/ssh/\n.env.local\n");
    const git: GitRunner = (args) =>
      args[0] === "ls-files" ? "config/ssh/\n.env.local\n" : null;
    expect(listIncludedPaths(tmp, git)).toEqual(["config/ssh/", ".env.local"]);
  });

  it("copies matched files from source into the target", () => {
    const source = path.join(tmp, "src");
    const main = path.join(tmp, "main");
    const target = path.join(tmp, "target");
    mkdirSync(source, { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(source, ".worktreeinclude"), ".env.local\n");
    writeFileSync(path.join(source, ".env.local"), "SECRET=1");

    const git: GitRunner = (args, cwd) =>
      args[0] === "ls-files" && cwd === source ? ".env.local" : "";

    const copied = copyIncludedPaths({ sourceRoot: source, mainRepo: main, targetRoot: target, git });
    expect(copied).toEqual([".env.local"]);
    expect(readPortsFile(target)).toBeNull(); // sanity: unrelated file not created
  });
});

describe("port math", () => {
  const cfg = config({ servers: { components: 8100, docs: 8101 } });

  it("sorts server names by declared base port", () => {
    const reversed = config({ servers: { docs: 8101, components: 8100 } });
    expect(sortedServerNames(reversed)).toEqual(["components", "docs"]);
  });

  it("block size equals the server count", () => {
    expect(blockSize(cfg)).toBe(2);
  });

  it("assigns contiguous, non-overlapping blocks per slot", () => {
    expect(portsForSlot(cfg, 0)).toEqual({ components: 8100, docs: 8101 });
    expect(portsForSlot(cfg, 1)).toEqual({ components: 8102, docs: 8103 });
    expect(portsForSlot(cfg, 2)).toEqual({ components: 8104, docs: 8105 });
  });

  it("round-trips slot ↔ ports", () => {
    expect(slotForPorts(cfg, portsForSlot(cfg, 3))).toBe(3);
  });

  it("rejects a ports map inconsistent with the config", () => {
    expect(slotForPorts(cfg, { components: 8100, docs: 9999 })).toBeNull();
    expect(slotForPorts(cfg, {})).toBeNull();
  });

  it("returns null slot when no servers are managed", () => {
    expect(slotForPorts(config(), { a: 1 })).toBeNull();
  });

  it("lowestFreeSlot skips taken slots", () => {
    expect(lowestFreeSlot(new Set([0, 1, 3]))).toBe(2);
    expect(lowestFreeSlot(new Set())).toBe(0);
  });
});

describe("takenSlotsFromWorktrees", () => {
  const cfg = config({ servers: { components: 8100, docs: 8101 } });

  it("collects slots from each worktree's ports file, excluding the new one", () => {
    const wt0 = path.join(tmp, "wt0");
    const wt1 = path.join(tmp, "wt1");
    const wtNew = path.join(tmp, "wtNew");
    mkdirSync(wt0);
    mkdirSync(wt1);
    mkdirSync(wtNew);
    writePortsFile(wt0, portsForSlot(cfg, 0));
    writePortsFile(wt1, portsForSlot(cfg, 2));
    writePortsFile(wtNew, portsForSlot(cfg, 5));

    const taken = takenSlotsFromWorktrees({
      config: cfg,
      worktreePaths: [wt0, wt1, wtNew],
      excludePath: wtNew,
    });
    expect([...taken].sort()).toEqual([0, 2]);
  });
});

describe("allocatePorts", () => {
  const cfg = config({ servers: { components: 8100, docs: 8101 } });

  it("returns an empty map when no servers are managed", async () => {
    const r = await allocatePorts({ config: config(), cwd: tmp, newWorktreePath: tmp });
    expect(r).toEqual({ slot: 0, ports: {} });
  });

  it("assigns the lowest free slot, avoiding live worktrees and busy ports", async () => {
    const wt0 = path.join(tmp, "wt0");
    mkdirSync(wt0);
    writePortsFile(wt0, portsForSlot(cfg, 0)); // slot 0 taken by a worktree

    const git: GitRunner = (args) =>
      args[0] === "worktree" ? `worktree ${wt0}\n` : null;

    // slot 1 reported busy by an unrelated process; slot 2 is free.
    const slotFree = vi.fn(async (_c: HubConfig, slot: number) => slot >= 2);

    const r = await allocatePorts({
      config: cfg,
      cwd: tmp,
      newWorktreePath: path.join(tmp, "wtNew"),
      git,
      slotFree,
    });
    expect(r.slot).toBe(2);
    expect(r.ports).toEqual({ components: 8104, docs: 8105 });
  });
});

describe("listWorktreePaths", () => {
  it("parses porcelain output", () => {
    const git: GitRunner = () =>
      "worktree /a/main\nHEAD abc\nbranch refs/heads/main\n\nworktree /a/wt\nHEAD def\n";
    expect(listWorktreePaths(".", git)).toEqual([path.resolve("/a/main"), path.resolve("/a/wt")]);
  });
});

describe("registry reconciliation", () => {
  it("drops entries whose worktree git no longer knows or whose folder is gone", () => {
    const live = path.join(tmp, "live");
    mkdirSync(live);
    const dead = path.join(tmp, "dead"); // folder never created

    const pruned = reconcileRegistry({
      registry: { [live]: 0, [dead]: 1 },
      liveWorktreePaths: [live, dead], // dead is "known" but missing on disk
    });
    expect(pruned).toEqual({ [live]: 0 });
  });

  it("removeFromRegistry deletes one entry and persists", () => {
    const root = path.join(tmp, "root");
    const a = path.join(tmp, "a");
    const b = path.join(tmp, "b");
    writeRegistry(root, { [a]: 0, [b]: 1 });
    removeFromRegistry(root, a);
    expect(readPortsFile(root)).toBeNull(); // unrelated
    const reg = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("node:fs").readFileSync(path.join(root, ".ports.json"), "utf8"),
    );
    expect(reg).toEqual({ [b]: 1 });
  });
});

describe("isPortFree", () => {
  it("reports a bound port as not free and a spare port as free", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    const boundPort = typeof addr === "object" && addr ? addr.port : 0;

    expect(await isPortFree(boundPort)).toBe(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await isPortFree(boundPort)).toBe(true);
  });
});
