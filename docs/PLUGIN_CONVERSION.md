# Plugin conversion plan

Convert this repo into a public **Claude Code plugin** named `mp`, cross-platform, whose
Skills also run under **pi** from one source of truth. Execution happens in a separate
session; this doc is the handoff.

## Goal & shape

- One GitHub repo = one plugin `mp` (the repo is both marketplace and plugin).
- Skills invoke as `/mp:<skill>` in Claude Code; the same skills run in pi via the open
  Agent Skills standard.
- KanbanFlow is out of scope here — it becomes its own separate repo/plugin (`kf`) later.
- Primary purpose is presentation/showcase; users cherry-pick skills, they don't run the
  whole thing.

## Verified facts (don't re-litigate)

- **Namespacing is real for Skills.** Empirically confirmed with a throwaway probe plugin:
  a plugin named `mp` registers its skills as `/mp:<name>`. The suffix is the SKILL.md
  `name:` field when present, else the folder name. Commands (`commands/*.md`) namespace the
  same way. (An earlier source-verified claim that Skills are *not* prefixed was stale for
  the current release — the live probe wins.)
- **To get clean `/mp:execute`**, the skill identity must be **bare** (`execute`), not
  `mp-execute` — otherwise you get the doubled `/mp:mp-execute`.
- **Classic `~/.claude` skills and plugin skills coexist** in different namespaces
  (`/mp-ship` `(user)` vs `/mp:ship`) — no collision during migration. Retire the symlinks
  once the plugin is primary to avoid duplicate listings.
- **Plugin path variable:** hooks/scripts inside the plugin resolve via
  `${CLAUDE_PLUGIN_ROOT}`, replacing the current `$HOME/.claude/...` symlink model.
- **Not pluginnable** (stay user settings, ship as documented manual steps): the main
  `statusLine`, `model`, `env`, `permissions`, default `outputStyle`. Pluginnable: skills,
  agents, hooks (`hooks/hooks.json`), output-styles dir, `subagentStatusLine`.
- **Local dev loop:** `claude --plugin-dir <path>` loads live (no copy); `/reload-plugins`
  picks up hook/agent edits; SKILL.md edits are immediate. Marketplace install *copies* to
  `~/.claude/plugins/cache`, and skips symlinks that point outside the repo.

## Naming strategy (single source → two harnesses)

Canonical source (this repo): skill identity is **bare** (`execute`, `review`, `ship`) —
rename folders and/or set `name:` accordingly, dropping the `mp-` prefix.

| Layer | Identity | Invocation |
| --- | --- | --- |
| Canonical (this repo) | folder `execute`, bare | — |
| Claude plugin | reads as-is | `/mp:execute` |
| pi | see open decision below | `/skill:...` |

### OPEN DECISION — pi skill naming

pi has no per-group prefix; it merges all skills into one flat map keyed by `name` (frontmatter
first, folder fallback). So bare names risk colliding with third-party pi skills and lose the
`mp` association. Two viable options:

- **Option A (recommended): build-step injects the prefix.** Keep canonical bare; extend the
  existing `scripts/generate-agents.mjs` pattern into a skill-sync step that writes
  `name: mp-<folder>` into each SKILL.md copied to `mpx-pi`. pi shows `/skill:mp-execute` —
  collision-safe, keeps `mp` identity, one source of truth.
- **Option B: bare in pi too.** No transform; pi shows `/skill:execute`. Simplest, but risks
  flat-map collisions and drops the `mp` grouping.

Decision is deferred and does **not** block the Claude plugin work.

## Repo structure (target)

```
mpx-claude-code/
├─ .claude-plugin/
│  ├─ plugin.json        name:"mp", version, description, author, repository, license, keywords
│  └─ marketplace.json   lists the one plugin, source:"."
├─ skills/               public skills, bare names → /mp:<name>
├─ agents/               agent .md (names unchanged — not slash-invoked)
├─ hooks/
│  ├─ hooks.json         moved out of settings.json; paths via ${CLAUDE_PLUGIN_ROOT}
│  └─ *.mjs / notify-flash-beep.ps1
├─ output-styles/mp-terse.md
├─ scripts/              *.mjs (+ *.mts kept), shell-functions.sh (user shell helper)
└─ local/skills/         personal skills — visible for presentation, OUTSIDE plugin scan
```

## Steps

1. **Manifest.** Add `.claude-plugin/plugin.json` (name `mp`) + `.claude-plugin/marketplace.json`
   (source `.`). Makes the repo installable and re-runnable through the real probe.
2. **Rename skill identities to bare.** Drop `mp-` from shipped skills (folder and/or `name:`)
   so they register as `/mp:<name>`. Mechanical across the shipped set.
3. **Hooks → plugin form.** Move the `hooks` block from `settings.json` into `hooks/hooks.json`;
   swap every `$HOME/.claude/...` for `${CLAUDE_PLUGIN_ROOT}/...`.
4. **Delete herdr.** Remove `hooks/herdr-agent-state.ps1` and its SessionStart entry; drop the
   `herdr()` function from `scripts/shell-functions.sh`; clean any stray `herdr` references.
5. **Script porting to Node ESM** (see table). Verify with existing `__tests__` + a smoke run
   of each hook.
6. **Folder-split personal skills** into `local/skills/` (kept in the repo for presentation,
   outside the plugin's `skills/` scan; still usable locally via the classic `~/.claude`
   symlink or a separate `--plugin-dir`).
7. **Status-line config.** No secrets present — keep the files tracked (retains versioning);
   **rename project names to generic** before release. Confirm the projects reader degrades
   gracefully when the file differs on another machine (the accounts reader already does).
8. **Fix flagged cosmetics** (see below).
9. **Status line.** Ship the scripts + a copy-paste `statusLine` block in the README (the main
   status line is not pluginnable; `subagentStatusLine` is).
10. **Generalize README/docs.** Remove local coupling, generalize setup, document manual steps
    (status line, env-var roots), replace machine-specific examples.

## Script porting

Target: everything the agent touches = Node ESM. Two intentional non-Node holdouts.

| Script(s) | Action | Rationale |
| --- | --- | --- |
| CommonJS `.js` hooks | → `.mjs` (ESM) | Unify module system; mechanical (`require`→`import`, `module.exports`→`export`, `__dirname` via `fileURLToPath`) |
| Agent-invoked `.sh` (detect-*, init-repo, status-line-mr-refresh) | → `.mjs` | Drops the bash dependency — real cross-platform gain |
| `.mts` status scripts | keep | Already ESM + typed + cross-platform on modern Node; converting would strip types for no gain |
| `scripts/shell-functions.sh` | keep as shell | Sourced into the user's interactive shell and `cd`s it — a Node script can't change its parent shell. It is a personal terminal helper, not agent/plugin code |
| `hooks/notify-flash-beep.ps1` | keep, Windows-only | Deliberate OS-specific exception. Optional: a one-line platform guard so non-Windows users get a silent no-op instead of an error |

## Personal skills (folder-split, not deleted)

Coupled to personal infra / machine roots — move to `local/skills/`, keep working locally:
mp-clean-pc, mp-project-register, mp-podcast, mp-tutorial-create, mp-video-to-image,
mp-board-setup, mp-board-to-issues, mp-raycast-config. Consider dropping mp-raycast-config
(macOS Raycast + Windows DPAPI — works for no one as-is). Also replace the machine-specific
status-line data files' contents with generic examples.

## Path-resolution fixes (done)

Five skills gained an explicit `env | grep '^MPX_'` (or PowerShell `$env:`) resolve-step so
machine roots resolve reliably outside the main thread: mp-video-to-image, mp-raycast-config,
mp-project-register, mp-tutorial-create, mp-clean-pc (each version-bumped).

## Flagged cosmetics (fix during conversion)

- `skills/mp-video-to-image/scripts/video-to-sheet.mjs` hardcodes the literal `"AI GENERATED"`
  folder name as a fallback — a second unstructured assumption layered on the `MPX_*` roots.
- `mp-tutorial-create` frontmatter description says "OneDrive tutorials folder" but the body
  targets `MPX_AI_GENERATED` (a distinct root) — wording drift.
- Slash-vs-backslash path style is inconsistent within mp-video-to-image and mp-tutorial-create.

## Cross-harness notes

- Skills + `AGENTS.md` are portable under open standards; pi implements Agent Skills and reads
  `SKILL.md` directly. Hooks, subagent wiring, and status lines are proprietary per harness and
  are re-implemented (mpx-pi already does this via `extensions/` and generated `agents/`).
- The Node-ESM port helps pi too: helper scripts run unmodified under pi's Node runtime.
- Route any non-trivial hook/subagent *logic* through MCP if a second harness needs it — MCP is
  the one fully portable execution layer.

## KanbanFlow (separate, later)

Its own repo + plugin `kf` (`/kf:task-create`). Requires de-symlinking the currently
symlinked, gitignored skill content into the public repo and documenting the KanbanFlow CLI +
API-key dependency. Not part of this release.
