# Session Handoff

Date: 2026-07-19 (evening — continuation after session-limit interruption)

Audit session part 2: all agreed next steps EXECUTED via parallel sub-agent workstreams. Part-1 audit fixes are committed (`97a20af`..`40ac793` + Grovekeeper `2ca198c`). Part-2 work is committed in four follow-up commits (dedup / orchestrator redesign / hardening / docs). Nothing pushed anywhere.

## Progress This Session

1. **Committed part-1 audit fixes** — 5 commits in mpx (hooks, deprecated/, tauri-tester move, skills, docs; tests 105/105) + `mp-tauri-tester` commit in Grovekeeper.
2. **Dedup system implemented** (`skills/shared/` reference library, ADOPTED convention: imperative step "Read `${CLAUDE_SKILL_DIR}/../shared/FILE.md` now"):
   - `GIT_COMMIT_WORKFLOW.md` — canonical commit/push/PR phases; consumers mp-commit (0.4), mp-commit-push (0.4), mp-commit-push-pr (0.5), mp-pr (0.4).
   - `GITHUB_ISSUE_TEMPLATE.md` — extended with label commands + PRD sub-issue linking; consumers mp-issue-create (0.5), mp-to-issues (0.8), mp-board-to-issues (0.4). Dangling `@skills/shared` refs fixed. mp-bug-report intentionally separate.
   - `REVIEWER_PROTOCOL.md` — shared scope/verify/output boilerplate; all 7 `agents/mp-reviewer-*.md` load it via mandatory `cat $HOME/.claude/skills/shared/REVIEWER_PROTOCOL.md` first step; role-specific judgment kept inline.
   - `deep-modules.md` + `interface-design.md` — moved from mp-architecture-review (0.3); mp-execute's fork deleted; mp-scanner-architecture + mp-tdd-executor repointed.
   - `detect-project-scripts.sh` single-sourced under `scripts/`; mp-script-discovery (0.2) calls it via `$HOME`.
   - Broken bare `../shared/` refs fixed in mp-batch-execute (+REFERENCE.md), mp-board-setup, mp-playwright-test.
   - allowed-tools hygiene: broad `Bash(git *)`/`Bash(gh *)` dropped from mp-issue-create, mp-pr, mp-commit, mp-commit-push, mp-commit-push-pr (narrow sets cover the bodies; rare escalation commands will prompt — accepted).
3. **Orchestrator redesign for the 140k ceiling** (mp-execute 1.16→**2.0**, 377→263 lines; mp-ship 0.1→0.2, 225→196):
   - Review-fix + test-fix loops → ONE nested general-purpose orchestrator driven by `skills/shared/VERIFY_FIX_ORCHESTRATOR.md` (mp-checker → parallel mp-reviewer-* → analyze in own context → mp-executor with concrete fixes → re-verify, ≤3 iterations). Returns ONLY bounded JSON {status, iterations_used, files_changed, summary≤10 lines, blockers, unresolved_findings}.
   - CI failures → sub-agent driven by `skills/shared/CI_FIX_AGENT.md`; main never reads `gh run view --log-failed`.
   - Merge conflicts → sub-agent (resolve, verify, push), 5-line JSON return.
   - mp-ship: base sync delegated to the `mp-sync-base` skill; CI fix shares CI_FIX_AGENT.md.
   - Stays in main: parsing, mp-issue-analyzer, user gates, loop counters, committer/PR spawns, final report. Projected main context ~10-18k/run (was 60-100k+).
4. **Hardening/leftovers**: mp-skill-audit 0.4 — 12 checks now incl. spawned-agent-exists, allowed-tools paths exist, dead grants, ≤200-line cap (runnable), README-sync. mp-check-fix trigger phrases; mp-vocabulary H1; mp-code-clean 0.2 names exact agents (general-purpose review / mp-executor fixes). Stale `~/.claude` residue deleted (CudFnWfu, CuyAtjA7, settings.pre-symlink-backup.json — all verified stale); `~/.claude/.git` is a 0-byte GitKraken remnant (harmless, delete anytime).
5. **README.md fully synced** (pipeline diagram for 2.0, Shared References table with all 10 files, repointed links, trigger descriptions, 12 audit rules).

## Key Decisions

1. Reference convention ADOPTED: `${CLAUDE_SKILL_DIR}/../shared/FILE.md` imperative Read steps (no @import; bare relative paths broken; lazy loading verified). Effect: all shared/ consumers.
2. Agent strategy: nested orchestrators use generic `general-purpose` spawns with shared prompt files; named agents kept where tool restriction matters (7 read-only reviewers) or role contracts exist (mp-executor, mp-checker, mp-git-committer, mp-pr-manager). Full agent-elimination migration remains OPTIONAL/undecided.
3. mp-execute 2.0 contract: main = orchestrator only; anything verbose (findings, test failures, CI logs, conflicts) lives and dies in sub-agent context; bounded JSON is the only thing that returns.
4. Broad-grant policy: allowed-tools list only commands the body actually uses.

## Next Steps

1. **Push when ready** — mpx `main` is ahead by 9+ commits, Grovekeeper by 1; nothing pushed.
2. **Uncommitted user edits left in tree** (intentionally): `instructions/AGENTS.md` (+Environment section: Git Bash syntax for manual commands) and `settings.json` (model → sonnet). Commit these yourself, e.g. `chore: add environment section, switch default model to sonnet`.
3. **Field-test mp-execute 2.0** on a real small issue; watch that the verify-fix orchestrator returns valid bounded JSON and main context stays ~10-20k. Same for mp-ship's CI path.
4. Run `/mp-skill-audit` once to exercise the 12 checks against the freshly refactored repo.
5. Optional/deferred: full agent-elimination migration; mp-ship's mp-sync-base runs in main context (complex conflicts land there) — revisit if it bloats.

## Critical Files

- `skills/shared/` — 10-file reference library (workflows, protocols, sub-agent prompts). The dedup backbone.
- `skills/mp-execute/SKILL.md` (2.0) + `skills/shared/VERIFY_FIX_ORCHESTRATOR.md` + `skills/shared/CI_FIX_AGENT.md` — the new orchestrator model.
- `README.md` — synced inventory of record; keep it in sync with every change (memory rule).

## Working Memory

- Junctions are live: repo edits take effect in `~/.claude` and `~/.claude-work` instantly; settings.json on next session. Don't remove/rename `~/.claude`.
- `${CLAUDE_SKILL_DIR}` substitution is harness-guaranteed and verified live; bare relative paths in SKILL.md resolve to project cwd (broken).
- Skill discovery = `skills/*/SKILL.md`; `skills/shared/` has no SKILL.md on purpose — never add one.
- Version-bump rule: bump `metadata.version` for non-trivial skill edits; 1-liners exempt.
- Windows: `mklink` via Git Bash mangles paths — PowerShell `New-Item -ItemType Junction`; file symlinks need admin.
- mp-executor is Sonnet: always pass concrete pre-analyzed fix instructions, never "fix the issues".
