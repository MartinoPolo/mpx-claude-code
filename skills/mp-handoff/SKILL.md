---
name: mp-handoff
description: 'Create or update HANDOFF.md with a general session progress summary. Use when: "handoff", "save progress", "end of session"'
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, TaskList
metadata:
  author: MartinoPolo
  version: "0.3"
  category: project-management
---

# Session Handoff

Creates or updates `HANDOFF.md` in the project root — a general session summary for continuity. Optionally persists decisions to `.mpx/decisions/` when present.

## Purpose

Capture accumulated knowledge, context, and insights that would be lost when starting a new conversation. HANDOFF.md persists in the project root and is updated at the end of each session.

## Workflow

### Step 1: Gather Context

Review the current conversation to extract:

- What was accomplished (progress)
- Decisions made and their reasoning
- Problems encountered and how they were solved
- Dead ends discovered (what NOT to do)
- Files modified or discovered
- Patterns and relationships identified

### Step 2: Check Task List

Use `TaskList` to see current task status:

- Completed tasks
- In-progress tasks
- Pending tasks

### Step 3: Identify Project Context (Optional)

1. Check if `.mpx/` exists
2. If yes, read `.mpx/REQUIREMENTS.md` for current requirements
3. Check `.mpx/decisions/` for ADR-style decision records
4. This context enriches the handoff but is not required

### Step 4: Create or Update HANDOFF.md

1. Check if `HANDOFF.md` already exists in the project root
2. If exists: read it, merge previous context with current session context (preserve still-relevant items, update/replace stale ones)
3. If not: create new from scratch

Write `HANDOFF.md` to the **project root**.

**Target 20-200 lines. Be thorough — this is the only context the next agent gets.**

Write as if briefing a developer who has zero context. Every section should contain enough detail that the reader can continue work without re-investigating.

```markdown
# Session Handoff

Date: [Today's date]

## Progress This Session

- [For each completed item: what was done and how]
- [Include file paths, function names, specific changes]
- [Not just "implemented X" — describe the approach taken]

## Key Decisions

- [Each decision: what was decided, alternatives considered, why this choice]
- [Include technical trade-offs and constraints that influenced the decision]

## Dead Ends & Mistakes

- [Failed approaches with WHY they failed — error messages, wrong assumptions]
- [Paths that looked promising but weren't — save the next agent from repeating]
- [Include specific error messages, stack traces, or symptoms encountered]

## Bugs Found

- [Any bugs discovered during work, whether fixed or not]
- [Include reproduction steps and file locations]

## Next Steps

1. [Prioritized, with enough context to start immediately]
2. [Include file paths, function names, what specifically needs doing]
3. [Note any prerequisites or ordering constraints]

## Critical Files

- `path/to/file` — what it does, why it matters for this work
- [Every file the next agent will need to read or modify]

## Working Memory

- [Implicit knowledge: "X depends on Y", "don't change Z because..."]
- [Patterns discovered, architectural constraints]
- [Environment quirks, config gotchas, version-specific behavior]
- [Relationships between components that aren't obvious from code]
```

### Step 5: Persist Decisions (Conditional)

Only if an existing `.mpx/` folder is present and significant decisions were made during this session:

1. Create ADR files in `.mpx/decisions/` for significant decisions (e.g., `001-chose-drizzle.md`)

If `.mpx/` folder is missing: do not create it; create or update `HANDOFF.md` only.

ADR format:

```markdown
# [Decision Title]

**Date:** [Date]
**Status:** Accepted

## Context
[What prompted this decision]

## Decision
[What was decided]

## Reasoning
[Why this choice over alternatives]
```

### Step 6: Confirm

Show the user what was created:

> "Session handoff created:
>
> - `HANDOFF.md` (project root)
>   [If .mpx/ exists and decisions were made:]
> - Created `.mpx/decisions/NNN-decision-name.md`
>
> Captured:
>
> - [x] items of progress
> - [x] decisions [persisted to .mpx/ if applicable]
> - [x] next steps"

## Notes

- HANDOFF.md persists in the project root — updated each session, not deleted
- Decisions are persisted to `.mpx/decisions/` when `.mpx/` exists
- Always creates HANDOFF.md in project root regardless of `.mpx/` presence
- When `.mpx/` folder is absent, writes `HANDOFF.md` only
- Focus on "why" not just "what" — reasoning is crucial
- Capture implicit knowledge that isn't documented elsewhere
- If HANDOFF.md already exists, it is read and merged with current session context (update-or-create)
