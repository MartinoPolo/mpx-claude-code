---
name: mp-commit-push-pr
description: 'Full workflow - commit, push, and create or update PR. Use when: "commit push and PR", "full workflow", "ship with PR"'
allowed-tools: Agent, Bash(git *), Bash(gh *), Bash(node *)
metadata:
  author: MartinoPolo
  version: "0.2"
  category: git-workflow
---

# Commit, Push, and Create/Update PR

Full workflow: stage → commit → push → detect base → create or update PR. $ARGUMENTS

Pass `draft` as argument to create a draft PR instead of a normal PR.

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

Stage specific files (skip .env, credentials, secrets).

```bash
git commit -m "$(cat <<'EOF'
type(scope): Description

Optional body with details
EOF
)"
```

**Commit Rules:** (see `/mp-commit` for full format reference)

- Conventional commit format: `type(scope): description`
- Types: feat, fix, refactor, chore, docs, style, test, perf, ci, build, revert
- Prefer new commits over `--amend`
- Focus on "why" over "what"
- Keep subject line under 72 characters
- Imperative mood: "Add feature" not "Added feature"

### Step 4: Push

```bash
git push -u origin $(git branch --show-current)
```

If nothing to push (local and remote in sync) → skip to Step 5.

### Step 5: Detect Base Branch

```bash
node $HOME/.claude/scripts/detect-base-branch.js
```

Pass explicit base from `$ARGUMENTS` if provided; otherwise the script auto-detects from remote branches.

**Based on result:**

- **Branch returned** → use it, display to user
- **Null with candidates** → ask user to pick from candidates
- **Null without candidates** → ask user to specify manually

### Step 6: Find Linked Issue

**Fast-path:** First try `node $HOME/.claude/scripts/extract-branch-issue.js`. If it returns a number, verify with `gh issue view <N> --json title`. Only use agent fallback if no number extracted.

If agent fallback needed, spawn `mp-issue-finder` sub-agent with repo, branch name, commit messages, and diff summary.

**Based on result:**

- **High confidence match** → add `Closes #N` to PR body
- **Candidates returned** → ask user which (if any) to link
- **No match** → proceed without linking

### Step 7: Check Existing PR

```bash
gh pr view --json number,title,body,url,state 2>/dev/null
```

- **OPEN PR exists** → edit mode (Step 8a)
- **No PR or not OPEN** → create mode (Step 8b)

### Step 8a: Update Existing PR

```bash
gh pr edit --title "#N type(scope): Description" --body "$(cat <<'EOF'
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

### Step 8b: Create PR

```bash
gh pr create --base <base> --title "#N type(scope): Description" --body "$(cat <<'EOF'
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

If `draft` is in `$ARGUMENTS`, add `--draft` flag to `gh pr create`.

## PR Rules

### Title

`#N type(scope): Description` — when a linked issue exists, prefix with `#N`. Without linked issue: `type(scope): Description`.

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
- [ ] Manual smoke test: commit + push + PR flow
```

### Critical

> Git/PR conventions enforced by hooks (pre-commit-gate, gh-transform, dangerous-command-guard).

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
