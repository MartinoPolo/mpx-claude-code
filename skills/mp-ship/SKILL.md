---
name: mp-ship
description: 'Ship finished work: sync base, commit, push, PR, wait for CI green, merge. Use when: "ship it", "ship and merge", "ship this"'
argument-hint: "[base-branch]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Glob, Grep, Agent, Bash(git *), Bash(gh *), Bash(node *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: git-workflow
---

# Ship

Full workflow from finished execution to merged PR. $ARGUMENTS

## Flow Overview

1. **State detection** — skip completed steps
2. **Sync base** — merge target branch into current (Sonnet agent)
3. **Commit + push** — stage, commit, push (Haiku agent)
4. **Create/update PR** — find issue, create PR (Haiku agent)
5. **Arm auto-merge** — `gh pr merge --squash --auto`
6. **Watch CI** — `gh pr checks --watch`
7. **CI fix loop** — diagnose + fix failures (max 3 attempts)
8. **Post-merge** — comment, pull main repo

## Step 1: State Detection

Detect current state and determine entry point:

```bash
git status --porcelain
git log origin/<current>..HEAD --oneline 2>/dev/null
gh pr list --head <current-branch> --json number,state,url --jq '.[0]'
```

| State | Entry point |
|-------|-------------|
| Uncommitted changes | Step 2 (sync) |
| Committed but not pushed | Step 3 (push only) |
| Pushed, no PR | Step 4 (create PR) |
| PR exists, CI pending/failed | Step 6 (watch CI) |
| PR merged | Step 8 (post-merge) |

## Step 2: Sync Base Branch

Determine target branch: use `$ARGUMENTS` if provided, otherwise run `node $HOME/.claude/scripts/detect-base-branch.js`.

Spawn a **Sonnet** `general-purpose` sub-agent with sync-base instructions:

> **Task:** Merge origin/<target> into current branch.
>
> 1. `git fetch origin <target>`
> 2. `git log HEAD..origin/<target> --oneline` — if empty, report "already synced" and stop
> 3. `git merge origin/<target>`
> 4. If conflicts: list conflicted files (`git diff --name-only --diff-filter=U`), read each, resolve simple conflicts (non-overlapping, clear intent) with Edit tool + `git add`. For complex/ambiguous conflicts, show both sides and ask the user.
> 5. After all resolved: `git commit` (accept default merge message)
> 6. Report: commits merged, conflicts resolved (if any)

**If the Sonnet agent cannot resolve conflicts** (complex overlapping logic): take over at Opus level, resolve manually, then continue.

## Step 3: Commit and Push

Spawn `mp-git-committer` sub-agent (Haiku):

> push: true
> commit_hint: $ARGUMENTS or summary of changes from git diff --stat

**Handle result:**
- **OK** → continue
- **SKIP** (nothing to commit) → check if push needed; if already pushed, continue
- **FAIL** → diagnose error, fix, re-spawn (up to 2 retries)

## Step 4: Create/Update PR

**4a. Find linked issue:**

Fast-path: `node $HOME/.claude/scripts/extract-branch-issue.js`

If no number extracted, spawn `mp-issue-finder` sub-agent (Haiku) with repo, branch, commits, diff summary.

**4b. Create PR:**

Spawn `mp-pr-manager` sub-agent (Haiku):

> issue_number: (from 4a, if found)
> description_hint: summary of changes

**Handle result:**
- **OK** → continue with PR number
- **FAIL** → diagnose, fix, re-spawn (up to 2 retries)

## Step 5: Arm Auto-Merge

Detect repo merge strategy:

```bash
gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed --jq '.'
```

Prefer squash > merge > rebase (use first allowed).

```bash
gh pr merge <pr_number> --squash --auto
```

(Replace `--squash` with detected strategy if squash is not allowed.)

## Step 6: Watch CI

```bash
gh pr checks <pr_number> --watch
```

- **All pass** → GitHub auto-merges. Go to Step 8.
- **Any fail** → enter Step 7.

## Step 7: CI Fix Loop (max 3 attempts)

On CI failure:

### 7a. Fetch failure details

```bash
gh run list --branch <branch> --limit 1 --json databaseId,conclusion --jq '.[0]'
gh run view <run_id> --log-failed
```

### 7b. Diagnose

Analyze failure logs. Classify:

- **Lint/format/type error** → fix code directly
- **Test failure** → determine if implementation or test is wrong, fix accordingly
- **Infrastructure/flaky** → rerun failed jobs: `gh run rerun <run_id> --failed`

### 7c. Fix and re-push

For code fixes:
1. Apply fix at Opus level
2. Spawn `mp-git-committer` sub-agent (Haiku) with push: true, commit_hint: "fix: CI failure — <summary>"
3. Auto-merge is still armed — watch CI again (`gh pr checks <pr_number> --watch`)

For flaky/infra reruns:
1. `gh run rerun <run_id> --failed`
2. Watch CI again

### 7d. Escalation

After 3 fix attempts: report full failure summary to user and stop. Do not merge.

## Step 8: Post-Merge

### 8a. Post PR comment

Compose summary: what shipped, tests added, files changed, CI run URL. Write to temp file and post:

```bash
gh pr comment <pr_number> --body-file <temp_file>
```

### 8b. Sync main worktree

Detect worktree context:

```bash
git rev-parse --git-common-dir
```

- Returns `.git` → not in worktree, run `git pull` on current repo
- Returns path containing `worktrees/` → pull into main repo:

```bash
MAIN_REPO=$(dirname "$(cd "$(git rev-parse --git-common-dir)" && pwd)")
git -C "$MAIN_REPO" pull
```

### 8c. Return to original branch

```bash
git checkout <original-branch>
```

(Only if the pull in 8b switched context. In worktree mode this is unnecessary.)

## Output

After completion, display:

- Sync status (commits merged, conflicts resolved)
- Commit hash and message
- PR URL and number
- CI status (green, attempts needed)
- Merge confirmation
- Main repo pull status
