---
name: mp-pr
description: 'Create or update draft PR from existing commits. Use when: "create PR", "open pull request", "make a PR", "update PR"'
allowed-tools: Bash(gh pr *), Bash(git status *), Bash(git log *), Bash(git diff *), Bash(git branch *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git rev-list *), Bash(git remote *), Agent, Bash(git *), Bash(gh *), Bash(node *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: git-workflow
---

# Create or Update Pull Request

Create or update a draft PR from existing commits on current branch. $ARGUMENTS

## Workflow

### Step 1: Detect Base Branch

```bash
node $HOME/.claude/scripts/detect-base-branch.js
```

Pass explicit base from `$ARGUMENTS` if provided; otherwise the script auto-detects from remote branches.

**Based on result:**

- **Branch returned** → use it, display to user
- **Null with candidates** → ask user to pick from candidates
- **Null without candidates** → ask user to specify manually

### Step 2: Review Changes

```bash
git log origin/<base>..HEAD --oneline
git diff origin/<base>..HEAD --stat
```

### Step 3: Find Linked Issue

**Fast-path:** First try `node $HOME/.claude/scripts/extract-branch-issue.js`. If it returns a number, verify with `gh issue view <N> --json title`. Only use agent fallback if no number extracted.

If agent fallback needed, spawn `mp-issue-finder` sub-agent with repo, branch name, commit messages, and diff summary.

**Based on result:**

- **High confidence match** → add `Closes #N` to PR body
- **Candidates returned** → ask user which (if any) to link
- **No match** → proceed without linking

### Step 4: Check Existing PR

```bash
gh pr view --json number,title,body,url,state 2>/dev/null
```

- **OPEN PR exists** → edit mode (Step 5a)
- **No PR or not OPEN** → create mode (Step 5b)

### Step 5a: Update Existing PR

```bash
gh pr edit --title "type(scope): Description" --body "$(cat <<'EOF'
## Description
- Summary bullet 1
- Summary bullet 2

## Resolves
Closes #123

## Testing (Optional)
- [ ] npm test
- [ ] Manual smoke test: <what was verified>
EOF
)"
```

### Step 5b: Create Draft PR

```bash
gh pr create --draft --base <base> --title "type(scope): Description" --body "$(cat <<'EOF'
## Description
- Summary bullet 1
- Summary bullet 2

## Resolves
Closes #123

## Testing (Optional)
- [ ] npm test
- [ ] Manual smoke test: <what was verified>
EOF
)"
```

## PR Rules

### Title

`type(scope): Description` — conventional commit format

### Description

Review ALL commits `origin/<base>..HEAD`. Write a structured PR body with the sections below:

- `## Description` → 1-6 concise bullets summarizing full scope of changes
- `## Resolves` → `Closes #N` when linked issue exists; otherwise `None`
- `## Testing (Optional)` → include only when tests/manual checks were run

```
## Description
- Extract base branch detection into reusable agent (was duplicated across 3 skills)
- Add existing PR check to avoid duplicate PRs on repeated runs

## Resolves
Closes #42

## Testing (Optional)
- [ ] npm test
- [ ] Manual smoke test: create + update PR flow
```

### Critical

> Git/PR conventions enforced by hooks (pre-commit-gate, gh-transform, dangerous-command-guard).

## Output

After completion, display:

- Base branch used
- PR URL and number
- Whether created or updated
- **Session Activity:** list agents dispatched
