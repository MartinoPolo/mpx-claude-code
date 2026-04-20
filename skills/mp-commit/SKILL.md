---
name: mp-commit
description: 'Stage and commit changes with conventional commit format. Use when: "commit this", "stage and commit", "make a commit"'
allowed-tools: Agent, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git *), Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.2"
  category: git-workflow
---

# Commit Changes

Stage and commit changes with conventional commit format. $ARGUMENTS

## Workflow

### Step 1: Delegate to Haiku Agent

Spawn `mp-git-committer` sub-agent with:

> push: false
> commit_hint: $ARGUMENTS (user's description of what to commit, if any)

### Step 2: Handle Result

Parse the agent's JSON output:

- **OK** → display commit hash, message, files changed
- **SKIP** → report "Nothing to commit"
- **FAIL** → escalate (Step 3)

### Step 3: Escalation (on FAIL only)

Read the error from agent output. Diagnose and fix the issue (e.g., pre-commit hook failure, staging error). Then re-spawn `mp-git-committer` with the same parameters.

Up to 2 retry attempts. If still failing → report error to user and stop.

## Commit Rules

> Git conventions validated by hooks (pre-commit-gate, dangerous-command-guard).

- Prefer new commits over --amend

### Format

`type(scope): description`

**Types:** feat, fix, refactor, chore, docs, style, test, perf, ci, build, revert

### Guidelines

- Focus on "why" over "what"
- Keep subject line under 72 characters
- Use imperative mood: "Add feature" not "Added feature"

## Output

After commit, display:

- Commit hash
- Commit message
- Files changed summary
