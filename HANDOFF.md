# Session Handoff

Date: 2026-07-19

Full repository audit session (6 parallel Sonnet sub-agent audits + research + implementation). All fixes are **uncommitted in the working tree** — review, then commit with `/mp-commit` (conventional commits, likely split into a few logical commits).

## Progress This Session

**Audit** covered: symlink topology (.claude / .claude-work), all 43 skills, 21 agents, 12 hooks, settings, scripts, rules, instructions, README, plus fetched official skill/hook/memory/plugin best practices.

**Implemented (uncommitted, ~63 changed paths, `npm test` 105/105 green):**

- Deleted `hooks/gh-transform.js` (+ its test + settings registration) — it force-drafted every PR against the "PRs normal by default" convention. `hooks/compact-context.js` no longer teaches draft PRs; `mp-pr`/`mp-commit-push-pr` cleaned of gh-transform mentions.
- Replaced dead agent spawns with scripts: `mp-review` + `mp-sync-base` now run `node $HOME/.claude/scripts/detect-base-branch.js` (was archived `mp-base-branch-detector`); `mp-suppression-audit` runs `bash $HOME/.claude/scripts/detect-check-scripts.sh` (was archived `mp-checks-detector`). Versions bumped.
- Fixed hook timeout inversions in `settings.json`: pre-commit-gate 60→130s (internal 120s), format-lint-file 15→50s (internal worst 45s).
- `mp-harvest-decisions`: detection signal now `mp-grill`/`mp-hitl`/`mp-architecture-review` (was nonexistent `gk-design-*`).
- `mp-gemini-fetch`: install fixed to `@google/gemini-cli`. `mp-execute`: dead allowed-tools script grant removed.
- `scripts/init-repo.sh`: next-steps now current pipeline (`/mp-grill → /mp-to-prd → /mp-to-issues → /mp-execute`); `ln -s` advice replaced with WINDOWS-SETUP PowerShell symlink procedure.
- **Deprecation unified**: single top-level `deprecated/{skills,agents}/`; `_archive/` and `skills/deprecated/` removed; `mp-docs-updater` agent deprecated (orphaned); `mp-skill-audit` glob simplified.
- `mp-tauri-tester` moved to `C:\_MP_projects\Grovekeeper\.claude\agents\` (staged there, uncommitted).
- Templates fork fixed: `~/.claude/templates` + `~/.claude-work/templates` are now junctions to the repo (were a stale real copy / missing); `mp-init-repo`'s stale gitignore.template overwritten with canonical content (file-symlink needs admin, skipped). WINDOWS-SETUP.md setup blocks corrected (adds settings.local.json, WINDOWS-SETUP.md, templates).
- Permissions hygiene: removed stale bootstrap grants from `.claude/settings.local.json` (`rm settings.json`, mklink, `cmd.exe:*`) and one leftover entry from root `settings.local.json`.
- Context diet: `disable-model-invocation: true` added to mp-fallow-fix, mp-suppression-audit, mp-skill-audit, mp-harvest-decisions, mp-components-audit, mp-yoursafe-overview, mp-publish-obsidian-plugin; 12 long descriptions trimmed to one sentence + 2 triggers. Always-loaded skill-description context roughly halved.
- `hooks/fallow-gate.sh` deleted (dead duplicate of the .js port).
- README.md synced: mp-executor→Sonnet, 4 missing agents added, mp-docs-updater removed, mp-prd-review/mp-ship/mp-yoursafe-overview skills added, review dimensions 7 full / 4 partial, hooks table corrected (accurate dangerous-command-guard description, "4 of 9 hooks tested"), pipeline flags fixed (`--full-review`, `--no-auto-merge`; dropped nonexistent `--dry-run`).

**Memories saved** (auto-memory, this project): `project_readme_sync` (every repo edit updates README in same change), `feedback_context_budget_orchestration` (140k main-context ceiling, orchestrate via sub-agents, scripts>agents, 1-2 trigger descriptions).

## Key Decisions (and where each takes effect)

1. **PRs are normal, never draft** → effected: gh-transform hook deleted repo-wide.
2. **Scripts over agents for deterministic steps** → effected in mp-review/mp-sync-base/mp-suppression-audit; standing rule for future skills.
3. **One deprecation home: top-level `deprecated/`** (outside junctioned dirs so nothing gets discovered/loaded) → effected; `_archive` gone.
4. **Settings stay shared between .claude and .claude-work for now** → no change made; known tradeoff: work account can't diverge.
5. **herdr hook stays as-is** (unused but planned) — including its hardcoded `C:\Users\snapy` registration path.
6. **Context diet**: maintenance/personal skills are user-invoke-only; descriptions = 1 sentence + 2 triggers → effected.
7. **Reference-path convention (PENDING adoption)**: research verdict — SKILL.md has NO `@import` (closed as not-planned, anthropics/claude-code#22505); bare relative paths resolve against project cwd (broken, #56325). Reliable forms: `${CLAUDE_SKILL_DIR}/../shared/FILE.md` in prose (harness-substituted — verified live this session), `$HOME/...` inside Bash commands, selector scripts for deterministic conditionals. Lazy loading is real: referenced files enter context only when actually Read, so conditional half/full-reference loading works.
8. **Agent strategy (PENDING)**: research recommends skills + generic inline-prompt sub-agent spawns (context isolation preserved; portable degradation), keeping shared prompt text in `shared/` via `${CLAUDE_SKILL_DIR}`; named agents only where hard tool-restriction matters. Named `.claude/agents/*.md` is Claude-Code-only; SKILL.md is the Agent Skills open standard (agentskills.io, Linux Foundation) adopted by Codex CLI, Gemini CLI, Cursor, Copilot, etc. Model fields: omit `model:` (→ inherit) for portability; request tiers in prose at spawn time.

## Next Steps

1. **Review + commit the working tree** (mpx repo, ~63 paths; also commit the staged `mp-tauri-tester.md` in Grovekeeper). Suggest splitting: fix(hooks), fix(skills), refactor(deprecated), docs(readme+windows-setup), chore(settings).
2. **Decide the dedup system** (discussion pending with the analysis in hand). Proposed: keep `skills/shared/` as canonical home; migrate all cross-references to `${CLAUDE_SKILL_DIR}/../shared/...`; fix the two inert `@skills/shared/...` refs (mp-issue-create, mp-to-issues); then dedupe the clusters: commit triplet → `shared/GIT_COMMIT_WORKFLOW.md`; mp-ship → delegate to mp-sync-base; deep-modules/interface-design fork → `shared/`; detect-project-scripts.sh fork → symlink; issue-template trifurcation → all through `shared/GITHUB_ISSUE_TEMPLATE.md`; 7× reviewer boilerplate → shared reference.
3. **Execution-skill redesign for the 140k ceiling** (analysis complete, implementation pending). Core: mp-execute Steps 5/6 (review+fix, test+fix) move into a nested verify-fix orchestrator sub-agent (opus reasons, sonnet applies — same convention, different context); Step 10b CI-fix loop → dedicated sub-agent (never `gh run view --log-failed` in main); Step 9d conflicts → copy mp-ship's sync-base sub-agent pattern; bounded JSON return contracts ({status, iterations_used, files_changed, summary≤10 lines, blockers, unresolved_findings}). mp-ship Step 6 has the same CI-log leak — fix both via one shared pattern. Projected main context: ~10-20k typical (from 60-100k+).
4. **mp-skill-audit hardening**: add checks — spawned agent exists in `agents/`, allowed-tools paths exist, allowed-tools entries used in body, 200-line cap (mp-ship 224, mp-setup-react-native 237, mp-execute 377 violate), README tables in sync.
5. Remaining smaller audit items not yet acted on: mp-check-fix description lacks "Use when" triggers; mp-vocabulary missing H1; mp-code-clean unnamed sub-agent spawns; broad+narrow allowed-tools redundancy (mp-issue-create, mp-pr); stale `~/.claude` residue (CudFnWfu/, CuyAtjA7/, .git/gk, settings.pre-symlink-backup.json) — safe to delete manually.

## Critical Files

- `README.md`, `WINDOWS-SETUP.md`, `settings.json` — heavily edited, review first.
- `deprecated/` — new single deprecation home (30 skills/agents).
- `skills/mp-review/SKILL.md`, `skills/mp-sync-base/SKILL.md`, `skills/mp-suppression-audit/SKILL.md` — script-replacement edits.
- `skills/mp-execute/SKILL.md` — target of the pending orchestrator redesign (Steps 5, 6, 9d, 10b).
- `skills/shared/` — future canonical dedup home.

## Working Memory

- Junctions are whole-directory: repo edits are LIVE in both `.claude` and `.claude-work` instantly; settings.json edits affect the next session.
- `.claude-work` executes hooks from `$HOME/.claude/...` paths — works only because both point at the same repo; don't remove/rename `~/.claude`.
- `${CLAUDE_SKILL_DIR}` substitution verified working in this harness (observed live in a Skill args expansion).
- Skill discovery is one level (`skills/*/SKILL.md`); nothing under `deprecated/` loads. Windows `mklink` via Git Bash mangles paths — use PowerShell `New-Item -ItemType Junction/SymbolicLink`; file symlinks need admin.
- Version-bump rule: bump `metadata.version` for non-trivial skill edits; description-only/one-line changes exempt.
