---
name: mpx-parse-spec
description: Parse .mpx/SPEC.md by spawning mpx-spec-analyzer. Regenerates ROADMAP.md and phase CHECKLIST.md files.
disable-model-invocation: false
allowed-tools: Read, Write, Bash, Task, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.1"
  category: project-management
---

# Parse Specification

Wrapper skill for specification parsing. It validates `.mpx/SPEC.md`, then delegates decomposition to `mpx-spec-analyzer`.

## Iron Law

**DOCUMENTATION ONLY.** Creates/updates `.mpx/` files only. Never modifies source code.

## Prerequisites

- `.mpx/SPEC.md` must exist

`SPEC.md` remains the project-level source of truth for requirements for the entire project lifecycle. `ROADMAP.md` and phase `CHECKLIST.md` files are execution tracking artifacts derived from `SPEC.md`.

## Workflow

### Step 1: Validate SPEC.md

- Read `.mpx/SPEC.md`
- Ensure it contains requirements as checkbox items (`- [ ]` / `- [x]`)
- If malformed or ambiguous, ask user what to fix before parsing

### Step 2: Spawn Spec Analyzer

Always call the dedicated analyzer agent:

```
Use Task tool:
      subagent_type: "mpx-spec-analyzer"
      prompt: "Read .mpx/SPEC.md and regenerate .mpx/ROADMAP.md and .mpx/phases/*/CHECKLIST.md. Treat SPEC as source of truth. Skip [x] requirements as already implemented, but retain them as dependency/context when needed. If any requirement is ambiguous, ask clarifying questions before finalizing output. Preserve all requirement detail (constraints and edge cases) in phase specs/tasks without losing information."
```

### Step 3: Report

Return concise status:

```
Specification Parsed via Agent!

Files Updated:
      - .mpx/ROADMAP.md
      - .mpx/phases/.../CHECKLIST.md

Skipped as Implemented:
      - [requirements marked [x]]

Next:
      - Run `/mpx-show-project-status`
      - Run `/mp-execute mpx`
```

## Error Handling

- **No SPEC.md:** "No specification found. Run `/mpx-add-requirements` first."
- **Malformed SPEC.md:** ask user to clarify/fix ambiguous lines
- **Analyzer failure:** report error and keep `SPEC.md` untouched

## Notes

- This skill is intentionally thin; logic lives in `mpx-spec-analyzer`
- Use `/mpx-add-requirements` for interactive requirement collection/updates
- Use this skill when users edited `SPEC.md` manually and want a fresh parse
