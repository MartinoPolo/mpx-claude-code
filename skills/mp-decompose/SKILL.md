---
name: mp-decompose
description: 'Decompose large files into logical modules while preserving behavior. Use when: "decompose file", "split large file", "modularize this scope"'
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Glob, Grep, Agent, Bash(git *), Bash(npm *), Bash(pnpm *), Bash(yarn *), Bash(bun *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: refactor
---

# Decompose Large Files

Split oversized files into logical modules. Keep functionality unchanged. Enforce DRY and clear organization. $ARGUMENTS

## Goals

- Preserve runtime behavior and public API
- Reduce file size and responsibility overlap
- Organize by role: constants, utils, types, hooks, context, components, services...

## Workflow

### Step 1: Resolve Scope

Parse `$ARGUMENTS` into explicit targets (files or folders).

- If scope is missing, ask for it
- If multiple files are provided, keep each file as a separate decomposition unit
- If a folder is provided, detect large files first and prioritize highest impact

### Step 2: Spawn Decomposition Subagents

Spawn one sub-agent per large-file unit.

- Use fresh context per unit
- Never mix unrelated large files in one subagent
- For multi-file requests, always spawn separate subagents in parallel

Use this exact prompt shape for each unit:

```text
You are decomposing one large file into multiple files/modules.

Goal:
- Split the target file into logical modules (constants, utils, types, hooks, context, components, services as applicable).
- Preserve behavior, naming conventions, and public API.
- Improve DRY and organization.

Input:
- Target unit: <file path>
- Allowed scope: <related module paths>
- Constraints: no feature changes, no behavior changes.

Required actions:
1) Identify extraction boundaries and module responsibilities.
2) Create multiple files/modules (not a single-file rewrite).
3) Move code into the new modules with clear names.
4) Update imports/exports and all references.
5) Remove dead code discovered during extraction.
6) Run targeted checks/tests for changed files when available.

Required output:
- New file tree for this unit
- Mapping of old sections -> new files
- Verification result (checks/tests or static verification)
- Residual risks (if any)
```

Subagent must fail fast if it cannot split into multiple modules safely.

### Step 3: Validate Preservation

Run targeted checks for touched areas.

- Prefer project-native checks first
- If checks are unavailable, perform static validation of imports/exports and call paths

### Step 4: Report Results

Return per-unit summary:

- Files split and new module layout
- API/behavior preservation notes
- DRY improvements made
- Validation results and residual risks

## Constraints

- Preserve external behavior
- Keep scope to decomposition only
- Keep naming descriptive and consistent
- Remove dead code discovered during split

## Output

Display:

- Scope resolved
- Subagents dispatched
- Decomposition outcomes by unit
- Validation status
