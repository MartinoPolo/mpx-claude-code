---
name: mp-review-changes
description: 'Read-only review of uncommitted changes via subagents. Use when: "review changes", "review uncommitted"'
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Grep, Bash(git status *), Bash(git diff *), Bash(git diff --cached *), Task
metadata:
  author: MartinoPolo
  version: "0.2"
  category: code-review
---

# Review Uncommitted Changes

Resolve uncommitted scope, run reviewer, write report.

This review is **READ-ONLY** except report creation. It does NOT:

- post to GitHub
- modify source files
- make commits

## Workflow

1. Collect change scope (`git diff` + `git diff --cached`)
2. If no changes, exit
3. Spawn 3 parallel subagents with resolved scope:

- `mp-reviewer-code-quality`
- `mp-reviewer-best-practices`
- `mp-reviewer-spec-alignment`

4. Write returned findings to `REVIEW-CHANGES.md`

## Review Dispatch Logic

Pass:

- Scoped diff (preferred) or changed file list
- Original task/spec text when available
- Detected stack/conventions context

### Output Policy

- high-confidence issues only
- include location + reasoning + suggested fix
- order sections exactly:
  1. Critical
  2. Important
  3. Minor (optional)

### Report shape (`REVIEW-CHANGES.md`)

- Actionable Checklist
  - Critical items with file/line, why, and concrete fix
  - Important items with file/line, why, and concrete fix
- Nice-to-Have
  - Minor non-blocking observations

## Constraints

- Read-only review (except writing `REVIEW-CHANGES.md`)
- No source edits

DO NOT create the file if no issues are found. Only report in the conversation.
