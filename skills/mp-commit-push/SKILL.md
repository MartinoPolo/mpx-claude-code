---
name: mp-commit-push
description: 'Stage, commit, and push changes (no PR). Use when: "commit and push", "push my changes", "ship it"'
allowed-tools: Bash(git *), Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: git-workflow
---

# Commit and Push

Stage, commit, and push changes. No PR created. $ARGUMENTS

GitHub MCP allowed for this skill.

## Workflow

### Step 1: Check Status

```bash
git status
git diff --stat
```

If nothing to commit (clean working tree + no staged changes) → skip to Step 4 (Push).

### Step 2: Review Recent Commits

```bash
git log --oneline -5
```

Match repository's commit style.

### Step 3: Stage and Commit

```bash
git add <specific-files>
```

Prefer specific files over `git add -A`. Avoid staging sensitive files (.env, credentials).

```bash
git commit -m "$(cat <<'EOF'
type(scope): Description

Optional body with details
EOF
)"
```

Commit format: conventional (see /mp-commit). Validated by pre-commit hook.

- Prefer new commits over --amend
- Focus on "why" over "what"

### Step 4: Push

```bash
git push -u origin $(git branch --show-current)
```

If nothing to push (local and remote in sync) → report "Already up-to-date" and stop.

## Output

After completion, display:

- Commit hash and message (if committed)
- Push status
- "Skipped commit — nothing to commit" (if applicable)
- "Already up-to-date" (if nothing to push)
