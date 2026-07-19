---
name: mp-review
description: 'Review code with configurable scope and autofix. Use when: "review scope branch", "review changes", "review pr #123 autofix"'
argument-hint: "scope=<branch|changes|pr[:id|#id|url]> [full|partial|half] [autofix|autofix=true|autofix=false]"
allowed-tools: Read, Write, Glob, Grep, Agent, AskUserQuestion, Bash(git status *), Bash(git branch --show-current *), Bash(git branch -r *), Bash(git merge-base *), Bash(git diff *), Bash(git log *), Bash(gh pr view *), Bash(gh pr diff *), Bash(gh pr list *), Bash(node $HOME/.claude/scripts/detect-base-branch.js*)
metadata:
  author: MartinoPolo
  version: "0.4"
  category: code-review
---

# Unified Review

Run review in two phases: review phase then optional fix phase. $ARGUMENTS

## Parameters

### Required

- `scope` determines review target:
  - `scope=branch` → review branch diff against detected base
  - `scope=changes` → review uncommitted changes (`git diff` + `git diff --cached`)
  - `scope=pr` or `scope=pr:<id|#id|url>` → review PR diff

If `scope` missing or invalid, ask the user.

### Optional

- Coverage parameter decides reviewer set:
  - `full` → 6 reviewers
  - `partial` or `half` → 3 reviewers

Default coverage: `full`

- `autofix` decides whether fix phase runs:
  - explicit `autofix` or `autofix=true` → force ON
  - explicit `autofix=false` → force OFF
  - omitted → auto mode (ON when total findings `< 10`, otherwise OFF)

## Reviewer Sets

### Full (7)

- `mp-reviewer-code-quality`
- `mp-reviewer-best-practices`
- `mp-reviewer-spec-alignment`
- `mp-reviewer-test-quality`
- `mp-reviewer-security`
- `mp-reviewer-performance`
- `mp-reviewer-error-handling`

### Partial/Half (4)

- `mp-reviewer-code-quality`
- `mp-reviewer-best-practices`
- `mp-reviewer-spec-alignment`
- `mp-reviewer-test-quality`

## Workflow

### Step 1: Resolve scope

#### Branch scope

1. Determine current branch (`git branch --show-current`)
2. Run `node $HOME/.claude/scripts/detect-base-branch.js [explicit-branch]` (pass user hint as arg if given). It checks `origin/<branch>` existence and commits-ahead for `dev > develop > main > master` and prints one branch name to stdout (falls back to `main`).
3. Use the printed branch as `<base>`
4. Build diff scope: `<base>...HEAD` using `git diff <base>...HEAD`

#### Changes scope

1. Collect `git diff` and `git diff --cached`
2. If both empty, report "no changes" and stop

#### PR scope

1. Resolve PR from `scope=pr:<...>`; otherwise use current branch PR
2. Fetch metadata + diff (`gh pr view`, `gh pr diff`, draft allowed)
3. If PR cannot be resolved, report blocker and stop

### Step 2: Review phase

1. Select reviewer set from coverage param
2. Spawn reviewers in parallel with resolved scope context:
   - diff body/scope
   - changed files
   - original task/spec text when available
   - stack/conventions context
3. Accept high-confidence findings only
4. Merge findings and classify exactly in this order:
   1. Critical
   2. Important
   3. Minor (optional)
5. Write report only if findings exist into `REVIEW.md`

Report shape:

- Actionable Checklist
  - Critical items with location, why, concrete fix
  - Important items with location, why, concrete fix
- Nice-to-Have
  - Minor observations

If no findings, do NOT create report file. Return clean summary in conversation.

### Step 3: Autofix decision

Compute total issues from merged findings (`Critical + Important + Minor`).

- If user explicitly set `autofix` param, honor it always.
- If omitted:
  - total findings `< 10` → autofix ON
  - total findings `>= 10` → autofix OFF

### Step 4: Fix phase (conditional)

Run only when autofix ON and at least one finding exists.

**Analyze each finding and determine the concrete fix** — identify exact file paths, lines, and the specific code change needed. Then spawn `mp-executor` sub-agent (sonnet) with pre-analyzed fix instructions:

- concrete fix per finding: file path, current code, and exact change to apply (the executor applies — it does not diagnose)
- resolved scope summary (branch/changes/pr)
- report path (`REVIEW.md`)
- requirement: fix only in-scope findings

After executor completes, run the same selected reviewer set again on updated scope.

- If issues remain, append `## Post-Fix Review` section to the same report and repeat Fix Phase up to 3 iterations or until clean
- If no issues remain, append `## Post-Fix Review` with clean status

## Behavior Contract

- Read-only when fix phase does not run
- Source edits only in fix phase via `mp-executor`
- No commits
- No GitHub comments/reviews

## Output

```markdown
Mode: review
Scope: [branch|changes|pr]
Coverage: [full|partial]
Autofix: [true|false|auto-resolved]

Findings:

- total: [N]
- critical: [N]
- important: [N]
- minor: [N]

Report:

- [path or "none"]

Fix Step:

- executed: [yes/no]
- result: [clean/remaining issues/not requested]
```
