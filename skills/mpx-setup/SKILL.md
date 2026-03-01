---
name: mpx-setup
description: "Unified project setup. Auto-detects state and orchestrates mpx skills/agents for init, conversion, or restructure."
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Glob, Grep, Skill, Task, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.2"
  category: project-management
---

# Project Setup

Single entry point for onboarding. Detect state, route path, orchestrate specialized components.

## Responsibility Boundary

- `mpx-setup` orchestrates flow and health checks
- `mpx-add-requirements` owns SPEC authoring/updates
- `mpx-spec-analyzer` owns parsing/spec-to-plan decomposition, including phase sizing/splitting
- `mpx-parse-spec` is parser wrapper for manual SPEC edits

## Detection Logic

Deterministic routing:

```
has_source = glob(*.ts, *.js, *.py, *.go, *.rs, *.java, *.rb, *.php, *.svelte, *.vue, *.jsx, *.tsx)
has_mpx    = exists(.mpx/)

No .mpx + no source → PATH A: Fresh Init
No .mpx + source    → PATH B: Convert Existing
Has .mpx            → MXP Health Check → healthy? ask overwrite/add-req/abort : PATH C: Restructure
```

## MXP Health Check

Run checks. Any failure routes to Path C.

| #   | Check                                                              | Failure                    |
| --- | ------------------------------------------------------------------ | -------------------------- |
| 1   | `.mpx/SPEC.md` exists and non-empty                                | Missing/empty spec         |
| 2   | `.mpx/ROADMAP.md` exists and non-empty                             | Missing/empty roadmap      |
| 3   | At least one `phases/NN-*/` directory exists                       | No phase directories       |
| 4   | Every phase dir has `CHECKLIST.md`                                 | Phase(s) missing checklist |
| 5   | No legacy files (`TASKS.md`, `TODO.md`, `task-*.md`) in phase dirs | Legacy files detected      |
| 6   | ROADMAP phase entries match phase directories                      | Roadmap/directory mismatch |

If healthy, ask user:

- Overwrite
- Add requirements (`/mpx-add-requirements`)
- Abort

---

## PATH A: Fresh Init

For empty project (no source, no `.mpx/`).

1. Check `.git/`
2. Run `/mpx-add-requirements` (creates/updates SPEC and auto-parses via analyzer)
3. Ask whether to run `/mpx-init-repo`
4. Report summary

Notes:

- No phase-splitting step here; analyzer already handles phase shaping.

---

## PATH B: Convert Existing

For existing codebase with source files and no `.mpx/`.

1. Verify `.git/` exists
2. Spawn `mpx-codebase-scanner`
3. Present findings, collect corrections
4. Ask user goals
5. Generate `.mpx/SPEC.md` with (spawn multiple subagent to do an exploration):
   - converted-project context
   - detected stack/context
   - existing implemented features `[x]`
   - new requirements `[ ]`
6. Spawn `mpx-spec-analyzer` to regenerate roadmap/checklists
7. Update `.claude/CLAUDE.md` (ask overwrite/merge/skip if needed)
8. Report summary

Analyzer call:

```
Use Task tool:
  subagent_type: "mpx-spec-analyzer"
  prompt: "Read .mpx/SPEC.md and regenerate .mpx/ROADMAP.md and .mpx/phases/*/CHECKLIST.md. Skip [x] requirements as implemented unless needed for dependency/context. Ask for clarification if requirements are ambiguous."
```

---

## PATH C: Restructure

For existing `.mpx/` with health issues.

1. Present failed checks, ask: fix all / review one-by-one / abort
2. Repair SPEC availability:
   - If source exists and SPEC missing: scan + rebuild SPEC skeleton
   - If no source and SPEC missing: run `/mpx-add-requirements`
3. Normalize phase folders:
   - Ensure `.mpx/phases/NN-*/CHECKLIST.md` file exists for each phase dir
   - Remove/migrate legacy phase files (`TASKS.md`, `TODO.md`, `task-*.md`) into SPEC requirements when they contain actionable unfinished items
4. Rebuild plan by running `/mpx-parse-spec` (delegates to analyzer)
5. Update `.claude/CLAUDE.md` if needed
6. Report summary

---

## Error Handling

- No `.git/` in Path B: tell user to run `git init`
- Scanner failure: suggest manual requirements capture via `/mpx-add-requirements`
- `/mpx-add-requirements` failure: stop and report
- `/mpx-parse-spec` failure: keep files unchanged, report parse error
- `/mpx-init-repo` failure: continue with warning

## Notes

- Keep setup concise: route and orchestrate only
- Keep parsing logic in analyzer, not setup
- Keep requirement source of truth in `.mpx/SPEC.md`
- Keep execution tracking in `.mpx/ROADMAP.md` and phase `CHECKLIST.md`
