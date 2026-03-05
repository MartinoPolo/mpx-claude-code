---
name: mp-review-branch
description: 'Read-only branch review via subagents. Use when: "review branch", "review my changes"'
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Grep, Bash(git branch --show-current *), Bash(git branch -r *), Bash(git merge-base *), Bash(git diff *), Bash(git log *), Task, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.2"
  category: code-review
---

# Branch Review

Shortcut skill: resolve branch scope, run reviewer, write report.

This review is **READ-ONLY** except report creation. It does NOT:

- post to GitHub
- modify source files
- make commits

## Workflow

1. Determine current (`git branch --show-current`) and base branch (auto-detect via `mp-base-branch-detector`)
2. Ask user only when base is ambiguous
3. Build diff scope (`git diff <base>...HEAD`)
4. Spawn 6 parallel subagents with resolved scope:

- `mp-reviewer-code-quality`
- `mp-reviewer-best-practices`
- `mp-reviewer-spec-alignment`
- `mp-reviewer-security`
- `mp-reviewer-performance`
- `mp-reviewer-error-handling`

5. Write returned findings to `REVIEW-BRANCH.md`

## Review Dispatch Logic

Pass:

- branch diff scope (`<base>...HEAD`)
- original task/spec text when available
- detected stack context

### Output Policy

- high-confidence issues only
- include location + reasoning + suggested fix
- order sections exactly:
  1. Critical
  2. Important
  3. Minor (optional)

## Constraints

- Read-only review (except writing `REVIEW-BRANCH.md`)
- No source edits

### Report Shape (`REVIEW-BRANCH.md`)

- Actionable Checklist
  - Critical: must-fix findings
  - Important: should-fix findings
- Nice-to-Have
  - Minor non-blocking notes

DO NOT create the file if no issues are found. Only report in the conversation.
