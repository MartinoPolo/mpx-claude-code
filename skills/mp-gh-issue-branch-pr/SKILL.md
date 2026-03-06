---
name: mp-gh-issue-branch-pr
description: 'Create issue from current work, branch, then commit/push/create PR via existing skills. Use when: "create issue and PR", "log bug and open PR", "issue + branch + PR"'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Task, AskUserQuestion, Bash(git *), Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: git-workflow
---

# Create Issue and PR

Log work as a GitHub issue, create/switch branch, then commit/push and create or update draft PR. $ARGUMENTS

GitHub MCP allowed for this skill.

## Architecture

Reuse existing skills. Do not re-implement their logic.

- Issue creation: `mp-gh-issue-create`
- Commit/push/PR: `mp-commit-push-pr`

## Workflow

### Step 1: Capture Current Context

Collect current change context before issue creation.

```bash
git status
git diff --stat
git diff --cached --stat
```

Add context from the current session.
Use this context as input for issue drafting.

### Step 2: Create Issue via Existing Skill

Dispatch `mp-gh-issue-create` with:

- User intent from `$ARGUMENTS`
- Current session change summary
- Relevant files/signals discovered from diff

Use this exact dispatch prompt:

```text
Create one GitHub issue for this work-in-progress.

Input:
- User intent: <$ARGUMENTS>
- Working tree context: <git status + diff stats>
- Relevant files/signals: <detected paths and clues>

Required actions:
1) Infer issue type (bug/feature/chore/docs).
2) Draft precise title, clear description, and acceptance criteria.
3) Create issue in current repository.

Required output:
- issue_number
- issue_url
- issue_title
- labels_applied
```

### Step 3: Create and Switch Branch

Derive branch name from issue metadata.

Format:

`<issue-number>-<short-kebab-summary>`

Example:

`123-dashboard-filter-crash`

Create and switch:

```bash
git checkout -b <branch-name>
```

If branch exists, switch to it.

### Step 4: Commit, Push, and Create/Update PR

Dispatch `mp-commit-push-pr`.

Pass:

- Explicit instruction to link the created issue in PR body (`Closes #N`)
- Any base branch hints from `$ARGUMENTS`

Use this exact dispatch prompt:

```text
Run full commit/push/PR workflow for the current branch.

Input:
- Linked issue: #<issue_number>
- Link requirement: include "Closes #<issue_number>" in PR body
- Base hint: <$ARGUMENTS if provided>

Required actions:
1) Stage and commit pending changes (if any).
2) Push branch to origin.
3) Detect base branch.
4) Create or update draft PR.
5) Ensure PR body links issue with "Closes #<issue_number>".

Required output:
- commit_hash (or "none")
- branch_name
- base_branch
- pr_number
- pr_url
- mode: created|updated
```

### Step 5: Final Summary

Return:

- Issue URL and number
- Branch name
- Commit hash/message (if created)
- PR URL and number
- Whether PR was created or updated

## Rules

- Always create the issue before branch/PR workflow
- Always branch from current HEAD unless user specifies otherwise
- Prefer existing branch if it already matches the issue
- Keep commit and PR titles in conventional format
- Never add AI attribution

## Failure Handling

| Problem               | Action                                           |
| --------------------- | ------------------------------------------------ |
| Issue creation fails  | Stop and report blocker                          |
| Branch creation fails | Ask for alternate branch name                    |
| No changes to commit  | Continue PR update path if commits already exist |
| PR creation blocked   | Report `gh` error and remediation                |
