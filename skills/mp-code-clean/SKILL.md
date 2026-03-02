---
name: mp-code-clean
description: 'Review and fix code quality issues immediately: deduplicate, remove repetition, remove dead code. Use when: "clean code", "deduplicate this module", "remove dead code"'
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Glob, Grep, Task, Bash(git *), Bash(npm *), Bash(pnpm *), Bash(yarn *), Bash(bun *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: code-review
---

# Code Clean

Run focused code-quality cleanup and apply easy wins immediately. Target duplication, repetition, and dead/unused code. $ARGUMENTS

## Objectives

- Enforce DRY in practical scope
- Remove dead/unused code safely
- Reduce repeated logic and copy-paste blocks
- Keep behavior unchanged

## Workflow

### Step 1: Resolve Scope and Build File Groups

Parse `$ARGUMENTS` as file/s or folder/s scope, then build meaningful module groups.

- Group by feature/module boundaries (example: full dashboard module)
- Preserve relationships between files in each group
- Never split one logical module across unrelated groups

Rules:

- Always spawn subagents for execution
- If scope is a single folder, still create at least one grouped module context
- If scope is a single file, expand to nearest logical module group (not file-only review)

### Step 2: Spawn Review Subagents per Group

For each file group, spawn a review subagent.

Review prompt must require:

1. Detect duplication and repetition
2. Detect dead/unused code paths, exports, imports, and helpers
3. Propose concrete low-risk cleanup edits
4. Prioritize easy wins first

### Step 3: Spawn Fix Subagents per Group

For each reviewed group, spawn a fix subagent with approved findings.

Fix prompt must require:

1. Apply deduplication and dead code removal
2. Keep signatures and behavior stable
3. Avoid broad architectural rewrites
4. Run relevant targeted checks where available

### Step 4: Validate and Summarize

Run targeted validation on touched groups. Report outcomes per group.

- Cleanups applied
- Duplications removed
- Dead code removed
- Validation status and remaining follow-ups

## Constraints

- Prefer small, reversible edits
- No new features
- Keep naming explicit and consistent

## Output

Display:

- Scope and group map
- Subagents dispatched (review + fix)
- Applied cleanups by module group
- Validation summary
