---
name: mp-commit
description: 'Stage and commit changes with conventional commit format. Use when: "commit this", "stage and commit", "make a commit"'
allowed-tools: Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git *), Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: git-workflow
---

# Commit Changes

Stage and commit changes with conventional commit format. $ARGUMENTS

## Workflow

### Step 1: Check Status

```bash
git status
git diff --stat
```

### Step 2: Review Recent Commits

```bash
git log --oneline -5
```

Match repository's commit style.

### Step 3: Stage Changes

```bash
git add <specific-files>
```

Stage specific files (skip .env, credentials, secrets).

### Step 4: Commit

```bash
git commit -m "$(cat <<'EOF'
type(scope): Description

Optional body with details
EOF
)"
```

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
