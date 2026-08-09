# Worktree Hub

Harness-agnostic worktree creation/removal plus per-worktree dev-server ports. One
implementation, callable identically from Claude Code, Pi, Fork, Grovekeeper, or a plain shell.

- Library: [`plugins/mp/scripts/lib/worktree-hub.mts`](../plugins/mp/scripts/lib/worktree-hub.mts) — all pure logic
  (path, base-branch, `.worktreeinclude`, port math, reconciliation), unit-tested in
  [`plugins/mp/scripts/__tests__/worktree-hub.test.ts`](../plugins/mp/scripts/__tests__/worktree-hub.test.ts).
- CLIs: [`plugins/mp/scripts/setup-worktree.mts`](../plugins/mp/scripts/setup-worktree.mts),
  [`plugins/mp/scripts/remove-worktree.mts`](../plugins/mp/scripts/remove-worktree.mts).
- Shell wrappers: `setup-worktree` / `remove-worktree` in
  [`plugins/mp/scripts/shell-functions.sh`](../plugins/mp/scripts/shell-functions.sh).

Runs under Node's native TypeScript type stripping — no build step, no dependencies. Bash was
dropped because the port hub needs a JSON registry, cross-platform port probing (`node:net`), and
Windows parity; the deprecated bash creators remain in [`plugins/mp/scripts/deprecated/`](../plugins/mp/scripts/deprecated/).

## Usage

```bash
node plugins/mp/scripts/setup-worktree.mts <name> [--base <ref>] [--color <hex>] [--no-open] [--reconcile]
node plugins/mp/scripts/remove-worktree.mts [--skip-confirmation] [--reconcile] [name...]
```

`<name>` is the new branch name (slashes nest under the worktree root). `--reconcile` on either
CLI prunes the port registry and exits without creating/removing anything.

## Path convention

`<parent>/<repo>.worktrees/<name>` — a per-repo sibling folder next to the main checkout, outside
the repo tree, visible to Fork and `wtr`. Derived from the repo's own location (never a hard-coded
drive), so every tool computes the same target. Override with `worktreeRoot` in the per-repo config.

## Base-branch resolution

In order: `--base <ref>` → config `defaultBase` → `git symbolic-ref refs/remotes/origin/HEAD` →
`git remote show origin`. When none resolve, the CLI errors with a clear message rather than
guessing or blocking — agent runs never hang on a prompt.

## `.worktreeinclude`

A gitignore-syntax file at the repo root listing gitignored paths (certs, machine-local env,
secrets) to carry into each new worktree. Matching uses git's own ignore machinery
(`git ls-files -o -i --exclude-from`), so semantics match gitignore exactly. Tracked files are
never copied — git already provides them. Each match is taken from the source worktree, falling
back to the main checkout when absent there. Claude Code and Codex also honor this filename
natively, so it doubles as their config.

## Per-repo config — `.worktree-hub.json`

Committed at the repo root; every field is optional and defaults keep the hub generic.

```jsonc
{
  "worktreeRoot": null,        // null = derive the sibling folder from the repo location
  "defaultBase": null,         // null = auto-detect (see above)
  "install": "auto",           // auto | yarn | pnpm | npm | none
  "servers": {                 // name → base port; omit/empty to manage no ports
    "components": 8100,
    "docs": 8101
  }
}
```

A repo with no config, or with no `servers`, gets everything except managed ports.

## Port model

Each worktree occupies one **slot** `k` (a non-negative integer). Server `s` in slot `k` binds
`declaredBasePort[s] + k * blockSize`, where the block size is the number of managed servers.
Distinct slots never overlap, so two worktrees of the same repo never collide. Cross-project
collisions (and ports held by unrelated processes) are avoided by probing each candidate block with
`node:net` before assigning it.

### Two-layer source of truth

- **`.worktree-ports.json`** — per worktree, authoritative, gitignored (the hub adds it to the
  repo's `.gitignore` on first allocation). Shape: `{ "<server>": <port>, … }`. Configs **and**
  agents read *this* file. Because it lives inside the worktree, it dies with the folder — a Fork
  deletion can never leave it pointing at a stale allocation.
- **`<repo>.worktrees/.ports.json`** — one advisory cache per project (worktree path → slot),
  outside any repo so it is never committed. Speeds allocation; never trusted blindly.

### Allocation, release, self-healing

- **Allocate** (create): enumerate worktrees via `git worktree list --porcelain`, read each one's
  `.worktree-ports.json` to mark its slot taken, probe candidate blocks, assign the lowest free
  slot, write the port file, update the advisory cache.
- **Release** (remove): drop the worktree's entry from the advisory cache *before* deleting the
  folder; the authoritative port file dies with the folder.
- **Reconcile** (self-heal): at the start of every create/remove (and via `--reconcile`), prune
  advisory entries whose worktree git no longer knows or whose folder is gone on disk. A
  Fork-deleted worktree's ports therefore come back automatically on the next run — no cleanup step.

## Consumer contract

- **Configs / launchers** (per repo) read `.worktree-ports.json` directly and keep their fallback
  default in the config/launcher itself (e.g. `readPorts().docs ?? <default>`), never in `AGENTS.md`.
- **Agents / skills** follow the global rule in
  [`instructions/AGENTS.md`](../instructions/AGENTS.md): before starting any dev/preview/Storybook/e2e
  server, read this worktree's assigned ports from `.worktree-ports.json` and use those.

## Harness wiring

| Harness | Wiring |
|---|---|
| Claude Code | `WorktreeCreate`/`WorktreeRemove` hooks exec the CLI for `claude --worktree`; in-session isolation ignores those hooks, so create manually |
| Pi | Call the CLI manually, or wrap in a thin `onCreate` extension |
| Grovekeeper | Repoint its spawn from the bash creator to `node …setup-worktree.mts` |
| Shell | Source `plugins/mp/scripts/shell-functions.sh`; `setup-worktree` cd's into the new worktree via a `WORKTREE_PATH=` stdout marker |
