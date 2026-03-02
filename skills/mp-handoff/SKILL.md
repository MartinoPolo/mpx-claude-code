---
name: mp-handoff
description: Create ephemeral HANDOFF.md capturing session progress, decisions, and working memory for the next session.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, TaskList
metadata:
  author: MartinoPolo
  version: "0.2"
  category: project-management
---

# Session Handoff

Creates ephemeral `HANDOFF.md` in the project root that bridges between sessions. Persists decisions to `.mpx/` only when an existing `.mpx/` folder is present.

## Purpose

Capture accumulated knowledge, context, and insights that would be lost when starting a new conversation. HANDOFF.md is ephemeral — created here, consumed and deleted by `/mp-execute` at the start of the next session.

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

### Step 3: Identify Active Phase (Optional)

1. Check if `.mpx/phases/` exists
2. If yes, identify the current active phase from `.mpx/ROADMAP.md`
3. Read the active phase's `CHECKLIST.md` for current state
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

Only if an existing `.mpx/` folder is present and decisions were made during this session:

1. Update `## Decisions` in the active phase's `CHECKLIST.md` (phase-specific decisions)
2. Update `## Decisions` in `.mpx/ROADMAP.md` (project-level decisions)

If `.mpx/` folder is missing:

- Do not create `.mpx/`
- Do not create `ROADMAP.md`
- Do not create or modify any `.mpx/**` files
- Create or update `HANDOFF.md` only

Decisions are persistent (unlike HANDOFF.md which is ephemeral).

Format:

```markdown
## Decisions

- [Date]: [Decision description] — [reasoning]
```

### Step 6: Confirm

Show the user what was created:

> "Session handoff created:
>
> - `HANDOFF.md` (project root, ephemeral)
>   [If .mpx/ exists:]
> - Updated Decisions in `.mpx/phases/02-feature/CHECKLIST.md`
> - Updated Decisions in `.mpx/ROADMAP.md` (project-level)
>
> Captured:
>
> - [x] items of progress
> - [x] decisions [persisted to .mpx/ if applicable]
> - [x] lessons learned
> - [x] next steps
>
> HANDOFF.md will be consumed automatically by `/mp-execute` in your next session."

## HANDOFF.md Lifecycle

1. `/mp-handoff` **creates** HANDOFF.md (project root)
2. `/mp-execute` **reads** HANDOFF.md at start (both checklist and mpx modes), passes context to executor
3. `/mp-execute` **deletes** HANDOFF.md after processing
4. Purpose: bridge between sessions only — not a permanent record

## Notes

- HANDOFF.md is ephemeral — it exists only between sessions
- Decisions are persisted to `.mpx/` CHECKLIST.md only when an existing `.mpx/` folder is present
- Always creates HANDOFF.md in project root regardless of `.mpx/` presence
- When `.mpx/` folder is absent, writes `HANDOFF.md` only (no `.mpx/` or `ROADMAP.md` creation/updates)
- Focus on "why" not just "what" — reasoning is crucial
- Capture implicit knowledge that isn't documented elsewhere
- If HANDOFF.md already exists, it is read and merged with current session context (update-or-create)
