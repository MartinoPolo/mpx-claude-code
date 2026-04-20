---
name: mp-commit-push-pr
description: 'Full workflow - commit, push, and create or update PR. Use when: "commit push and PR", "full workflow", "ship with PR"'
allowed-tools: Agent, Bash(git *), Bash(gh *), Bash(node *)
metadata:
  author: MartinoPolo
  version: "0.3"
  category: git-workflow
---

# Commit, Push, and Create/Update PR

Full workflow: stage → commit → push → find issue → create/update PR. $ARGUMENTS

Pass `draft` as argument to create a draft PR instead of a normal PR.

## Workflow

### Step 1: Commit and Push

Spawn `mp-git-committer` sub-agent with:

> push: true
> commit_hint: $ARGUMENTS (user's description, if any)

**Handle result:**

- **OK** → continue to Step 2
- **SKIP** (nothing to commit) → check if already pushed; if yes, continue to Step 2
- **FAIL** → diagnose error, fix the issue, re-spawn agent (up to 2 retries). If still failing → report to user and stop.

### Step 2: Find Linked Issue

**Fast-path:** First try `node $HOME/.claude/scripts/extract-branch-issue.js`. If it returns a number, verify with `gh issue view <N> --json title`. Only use agent fallback if no number extracted.

If agent fallback needed, spawn `mp-issue-finder` sub-agent with repo, branch name, commit messages, and diff summary.

**Based on result:**

- **High confidence match** → pass issue_number to Step 3
- **Candidates returned** → ask user which (if any) to link
- **No match** → proceed without issue_number

### Step 3: Create or Update PR

Spawn `mp-pr-manager` sub-agent with:

> issue_number: (from Step 2, if found)
> base_branch: (from $ARGUMENTS if user specified, otherwise omit for auto-detection)
> draft: true (if `draft` in $ARGUMENTS)
> description_hint: $ARGUMENTS or summary from mp-git-committer result

**Handle result:**

- **OK** → display PR URL, number, action taken
- **FAIL** → diagnose error, fix, re-spawn (up to 2 retries). If still failing → report to user and stop.

## PR Rules

PR title and body format governed by `agents/mp-pr-manager.md`. Git/PR conventions enforced by hooks (pre-commit-gate, gh-transform, dangerous-command-guard).

## Troubleshooting

| Problem                   | Solution                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| "PR creation fails"       | Check `gh auth status`, verify remote exists with `git remote -v` |
| "No commits to push"      | Ensure working tree has staged/unstaged changes                   |
| "Base branch not found"   | Specify base explicitly: `/mp-commit-push-pr main`                |
| "PR already exists"       | Existing PR is updated automatically — this is expected           |

## Output

After completion, display:

- Commit hash and message (if committed)
- Push status
- Base branch used
- PR URL and number
- Whether PR was created or updated
- Steps skipped (if any)
- **Session Activity:** list agents dispatched
