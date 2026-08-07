# Worktree Hub — cross-repo worktree creation, dev-server ports, and harness wiring

**Status:** PROPOSAL — pre-approval gate. Nothing here is implemented yet. Do not execute until the
owner signs off section by section.

**Owner:** Martin Poloch. **Home:** `mpx-claude-code` (the harness-agnostic scripts + shared docs
live here; other repos consume them).

---

## 1. Problem & goals

Worktrees are created by several tools (Claude Code, Pi, Fork, plain `git worktree add`) and deleted
by several tools (Fork, `git worktree remove`, GUIs). Today:

- The one real creator, `scripts/setup-worktree.sh`, copies `.env` files, IDE config, and installs
  deps — but does **not** copy TLS certs, hard-requires a `dev`/`develop` base, uses a path
  convention that disagrees with the owner's documented one, and installs in the foreground.
- Dev-server ports are **fixed per project** (e.g. Storybook and the components preview bind the same
  ports in every worktree). Two worktrees cannot serve at once, and agents routinely guess the wrong
  port when they spawn a server.
- There is no shared source of truth an agent can read to know "for *this* worktree, the dev server is
  on port X, Storybook on port Y."

**Goals**

1. One creation/removal implementation, harness-agnostic, cross-platform, callable the same way from
   every tool.
2. A `.worktreeinclude` standard (gitignore-style) that declares which gitignored files carry into a
   new worktree (certs, machine-local env files, secrets) — per repo.
3. Background dependency install.
4. Robust base-branch determination (no hard-coded `dev`).
5. **Per-worktree dev-server ports**, allocated at creation, released at removal, resilient to
   out-of-band deletion (Fork), stored as a single source of truth the configs *and* the agents read.
6. Generalize the port hub to **all** repos, then adapt the skills to consult it instead of guessing.

---

## 2. Language & format decision — Node/TypeScript, not `.sh`

**Recommendation: rewrite the hub as `.mts` (TypeScript ESM run under Node).** Answers the owner's
"do they have to be `.sh`?" — no, and bash is the wrong choice for what we are adding.

| Criterion | bash (`.sh`) | Node `.mts` (recommended) |
|---|---|---|
| Cross-platform | Needs Git Bash on Windows; path/quis quirks | Runs identically on Win/macOS/Linux |
| JSON port registry | awk/sed/jq gymnastics | Native `JSON.parse`/`stringify` |
| Probe a listening port | shell out to `netstat`/`ss` (OS-specific) | `node:net` — one API everywhere |
| Drive git | fine | `child_process` — fine |
| Repo precedent | current worktree scripts | `scripts/status-line.mts` already sets the `.mts` precedent |
| Harness hooks | exec any command | exec `node script.mts` — no `.sh` requirement |

Claude Code's `WorktreeCreate`/`WorktreeRemove` hooks and Grovekeeper both just exec a command, so the
runtime is free. Migrate `setup-worktree.sh` → `setup-worktree.mts` and `remove-worktree.sh` →
`remove-worktree.mts`; keep thin `.sh`/PowerShell shims only if any caller cannot exec node directly.
Update Grovekeeper's spawn (`src-tauri/src/commands/worktree_commands.rs`) from `bash …setup-worktree.sh`
to the node invocation.

---

## 3. Path convention (approved)

Standard target: **`C:/_MP_work/<repo>.worktrees/<branch>`** (per the owner's existing memory —
per-repo sibling folder, visible to Fork and `wtr`, outside the repo tree). This **replaces**
`setup-worktree.sh`'s current shared `../worktrees/<name>`. The hub computes the path from the repo's
own location, so it is identical no matter which tool calls it.

---

## 4. `.worktreeinclude` standard

A per-repo, gitignore-syntax file at repo root listing gitignored paths to copy into each new
worktree. Same format Claude Code and Codex both already honor natively, so it doubles as their config
where those native paths work.

- Tracked files are never copied (git already provides them via the shared object store).
- Only listed gitignored paths are copied, preserving relative location.
- Example (yoursafe-components): `config/ssh/` (TLS certs — else `yarn start` dies with `ENOENT cert.pem`)
  and `.env*.local` (machine-local tuning such as the Playwright worker count).

The hub reads `.worktreeinclude` and copies matches from the **source worktree** (the one the create
command was run from) into the new one. Falls back to the main checkout if a source path is absent.

---

## 5. Base-branch determination

Replace the hard-coded `dev`/`develop` requirement. Resolution order:

1. Explicit `--base <ref>` argument if given.
2. Per-repo config (see §7) `defaultBase`, if set.
3. The repo's actual default branch, detected via `git symbolic-ref refs/remotes/origin/HEAD`
   (falls back to `git remote show origin`), so `main` / `master` / `develop` are all handled without
   assumption.
4. Prompt only if detection fails and the session is interactive; never block a non-interactive
   (agent) run — error out with a clear message instead.

---

## 6. The port hub (core new capability)

### 6.1 Model

Each project declares a **base port and the set of servers** it runs (see §7). The hub assigns each
worktree a contiguous, collision-free block and records it as the single source of truth.

### 6.2 Source of truth — where the ports live

Two-layer, because worktrees are created and deleted by tools that will never call our hub:

- **Per-worktree file** (authoritative for that worktree): `.worktree-ports.json` at the worktree
  root, **gitignored** (per-machine, per-worktree ephemeral state; committing it would cause conflicts
  and point at wrong ports). Shape: `{ "components": <port>, "docs": <port>, … }`. Configs and agents
  read *this* file. Because it lives inside the worktree, it travels/dies with the folder — a Fork
  deletion takes it with it, so it can never point at a stale allocation. The hub adds
  `.worktree-ports.json` to each repo's `.gitignore` during rollout.
- **Project-level registry** (advisory cache for fast allocation): a single file per project outside
  the worktrees, e.g. `C:/_MP_work/<repo>.worktrees/.ports.json`, mapping worktree path → block. Lives
  outside any repo so it is never committed. Used only to speed up allocation; never trusted blindly.

### 6.3 Allocation (at creation)

1. Enumerate the project's worktrees via `git worktree list --porcelain` (authoritative — reflects
   Fork/CLI creations and prunes, independent of our registry).
2. For each existing worktree, read its `.worktree-ports.json` if present; treat those ports as taken.
3. Additionally probe with `node:net` to catch ports held by unrelated processes.
4. Assign the lowest free contiguous block at/above the project base; write the new worktree's
   `.worktree-ports.json`; update the advisory registry.

### 6.4 Release (at removal) + reconciliation (self-healing)

- `remove-worktree.mts` deletes the worktree's block from the advisory registry before removing the
  folder.
- **When reconciliation runs:** lazily, at the *start of every allocation run* (i.e. every `create`),
  before any port is assigned. Not a daemon, not a timer. Also exposed as a standalone `--reconcile`
  flag for a manual sweep.
- **Mechanism (4 steps):**
  1. Read the advisory registry (`<repo>.worktrees/.ports.json`): path → port block.
  2. Ground truth: `git worktree list --porcelain` → the set of paths git actually knows.
  3. **Drop** every registry entry whose path is absent from that set, or whose folder is gone on
     disk. Those blocks are now free. ← this is what heals a Fork/GUI deletion.
  4. Rebuild the "taken" set from surviving entries plus a `node:net` probe of each candidate port
     (catches ports held by unrelated processes), then assign the new worktree the lowest free block.
- So a Fork-deleted worktree's ports come back on the **next `create`**, automatically — no cleanup
  step. The authoritative `.worktree-ports.json` already died with the folder; the registry is only a
  cache, pruned against git. Answers the owner's "sometimes I delete them inside Fork" concern.

### 6.5 Consumers

- **Configs** read `.worktree-ports.json` instead of the committed `.env.development` port literals:
  Vite (`config/vite.*`), the Storybook launcher (§ this repo's `start-storybook.js` already reads
  `VITE_DOCS_PORT` — point it at the worktree file), and Playwright `baseURL`.
- **Agents / skills** read the same file to know which ports to spawn on and to poll (see §8).

---

## 7. Per-repo config

One config file per repo (e.g. `.worktree-hub.json`, committed) so the shared hub stays generic:

```jsonc
{
  "worktreeRoot": "C:/_MP_work/<repo>.worktrees",   // usually derived; override if needed
  "defaultBase": null,                                // null = auto-detect (see §5)
  "install": "yarn",                                  // yarn | pnpm | npm | none
  "servers": {                                        // names → base port; block assigned per worktree
    "components": 8100,
    "docs": 8101
  }
}
```

`.worktreeinclude` stays a separate file (different format — gitignore syntax). Repos without a config
get sensible defaults (auto base branch, detected package manager, no managed ports).

---

## 8. Skills adaptation

**Finding (verified 2026-08-07):** no skill hard-codes a port. They already defer to "the project's
`AGENTS.md` / memory for the exact port" (`mp-playwright-test` SKILL, `shared/PLAYWRIGHT_TESTING.md`).
So the behavioral fix is **one global rule**, not per-skill edits.

**Concrete consumers:**

- *Config/scripts (per repo — read the port file directly):* `config/playwright.config.ts` (`baseURL`),
  `scripts/start-storybook.js`, `config/vite.preview.components.config.ts`,
  `config/vite.preview.storybook.config.ts`. Vite `loadEnv` reads dotenv only, not JSON — the
  `vite.preview.*` configs read `.worktree-ports.json` explicitly and pass `port:`; the Storybook
  launcher (already JS) reads the JSON directly. **Fallback lives in the config/launcher default**
  (e.g. `readPorts().docs ?? 8101`), never in `AGENTS.md`.
- *Skills (behavioral — no port logic, they inherit the global rule):* `mp-playwright-test` +
  `shared/PLAYWRIGHT_TESTING.md`, `mp-continue` (port-zombie kill/restart), `mp-ship`, `mp-execute`,
  `mp-check-fix`.

**Global rule** — add to the top-level `AGENTS.md` (Phase 4):

> **Dev-server ports:** before starting any dev / preview / Storybook / e2e server, check
> `.worktree-ports.json` at the worktree root for this worktree's assigned ports and use those. Never
> assume a fixed port or reuse another worktree's. (Fallback defaults live in the project's
> config/launcher, not here.)

One rule makes every skill port-aware without editing each. List the exact config files touched at
execution time by grepping for the port literals rather than hard-coding a count here.

---

## 9. Harness wiring

| Harness | Wiring | Caveat |
|---|---|---|
| Claude Code | `WorktreeCreate`/`WorktreeRemove` hooks exec the `.mts` hub for `claude --worktree`; manual `git worktree add` + hub for in-session | In-session `EnterWorktree` / subagent isolation **ignore** the hooks (anthropics/claude-code#36205) → keep using manual create per existing memory |
| Pi | No core worktree feature; call the hub `.mts` manually, or wrap in a thin Pi `onCreate` extension later | Extension ecosystem is fragmented; manual call is the reliable path |
| Codex | **Dropped** — owner uses GPT models via Pi, not Codex | Codex worktree root is not configurable anyway (openai/codex#10599) |
| Grovekeeper | Repoint its spawn from `bash setup-worktree.sh` to the node hub | Already spawns async → background install is free from the UI |

---

## 10. Execution phases (each gated on approval)

1. **Hub rewrite** — `setup-worktree.mts` + `remove-worktree.mts`: path convention (§3), base-branch
   detection (§5), `.worktreeinclude` copy (§4), background install. No ports yet. Repoint Grovekeeper.
2. **Port hub** — per-repo config (§7), allocation/release/reconcile (§6), `.worktree-ports.json`.
3. **Config consumers** — point Vite / Storybook launcher / Playwright at the worktree port file, per
   repo, starting with yoursafe-components.
4. **Skills** — adapt server-spawning skills to the port file; write the shared reference (§8).
5. **Rollout** — add `.worktree-hub.json` + `.worktreeinclude` to each remaining repo.

---

## 11. Open decisions — ALL APPROVED 2026-08-07

1. ✅ **Language:** `.mts` (Node/TS) over bash for the hub (§2).
2. ✅ **Registry location:** advisory registry per-project at `<repo>.worktrees/.ports.json` (not a
   single global registry) — blast radius, matches path convention.
3. ✅ **Port file name/shape:** `.worktree-ports.json` inside each worktree, gitignored (§6.2).
4. ✅ **Shims:** require node everywhere; add a `.sh`/PowerShell shim only if a concrete caller needs it.
5. ✅ **Config filename:** `.worktree-hub.json` per repo (§7).

Plan is finalized. Execution starts from the `mpx-claude-code` main checkout, on a new feature branch
(Phase 1 = the `.mts` hub rewrite, entirely in-repo).
