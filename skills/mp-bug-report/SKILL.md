---
name: mp-bug-report
description: 'Investigate bug root cause, design TDD fix plan, create GitHub issue labeled bug. Accepts multiple bugs. Use when: "report bug", "bug report", "something is broken", "investigate bug"'
argument-hint: "bug description(s) — inline text or multiple descriptions separated by newlines"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(gh *), Bash(git *), AskUserQuestion, Agent
metadata:
  author: MartinoPolo
  version: "0.1"
  category: issue-management
---

# Bug Report

Investigate bug root cause, design TDD fix plan, create GitHub issue. $ARGUMENTS

## Input Resolution

- If `$ARGUMENTS` provided: parse as bug description(s). Split on double newlines (`\n\n`) for multiple bugs — each block becomes a separate investigation.
- If no arguments: ask user to describe the bug(s).
- Single bug = single investigation. Multiple bugs = parallel investigations.

## Process (per bug)

### Step 1: Capture Problem

Parse bug description for:

- **Actual behavior** — what happens now
- **Expected behavior** — what should happen
- **Reproduction steps** — how to trigger it

If critical info is missing (can't investigate without it), ask questions. Then move to investigation promptly.

### Step 2: Investigate

Spawn `mp-issue-analyzer` sub-agent:

> Explore this codebase to investigate a bug.
>
> **Bug:** [parsed description]
>
> Your tasks:
>
> 1. Find where the bug manifests in the codebase
> 2. Trace the code path involved
> 3. Identify the root cause (not just the symptom)
> 4. Find related code, patterns, and existing tests
>
> Return your full analysis including root cause, affected modules, and code path description.

For multiple bugs: spawn multiple `mp-issue-analyzer` sub-agents in parallel.

### Step 3: Design TDD Fix Plan

Based on investigation results, design ordered RED-GREEN cycles:

- Each cycle is a **vertical slice**: RED (one test capturing broken/missing behavior) then GREEN (minimal code change to pass)
- Tests verify behavior through **public interfaces**, not implementation details
- Each test should survive internal refactors
- Final step: REFACTOR for cleanup after all cycles pass

### Step 4: Create GitHub Issue

Ensure `bug` label exists:

```bash
gh label create bug --description "Bug report" --color D73A4A --force
```

**Title format:** `bug: [concise description]`

Create issue:

```bash
gh issue create --title "bug: description" --label "bug,area-label" --body "$(cat <<'EOF'
## Problem

**Actual behavior:** [what happens]
**Expected behavior:** [what should happen]

**How to reproduce:**
1. [step 1]
2. [step 2]

## Root Cause Analysis

[Code path description — why it fails, contributing factors]
[Describe modules, behaviors, and contracts — NO file paths or line numbers]

## TDD Fix Plan

1. **RED:** [test description — what behavior to verify]
   **GREEN:** [minimal change to make test pass]

2. **RED:** [next test]
   **GREEN:** [next change]

3. **REFACTOR:** [cleanup after all tests pass]

## Acceptance Criteria

- [ ] [criterion 1]
- [ ] [criterion 2]
EOF
)"
```

Add labels: `bug` + any area labels detected from codebase exploration.

### Step 5: Report

- Print issue URL and one-line root cause summary per bug
- Multiple bugs: list all issue URLs with brief summary each

## Rules

- Issue body must be **durable** — no file paths, line numbers, or implementation details that break after refactors
- Describe modules, behaviors, and contracts instead
- Use project's domain language (check GLOSSARY.md if it exists)
- Each RED-GREEN cycle is a vertical slice — NOT horizontal
- Keep investigation thorough but issue body concise
