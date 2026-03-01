---
name: mp-execute
description: 'Execute checklist tasks in grouped loops with executor/reviewer/checker/resolver agents. Use when: "execute checklist", "run this task list", "complete unchecked tasks"'
argument-hint: "<checklist-path | mpx [phase N | task | all]>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git diff *), Bash(git status *), Bash(git add *), Bash(git commit *), AskUserQuestion, Task, Skill
metadata:
  author: MartinoPolo
  version: "0.1"
  category: project-management
---

# Execute Tasks

Execute tasks using grouped agentic loops.

## Input

- Checklist mode: `/mp-execute CHECKLIST_MARTIN1.md`
- MPX mode: `/mp-execute mpx`, `/mp-execute mpx phase 2`, `/mp-execute mpx task`
- If param missing: ask user for mode/path. Use AskUserQuestion tool with mpx as one option and root level checklist `*.md` in project root containing unchecked tasks (`- [ ]`) as others.

## Scope

- Checklist mode: execute one checklist file
- MPX mode: execute from `.mpx/ROADMAP.md` + phase `CHECKLIST.md` files
- In both modes: consume `HANDOFF.md` from project root if present

## Orchestration

### Step 0: Consume HANDOFF.md (both modes)

1. Check project root for `HANDOFF.md`
2. If not present, continue normally
3. If present, read and store as session context input
4. Pass this context to `mp-executor` for all task groups
5. Delete `HANDOFF.md` after successful read (ephemeral lifecycle)

### Step 1: Resolve execution source

If first argument is `mpx`:

1. Read `.mpx/ROADMAP.md`
2. Find eligible phase(s) and unfinished tasks from `.mpx/phases/*/CHECKLIST.md`
3. Build task source from unfinished items
4. Track status in phase checklists and roadmap (not a single standalone checklist)

Otherwise:

1. Treat argument as checklist path
2. Read that checklist as task source

### Step 2: Read + group tasks

1. Read checklist
2. Collect unchecked tasks (`- [ ]`)
3. Split into logical groups of **2-5 tasks** (same section when possible)

In MPX mode, group per phase section/order; in checklist mode, group within the provided file.

### Step 3: Detect available checks (lint, build, typecheck, format etc.)

Spawn `mp-checks-detector` to detect runnable check commands (build, typecheck, lint, format...) and package manager:

### Step 4: Per-group execution loop

For each group:

1. Spawn `mp-executor` agent with:
   - group tasks
   - original task/spec text
   - session handoff context (if consumed)
   - checklist path
2. After executor finishes, spawn in parallel:
   - `mp-reviewer-code-quality`
   - `mp-reviewer-best-practices`
   - `mp-reviewer-spec-alignment` with task spec
   - `mp-checker` agent with detected check commands
3. If reviewer/checker reports issues, optionally spawn `mp-issue-resolver` agent
   - pass findings + failing commands
   - max 3 iterations per failed check
4. Mark completed tasks as `[x]`
5. For unresolved blockers, keep unchecked and append reason in checklist `## Blockers` (or inline unresolved note)
6. Commit completed work — after marking tasks complete, invoke `/mp-commit` skill
   - Scope commit to files changed in this group
   - Commit message reflects the group's tasks (e.g., `feat(scope): implement auth flow`)
   - Skip commit if no tasks were completed in this group

In MPX mode, update phase `CHECKLIST.md` and roadmap phase status where relevant.

### ROADMAP Concision Rule (MPX mode)

When a phase becomes complete, keep ROADMAP records minimal:

- Completed phase gets **one line only** in `## Phases` (mark complete)
- Remove completed phase details from other roadmap sections
- Keep extra mention only when needed to explain an unblock/dependency for an incomplete or blocked phase
- Keep `## Phase Details` focused on incomplete/blocked phases only

### Step 5: Group hard gate review

After all tasks are completed or unresolved, run full gate:

1. Spawn 6 parallel subagents with resolved scope:

- `mp-reviewer-code-quality`
- `mp-reviewer-best-practices`
- `mp-reviewer-spec-alignment`
- `mp-reviewer-security`
- `mp-reviewer-performance`
- `mp-reviewer-error-handling`

2. Spawn `mp-checker` agent
3. If issues remain, spawn `mp-issue-resolver` agent with all findings and failed checks
4. If still unresolved, mark affected tasks as unresolved with clear reason and continue

### Step 6: Finalization

- Ensure tracked state reflects actual status:
  - Checklist mode: target checklist (`[x]`, unresolved notes, blockers)
  - MPX mode: phase checklists + roadmap phase progress
- In MPX mode, if a phase changed to complete during execution, collapse its roadmap record to one concise line and prune redundant references
- Final commit — invoke `/mp-commit` for any remaining uncommitted changes (checklist updates, roadmap status, docs)
- Summarize completed/skipped/unresolved tasks
- Spawn `mp-docs-updater` agent with list of changes to update docs

## Failure Policy

If blocker persists (unresolved errors, repeated failures, context limits, long fix loops):

- Stop retrying that task group
- Mark affected tasks unresolved with reason
- Continue next group unless user asked to stop

## Output

```markdown
Mode: [checklist|mpx]
Source: [checklist path | phase(s)]
Groups: [N]

Completed:

- [task]

Unresolved:

- [task] — [reason]

Checks:

- typecheck: pass/fail
- lint: pass/fail
- build: pass/fail

Review:

- minimal: pass/fail
- full: pass/fail
```
