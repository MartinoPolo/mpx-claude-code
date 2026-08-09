---
name: handoff
description: "Writes or updates HANDOFF.md with session progress and open threads."
when_to_use: "User asks for a handoff or to save progress at the end of a session."
allowed-tools: Read, Write, Glob, TaskList
metadata:
  author: MartinoPolo
  version: "0.7"
  category: project-management
---

# Session Handoff

Creates or updates `HANDOFF.md` in the project root — a general session summary for continuity.

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
2. If yes, read `.mpx/CONTEXT.md` for domain language and feature context
3. Read `.mpx/DECISIONS.md` for settled decisions
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

### Step 5: Confirm

Show the user what was created:

> "Session handoff created:
>
> - `HANDOFF.md` (project root)
>
> Captured:
>
> - [x] items of progress
> - [x] decisions
> - [x] next steps"

## Notes

- HANDOFF.md persists in the project root — updated each session, not deleted
- This skill only writes HANDOFF.md — use `/mp:grill` or `/mp:harvest-decisions` to persist decisions to `.mpx/DECISIONS.md`
- Focus on "why" not just "what" — reasoning is crucial
- Capture implicit knowledge that isn't documented elsewhere
- If HANDOFF.md already exists, it is read and merged with current session context (update-or-create)
