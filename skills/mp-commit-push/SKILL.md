---
name: mp-commit-push
description: 'Stage, commit, and push changes (no PR). Use when: "commit and push", "push my changes", "ship it"'
allowed-tools: Agent, Bash(git *), Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.2"
  category: git-workflow
---

# Commit and Push

Stage, commit, and push changes. No PR created. $ARGUMENTS

## Workflow

### Step 1: Delegate to Haiku Agent

Spawn `mp-git-committer` sub-agent with:

> push: true
> commit_hint: $ARGUMENTS (user's description, if any)

### Step 2: Handle Result

Parse the agent's JSON output:

- **OK** → display commit hash, message, push status
- **SKIP** → report "Nothing to commit" (if clean tree) or "Already up-to-date" (if nothing to push)
- **FAIL** → escalate (Step 3)

### Step 3: Escalation (on FAIL only)

Read the error from agent output. Diagnose and fix the issue (e.g., pre-commit hook failure, push rejection). Then re-spawn `mp-git-committer` with the same parameters.

Up to 2 retry attempts. If still failing → report error to user and stop.

## Output

After completion, display:

- Commit hash and message (if committed)
- Push status
- "Nothing to commit — already up-to-date" (if applicable)
