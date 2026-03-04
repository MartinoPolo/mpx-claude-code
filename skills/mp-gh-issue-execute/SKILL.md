---
name: mp-gh-issue-execute
description: 'Execute GitHub issue scope (bug, task, or feature): investigate, plan, implement, review, run frontend verification when needed, and resolve findings. Use when: "execute issue #N", "implement issue", "work on issue"'
argument-hint: "<issue-url | issue-number | owner/repo#number>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Task, AskUserQuestion, Skill, Bash(gh issue *), Bash(git status *), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(gh *), Bash(bash $HOME/.claude/skills/mp-gh-issue-execute/scripts/detect-project-scripts.sh*), Bash(*run dev*), Bash(*run start*), Bash(*run preview*), Bash(cd * && *run dev*), Bash(cd * && *run start*), Bash(cd * && *run preview*), Bash(npm *), Bash(pnpm *), Bash(yarn *), Bash(bun *), Bash(lsof *), Bash(ss *), Bash(netstat *)
metadata:
  author: MartinoPolo
  version: "0.2"
  category: utility
---

# Execute GitHub Issue

Execute GitHub issue work with neutral language across issue types (bug, task, feature).

GitHub MCP allowed for this skill.

## Usage

```
/mp-gh-issue-execute <issue-url>
/mp-gh-issue-execute https://github.com/owner/repo/issues/123
/mp-gh-issue-execute 123
/mp-gh-issue-execute owner/repo#123
```

## Behavior Contract

- Default: run automatically end-to-end.
- Ask user only when scope is unclear, conflicting, risky, or blocked.
- When asking questions, always include the full generated execution plan first.
- Do not ask for a generic “before or after execution” approval step if plan is clear.

## Workflow

### Step 1: Resolve + fetch issue context

Use `gh` CLI to fetch complete issue context:

```bash
gh issue view <number> --repo owner/repo --json title,body,labels,comments,state,assignees,author,url
```

Extract and normalize:

- Issue summary (neutral): goal, constraints, expected outcome
- Issue type signals: bug/task/feature labels and text cues
- Acceptance hints from body/comments
- Linked context (related issues/PR references if present)

If issue not found/auth fails, report and stop.

### Step 2: Combined explore + analyze + plan (single sub-agent)

Spawn one sub-agent to keep context intact for discovery + analysis + planning:

```
Task tool:
  subagent_type: "mp-gh-issue-analyzer"
  model: opus
  description: "Explore, analyze, and plan issue #N"
  prompt: |
    You own end-to-end pre-execution analysis for GitHub issue #N.
    Keep exploration, analysis, and planning in one pass to preserve context.

    ## Issue Data
    [Include fetched issue JSON summary and key comments]

    ## Required Output (all sections required)
    1) Issue Summary
       - objective
       - issue type classification (bug/task/feature) with rationale
       - assumptions + open questions

    2) Exploration Findings
       - affected files (ranked) with brief why
       - symbols/flows likely touched
       - existing tests and coverage gaps

    3) Execution Plan (complete)
       - ordered implementation steps
       - files/symbols to change per step
       - risk notes and rollback strategy
       - confidence level

    4) Validation Plan
       - automated checks to run (lint/typecheck/build/tests)
       - targeted tests
       - manual testing scenarios
       - pages/routes/screens to visit for manual verification (if UI involved)

    5) Executor Handoff
       - concise summary to pass directly to mp-executor
```

This sub-agent must return the complete plan and all required sections.

### Step 3: Clarification gate (conditional)

If no blocking ambiguity: proceed automatically to Step 4.

If ambiguity exists (conflicting requirements, low confidence, missing acceptance criteria), ask user focused questions and include full plan before questions:

```
AskUserQuestion:
  header: "Clarify"
  question: "Plan prepared below. One or more items need clarification before execution."
  options:
    - label: "Use default assumptions"
      description: "Proceed now using stated assumptions"
      recommended: true
    - label: "Answer questions first"
      description: "Provide clarifications, then execute"
    - label: "Stop"
      description: "Do not execute"
```

Question body must include:

- Full execution plan
- Open questions (numbered)
- Impact if unanswered

### Step 4: Execute + review + checks + resolve loop

First, if issue involves external library behavior, spawn `mp-context7-docs-fetcher` and pass docs into execution context.

Then spawn `mp-executor` with full handoff:

- issue summary
- complete execution plan
- affected files/symbols
- automated/manual validation plan
- pages/routes/screens for manual verification
- clarifications/default assumptions
- context7 docs if fetched

After executor finishes, run this sequence:

1. Detect changed surface from diff (`git diff --name-only` plus staged/unstaged summary):

- frontend changes: UI/web/app/routes/components/pages/assets
- backend changes: API/server/service/db/migrations/schema

2. Run review + check resolve loop (max 3 iterations):

- run in parallel: `mp-reviewer-code-quality`, `mp-reviewer-best-practices`, `mp-reviewer-spec-alignment`, `mp-checker`
- if findings exist, run `mp-executor` in fix mode with explicit scoped tasks from findings and failed checks
- include execution scope summary (issue #N scope only)
- re-run only failed reviewers/checks

3. If backend/API/db changes exist and review/check loop is clean, ask user whether environment dependencies are ready for browser verification (API running, DB migrated/seeded, required services available). Treat this as a prerequisite for Chrome DevTools verification.
4. If frontend changes exist, review/check loop is clean, and backend prerequisite (if applicable) is ready, run frontend verification loop (max 3 iterations):

- Determine run instructions in this order:
  1. explicit project run guidance already present in `AGENTS.md`/issue context
  2. direct detector call: `bash $HOME/.claude/skills/mp-gh-issue-execute/scripts/detect-project-scripts.sh . -c frontend`
  3. if no usable frontend command found, fallback to `/mp-script-discovery`
- Ensure frontend server is running on target port (or start it from detected command)
- Pass URL/port, pages/routes, and auth context (if available) to `mp-chrome-devtools-tester`
- If tester reports `FAIL`, run `mp-executor` in fix mode with explicit scoped tasks from tester failures, then re-run tester

5. If unresolved after any loop retries, report blocker with precise reason and keep outcome partial.
6. Only commit when loops pass (or only non-blocking items remain). Invoke `/mp-commit` with scoped conventional message referencing issue (e.g., `feat(scope): implement X (refs #N)` or `fix(scope): resolve Y (refs #N)`).

### Step 5: Finalize + report

Return concise execution report:

```markdown
Mode: issue-execute
Source: [issue url/#]
Issue Type: [bug|task|feature]

Completed:

- [implemented item]

Unresolved:

- [item] — [reason]

Checks:

- typecheck: pass/fail
- lint: pass/fail
- build: pass/fail
- tests: pass/fail

Review:

- code-quality: pass/fail
- best-practices: pass/fail
- spec-alignment: pass/fail

Manual Test:

- pages/routes visited: [...]
- scenarios verified: [...]
```

## Failure Policy

If blocker persists (unclear scope, failing checks after retries, missing environment, repeated resolver failures):

- Stop retrying that issue batch
- Report exact blocker + impact
- Ask focused follow-up only if user input can unblock
- Otherwise return partial completion state
