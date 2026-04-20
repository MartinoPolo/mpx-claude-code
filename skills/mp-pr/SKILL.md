---
name: mp-pr
description: 'Create or update PR from existing commits. Use when: "create PR", "open pull request", "make a PR", "update PR"'
allowed-tools: Agent, Bash(gh pr *), Bash(git status *), Bash(git log *), Bash(git diff *), Bash(git branch *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git rev-list *), Bash(git remote *), Bash(git *), Bash(gh *), Bash(node *)
metadata:
  author: MartinoPolo
  version: "0.3"
  category: git-workflow
---

# Create or Update Pull Request

Create or update a PR from existing commits on current branch. $ARGUMENTS

Pass `draft` as argument to create a draft PR instead of a normal PR.

## Workflow

### Step 1: Find Linked Issue

**Fast-path:** First try `node $HOME/.claude/scripts/extract-branch-issue.js`. If it returns a number, verify with `gh issue view <N> --json title`. Only use agent fallback if no number extracted.

If agent fallback needed, spawn `mp-issue-finder` sub-agent with repo, branch name, commit messages, and diff summary.

**Based on result:**

- **High confidence match** → pass issue_number to Step 2
- **Candidates returned** → ask user which (if any) to link
- **No match** → proceed without issue_number

### Step 2: Delegate to Haiku Agent

Spawn `mp-pr-manager` sub-agent with:

> issue_number: (from Step 1, if found)
> base_branch: (from $ARGUMENTS if user specified, otherwise omit for auto-detection)
> draft: true (if `draft` in $ARGUMENTS)

### Step 3: Handle Result

Parse the agent's JSON output:

- **OK** → display PR URL, number, whether created or updated, base branch
- **FAIL** → escalate (Step 4)

### Step 4: Escalation (on FAIL only)

Read the error from agent output. Diagnose and fix the issue (e.g., `gh auth` problem, remote not set). Then re-spawn `mp-pr-manager` with the same parameters.

Up to 2 retry attempts. If still failing → report error to user and stop.

## PR Rules

PR title and body format governed by `agents/mp-pr-manager.md`. Git/PR conventions enforced by hooks (pre-commit-gate, gh-transform, dangerous-command-guard).

## Troubleshooting

| Problem                   | Solution                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| "PR creation fails"       | Check `gh auth status`, verify remote exists with `git remote -v` |
| "Base branch not found"   | Specify base explicitly: `/mp-pr main`                            |
| "PR already exists"       | Existing PR is updated automatically — this is expected           |

## Output

After completion, display:

- Base branch used
- PR URL and number
- Whether created or updated
- **Session Activity:** list agents dispatched
