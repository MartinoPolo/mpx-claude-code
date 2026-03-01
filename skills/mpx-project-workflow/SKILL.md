---
name: mpx-project-workflow
description: Project workflow guidance for spec-driven development. Background knowledge auto-loaded when relevant.
user-invocable: false
metadata:
  author: MartinoPolo
  version: "0.1"
  category: project-management
---

# Project Workflow Guide

This document provides background knowledge about spec-driven development workflow. It is automatically loaded when discussing project specifications, checklists, or implementation planning.

## Workflow Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Project Lifecycle                        │
└──────────────────────────────────────────────────────────────┘

  Idea ──► Spec ──► Plan ──► Implement ──► Test ──► Ship
           │         │           │
           ▼         ▼           ▼
        SPEC.md  ROADMAP.md   Commits
                 phases/
```

## File Responsibilities

| File            | Purpose                                                     | When Updated                    |
| --------------- | ----------------------------------------------------------- | ------------------------------- |
| SPEC.md         | Requirements source of truth (checkbox list)                | Initial creation, scope changes |
| ROADMAP.md      | Phase overview, dependencies, tracking, decisions, blockers | Phase completion, decisions     |
| phases/NN-name/ | Phase folder with CHECKLIST.md (specs + tasks + state)      | During phase execution          |

## Best Practices

### Writing Good Specifications

- Write each requirement as a checkbox item (`- [ ]` / `- [x]`)
- Use precise, testable language with no ambiguity
- Preserve constraints and edge cases inline
- Prefer zero information loss over brevity

### Breaking Down Tasks

- Each task should be completable in one sitting
- Tasks should have clear completion criteria
- Group related tasks together
- Order tasks by dependency

### Phase Design

- Each phase should produce working software
- Minimize dependencies between phases
- Foundation phase always comes first
- Polish/testing phase always comes last

### Requirements vs Implementation

- Requirements skills (`/mpx-add-requirements`, `/mpx-report-issue-or-bug`, `/mpx-parse-spec`) are documentation-only
- They update `.mpx/` files — never source code, configs, or tests
- `mpx-spec-analyzer` is the dedicated parser that converts SPEC into ROADMAP + phase checklists
- Implementation happens only via `/mp-execute mpx`

### Session Handoff

- Run `/mp-handoff` at end of each session to create ephemeral HANDOFF.md
- HANDOFF.md only exists if `/mp-handoff` was run — it is optional, not always present
- Note any decisions made and why
- Document blockers clearly
- Leave "next step" note for continuity
- HANDOFF.md is consumed and deleted by `/mp-execute` at next session start

## Troubleshooting

### "I'm lost in my project"

1. Run `/mpx-show-project-status` to see current state
2. Read ROADMAP.md for overall progress and decisions
3. Check last commits with `git log --oneline -10`

### "The plan doesn't match reality"

1. Update SPEC.md with actual requirements
2. Run `/mpx-parse-spec` to regenerate checklists
3. Review and adjust as needed

### "Context is getting degraded"

1. Use `/mp-execute mpx` for complex work
2. This spawns fresh agent with clean context
3. CHECKLIST.md maintains continuity (HANDOFF.md adds optional session context if `/mp-handoff` was run)

### "I need to change scope"

1. Run `/mpx-add-requirements "..."` to update SPEC safely
2. It automatically re-parses via analyzer
3. Completed work is preserved in git

### "I want to control what gets executed"

- `/mp-execute mpx phase 3` — target specific phase
- `/mp-execute mpx task` — force single task
- `/mp-execute mpx all` — force entire remaining phase

### "I need to add new requirements"

1. Run `/mpx-add-requirements "description"`
2. Clarifies ambiguous input before writing
3. Updates SPEC.md and re-parses via analyzer into roadmap/checklists

### "I found a bug to track"

1. Run `/mpx-report-issue-or-bug "description of the bug"`
2. Finds related phase, adds Fix + Verify task pair
3. Creates bugfix phase if no matching phase exists

## Quick Reference

```
/mpx-setup              - Unified setup (auto-detects: init, convert, restructure)
/mpx-init-repo          - Git initialization only
/mpx-parse-spec         - Re-parse edited SPEC via analyzer
/mp-execute mpx              - Execute tasks (auto-selects phase and scope)
/mpx-show-project-status     - Show progress and next steps
/mpx-add-requirements   - Primary requirements entry (create/update + parse)
/mpx-report-issue-or-bug          - Track bugs/issues in phase system
```
