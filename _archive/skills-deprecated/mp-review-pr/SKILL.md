---
name: mp-review-pr
description: 'Read-only PR review via subagent. Works on draft PRs. Use when: "review PR #N"'
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Grep, Bash(gh pr view *), Bash(gh pr diff *), Bash(gh pr list *), Task
metadata:
  author: MartinoPolo
  version: "0.2"
  category: code-review
---

# PR Review

Resolve PR scope, run reviewer, write report.

GitHub MCP allowed for this skill.

This review is **READ-ONLY** except report creation. It does NOT:

- post comments or reviews to GitHub
- modify source files
- make commits

## Workflow

1. Resolve PR (`$ARGUMENTS` or current branch PR)
2. Fetch PR metadata + diff (draft PRs included)
3. Spawn 6 parallel subagents with resolved scope:

- `mp-reviewer-code-quality`
- `mp-reviewer-best-practices`
- `mp-reviewer-spec-alignment`
- `mp-reviewer-security`
- `mp-reviewer-performance`
- `mp-reviewer-error-handling`

4. Write returned findings to `REVIEW-PR.md`

## Review Dispatch Logic

Pass:

- PR diff (preferred) or scoped change set
- changed files
- original task/spec text when available
- detected stack/conventions context

### Output Policy

- high-confidence issues and obvious violations only
- include location + reasoning + suggested fix
- order sections exactly:
  1. Critical
  2. Important
  3. Minor (optional)

### Report shape (`REVIEW-PR.md`)

- Actionable Checklist
  - Critical items with file/line, explanation, suggested fix
  - Important items with file/line, explanation, suggested fix
- Nice-to-Have
  - Minor non-blocking observations

## Constraints

- Read-only review (except writing `REVIEW-PR.md`)
- No source edits

DO NOT create the file if no issues are found. Only report in the conversation.
