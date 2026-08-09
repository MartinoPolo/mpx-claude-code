---
name: code-clean
description: "Deduplicates code, removes repetition, and deletes dead code in a given scope."
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Glob, Grep, Agent, Bash(git *), Bash(npm *), Bash(pnpm *), Bash(yarn *), Bash(bun *)
metadata:
  author: MartinoPolo
  version: "0.5"
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
- Keep each logical module within a single group

Rules:

- Always spawn sub-agents for execution (agent types named in Steps 2-3)
- If scope is a single folder, still create at least one grouped module context
- If scope is a single file, expand to nearest logical module group (not file-only review)

### Step 2: Spawn Review Subagents per Group

For each file group, spawn a `general-purpose` review sub-agent with `model: "sonnet"` (finding duplication and judging risk needs judgment).

Use this exact review prompt shape:

```text
You are reviewing one module group for immediate code cleanup.

Goal:
- Find DRY violations, duplication/repetition, and dead/unused code.
- Propose low-risk cleanups that preserve behavior.
- Code line number reduction is the best win here.

Input:
- Module group: <folder/files list>
- Boundaries: review only this group and direct dependencies.

Required actions:
1) Identify duplicated logic and repeated patterns.
2) Identify dead/unused exports, imports, helpers, and unreachable code.
3) Prioritize easy wins first.
4) Produce an edit plan with exact files and concrete changes.

Required output:
- Findings grouped by file
- Ranked cleanup plan (easy wins first)
- Risk notes per proposed change
```

### Step 3: Spawn Fix Subagents per Group

For each reviewed group, spawn an `mp-executor` sub-agent with approved findings. The prompt must carry the full pre-analyzed plan with exact files and concrete changes, leaving only mechanical application — `mp-executor` applies, it does not decide. If a finding still needs judgment (unclear plan, cross-module tradeoffs), use a `general-purpose` sub-agent with `model: "opus"` for that group instead, telling it to reason through the tradeoff before editing.

Use this exact fix prompt shape:

```text
You are applying approved cleanup changes for one module group.

Goal:
- Execute the approved deduplication and dead-code-removal plan.
- Keep behavior and signatures stable.

Input:
- Module group: <folder/files list>
- Approved findings/plan: <review output>

Required actions:
1) Apply deduplication and repetition removal.
2) Remove dead/unused code safely.
3) Keep public contracts stable unless plan explicitly allows change.
4) Keep edits narrow and scoped to the approved plan.
5) Run targeted checks/tests for touched files when available.

Required output:
- Applied edits by file
- What was removed/consolidated
- Validation results
- Follow-ups not completed and why
```

Fix subagent must reject unapproved scope expansion.

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
