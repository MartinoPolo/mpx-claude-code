---
name: mpx-setup
description: "Unified project setup. Auto-detects state — fresh init, existing codebase conversion, or restructure of outdated .mpx/."
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Glob, Grep, Skill, Task, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.1"
  category: project-management
---

# Project Setup

Unified entry point for all project onboarding. Auto-detects project state and routes to the correct path.

## Examples

**User says:** "/mpx-setup" (in empty directory)
**Actions:** Detect no code/no .mpx → Path A → interactive spec creation → git init → parse spec
**Result:** Full project scaffolding with .mpx/ phases ready for execution

**User says:** "/mpx-setup" (in existing codebase)
**Actions:** Detect source files, no .mpx → Path B → scan codebase → generate spec → parse
**Result:** Existing features marked [IMPLEMENTED], new requirements phased for execution

**User says:** "/mpx-setup" (with outdated .mpx/)
**Actions:** Health check fails → Path C → fix SPEC/CHECKLISTs, split oversized phases
**Result:** Restructured .mpx/ with valid phases ready to continue

## Detection Logic

Deterministic — no model reasoning needed:

```
has_source = glob(*.ts, *.js, *.py, *.go, *.rs, *.java, *.rb, *.php, *.svelte, *.vue, *.jsx, *.tsx)
has_mpx    = exists(.mpx/)

No .mpx + no source → PATH A: Fresh Init
No .mpx + source    → PATH B: Convert Existing
Has .mpx            → MXP Health Check → healthy? ask overwrite/add-req/abort : PATH C: Restructure
```

### Step 0: Detect State

1. Check for `.mpx/` directory
2. Glob for source files: `*.ts`, `*.js`, `*.py`, `*.go`, `*.rs`, `*.java`, `*.rb`, `*.php`, `*.svelte`, `*.vue`, `*.jsx`, `*.tsx`
3. Route per logic above

If `.mpx/` exists, run the **MXP Health Check** below before routing.

---

## MXP Health Check

Run all checks. Collect failures. Any failure → Path C.

| #   | Check                                                              | Failure                    |
| --- | ------------------------------------------------------------------ | -------------------------- |
| 1   | `.mpx/SPEC.md` exists and non-empty                                | Missing/empty spec         |
| 2   | `.mpx/ROADMAP.md` exists and non-empty                             | Missing/empty roadmap      |
| 3   | At least one `phases/NN-*/` directory exists                       | No phase directories       |
| 4   | Every phase dir has `CHECKLIST.md`                                 | Phase(s) missing checklist |
| 5   | No legacy files (`TASKS.md`, `TODO.md`, `task-*.md` in phase dirs) | Legacy files detected      |
| 6   | Every phase has ≤10 uncompleted tasks                              | Oversized phase(s)         |
| 7   | ROADMAP.md phase entries match actual phase directories            | Roadmap/directory mismatch |

**All checks pass → healthy.** Use `AskUserQuestion`:

- **Overwrite** — delete `.mpx/`, restart as Path A or B (based on source detection)
- **Add requirements** — invoke `/mpx-add-requirements` instead
- **Abort** — stop

**Any check fails → Path C: Restructure.**

---

## PATH A: Fresh Init

For new projects with no code and no `.mpx/`.

### Workflow

```
┌─────────────┐
│  PATH A     │
└──────┬──────┘
       ▼
┌─────────────────┐
│ Check .git      │
└──────┬──────────┘
       ▼
┌─────────────────┐
│ /mpx-create-spec│ ◄── Interactive tech stack Q&A
└──────┬──────────┘
       ▼
┌─────────────────┐
│ Confirm git init│
└──────┬──────────┘
       ▼
┌─────────────────┐
│ /mpx-init-repo  │ ◄── Deterministic script
└──────┬──────────┘
       ▼
┌─────────────────┐
│ /mpx-parse-spec │ ◄── Creates phased plan
└──────┬──────────┘
       ▼
┌─────────────────┐
│ Phase Split     │ ◄── Enforce 3-6 tasks per phase
│ Check           │
└──────┬──────────┘
       ▼
┌─────────────────┐
│ Summary         │
└─────────────────┘
```

### Steps

**A1: Check Git**

- Does `.git/` exist?
- If not, note that git init will happen in A3.

**A2: Create Specification**

```
Use Skill tool: skill: "mpx-create-spec"
```

**A3: Confirm Git Initialization**

Use `AskUserQuestion`:

> "Ready to initialize git repository? This will create `.git/`, `.gitignore`, and initial commit."

- Yes → invoke `/mpx-init-repo`
- No → skip

```
Use Skill tool: skill: "mpx-init-repo"
```

**A4: Parse Specification**

```
Use Skill tool: skill: "mpx-parse-spec"
```

**A5: Phase Splitting Check**

Run the **Phase Splitting Algorithm** (see below) on all generated phases.

**A6: Summary**

```
Project Initialized Successfully!

Project: [Name]
Tech Stack: [Language] + [Framework] + [Database]

Files Created:
  .gitignore              ✓
  .claude/CLAUDE.md       ✓
  .mpx/SPEC.md            ✓
  .mpx/ROADMAP.md         ✓
  .mpx/phases/            ✓

Git Status:
  Repository initialized  ✓ / skipped
  Initial commit created  ✓ / skipped

Next Steps:
  Run `/mp-execute mpx` to start Phase 1 with fresh context.
  Run `/mpx-show-project-status` to check progress at any time.
```

---

## PATH B: Convert Existing

For existing codebases with source files but no `.mpx/`.

### Workflow

```
┌─────────────┐
│  PATH B     │
└──────┬──────┘
       ▼
┌──────────────────┐
│ Verify .git      │
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Scan codebase    │ ◄── mpx-codebase-scanner agent
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Present & confirm│
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Gather goals     │
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Generate SPEC.md │ ◄── [IMPLEMENTED] markers
└──────┬───────────┘
       ▼
┌──────────────────┐
│ /mpx-parse-spec  │
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Phase Split Check│
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Update CLAUDE.md │
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Summary          │
└──────────────────┘
```

### Steps

**B1: Verify Git**

- `.git/` must exist. If missing → tell user to run `git init` first.

**B2: Scan Codebase**

Spawn `mpx-codebase-scanner` agent:

```
Use Task tool:
  subagent_type: "mpx-codebase-scanner"
  prompt: "Scan the codebase in the current directory and produce a structured report. Follow your scanning steps exactly."
```

Store the full report.

**B3: Present Findings & Confirm**

Display detected profile summary. Use `AskUserQuestion`:

- **Looks correct** — proceed
- **Needs corrections** — user provides fixes
- **Scan missed features** — user lists additions

Apply corrections before proceeding.

**B4: Gather Goals**

Use `AskUserQuestion`: "What do you want to build, fix, or improve? Describe your goals."

If multiple goals, follow up to clarify priority and dependencies.

**B5: Generate SPEC.md**

Create `.mpx/SPEC.md` with:

- Header noting converted project and `[IMPLEMENTED]` markers
- Tech stack from scan
- Existing features marked `[IMPLEMENTED]`
- New requirements from user goals
- Technical constraints

```markdown
# [Project Name] — Specification

> **Converted from existing project.** Features marked `[IMPLEMENTED]` already exist in the codebase. Do not create setup tasks for existing infrastructure. Phase planning should start from New Requirements.

Generated: [Date]

## Project Overview

[From scan report]

## Tech Stack

[From scan report]

## Project Structure

[From scan report]

## Dev Commands

[From scan report]

## Existing Features [IMPLEMENTED]

### [Feature 1] [IMPLEMENTED]

[Brief description]

## New Requirements

### [Goal 1]

[Description]

#### Acceptance Criteria

- [Derived from user description]

## Technical Constraints

- Must integrate with existing codebase patterns
- Preserve existing functionality
- Follow established project conventions

## Dependencies Between Requirements

[Map if any new requirements depend on others]
```

**B6: Parse Specification**

```
Use Skill tool: skill: "mpx-parse-spec"
```

**B7: Phase Splitting Check**

Run the **Phase Splitting Algorithm** on all generated phases.

**B8: Update .claude/CLAUDE.md**

Create or update `.claude/CLAUDE.md` in the project directory with real project info from the scan report.

Before writing:

- If `.claude/CLAUDE.md` exists with non-template content → `AskUserQuestion`: overwrite, merge, or skip
- If empty or template-only → overwrite silently

**B9: Summary**

```
Project Converted Successfully!

Project: [Name]
Tech Stack: [Language] + [Framework] + [Database]

Existing Features (preserved):
  - [Feature 1]
  - [Feature 2]

New Requirements (planned):
  - [Goal 1]
  - [Goal 2]

Files Created:
  .mpx/SPEC.md           ✓
  .mpx/ROADMAP.md        ✓
  .mpx/phases/           ✓
  .claude/CLAUDE.md      ✓ [created/updated]

Phases: [N] phases focusing on new work
  1. [Phase name] ([N] tasks)
  2. [Phase name] ([N] tasks)

Next Steps:
       Run `/mp-execute mpx` to start Phase 1 with fresh context.
  Run `/mpx-show-project-status` to check progress at any time.
```

---

## PATH C: Restructure

For projects where `.mpx/` exists but has health issues.

### Workflow

```
┌─────────────┐
│  PATH C     │
└──────┬──────┘
       ▼
┌──────────────────┐
│ Present issues   │ ◄── From health check
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Fix SPEC.md      │ ◄── Scanner or create-spec
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Fix CHECKLISTs   │ ◄── Migrate legacy or generate
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Split oversized  │ ◄── Phase Splitting Algorithm
│ phases           │
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Rebuild ROADMAP  │ ◄── Preserve completed states
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Update CLAUDE.md │
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Summary          │
└──────────────────┘
```

### Steps

**C1: Present Health Issues**

Display all failed health checks to the user. Use `AskUserQuestion`:

- **Fix all** — proceed with automatic fixes
- **Review one by one** — confirm each fix
- **Abort** — stop

**C2: Fix Missing/Empty SPEC.md**

If SPEC.md missing or empty:

- Source files exist → spawn `mpx-codebase-scanner`, generate spec (like Path B steps B2-B5)
- No source files → invoke `/mpx-create-spec` (like Path A step A2)

If SPEC.md exists and non-empty → skip.

**C3: Fix Missing CHECKLISTs**

For each phase directory missing `CHECKLIST.md`:

1. Check for legacy files (`TASKS.md`, `TODO.md`, `task-*.md`) in the phase dir
2. If legacy files found → migrate content into proper CHECKLIST.md format
3. If no legacy files → generate minimal CHECKLIST.md from ROADMAP.md phase entry and SPEC.md
4. Delete legacy files after migration

**C4: Split Oversized Phases**

Run the **Phase Splitting Algorithm** on all phases with >6 uncompleted tasks.

**C5: Rebuild ROADMAP.md**

Regenerate ROADMAP.md from current phase directories:

- Preserve completed states (`- [x]`)
- Preserve existing decisions and blockers sections
- Fix phase numbering to match directory structure
- Update task counts per phase
- Fix dependency references if phases were renumbered
- Collapse each completed phase to one concise line in roadmap phase list
- Remove redundant completed-phase mentions in roadmap details/overview
- Keep completed-phase mentions outside phase list only when needed to explain unblocked dependencies for incomplete/blocked phases

**C6: Update .claude/CLAUDE.md**

Same as Path B step B8.

**C7: Summary**

```
Project Restructured Successfully!

Fixes Applied:
  [✓/✗] SPEC.md — [created/already valid]
  [✓/✗] ROADMAP.md — [rebuilt/already valid]
  [✓/✗] Missing CHECKLISTs — [N fixed]
  [✓/✗] Legacy files — [N migrated, N deleted]
  [✓/✗] Oversized phases — [N split into M phases]
  [✓/✗] CLAUDE.md — [updated/created]

Phase Structure:
  1. [Phase name] ([N] tasks) [status]
  2. [Phase name] ([N] tasks) [status]

Next Steps:
       Run `/mp-execute mpx` to continue work.
  Run `/mpx-show-project-status` to verify structure.
```

---

## Phase Splitting Algorithm

> **Full algorithm details:** See `references/phase-splitting.md`

**Quick summary:** Split phases with >6 uncompleted tasks. Group by section headings, target 3-6 tasks per phase, preserve completed states.

---

## Error Handling

- **No `.git/` in Path B:** "No git repository found. Run `git init` first."
- **Scanner agent fails:** Report error, suggest manual spec creation with `/mpx-create-spec`
- **`/mpx-parse-spec` fails:** Suggest checking SPEC.md format
- **`/mpx-create-spec` fails:** Stop and report error
- **`/mpx-init-repo` fails (e.g., git not installed):** Continue but warn user
- **No source files in Path B:** Suggest Path A instead

## Troubleshooting

| Problem                                    | Solution                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| Health check: "Missing/empty spec"         | SPEC.md missing or empty — Path C will regenerate it                     |
| Health check: "No phase directories"       | `.mpx/phases/` is empty — restructure creates phases from spec           |
| Health check: "Legacy files detected"      | Old TASKS.md/TODO.md found — restructure migrates to CHECKLIST.md format |
| Health check: "Oversized phase(s)"         | Phase has >10 uncompleted tasks — splitting algorithm breaks it up       |
| Health check: "Roadmap/directory mismatch" | Phase folders don't match ROADMAP.md entries — restructure syncs them    |
| Scanner agent fails                        | Try manual spec creation with `/mpx-create-spec` instead                 |

## Notes

- This skill orchestrates other skills — it doesn't do implementation itself
- Each sub-skill handles its own error cases
- The user can always run individual skills (`/mpx-create-spec`, `/mpx-parse-spec`, etc.) directly
- All project files are created in `.mpx/` directory
- The scanner agent runs with sonnet model for cost efficiency
- Detection logic is deterministic — no LLM reasoning for routing decisions
