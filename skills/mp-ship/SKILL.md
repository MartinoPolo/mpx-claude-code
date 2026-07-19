---
name: mp-ship
description: 'Ship finished work: sync base, commit, push, PR, wait for CI green, merge. Use when: "ship it", "ship and merge", "ship this"'
argument-hint: "[base-branch]"
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
5. **Watch CI** — `gh pr checks --watch` (do NOT merge yet)
6. **CI fix loop** — diagnose + fix failures (max 3 attempts)
7. **Merge on green** — `gh pr merge --squash` only after CI is fully green
8. **Post-merge** — comment, pull main repo

> ⚠️ **Never `gh pr merge --auto` as the gate.** `--auto` only waits if the base
> branch has **required status checks** configured. If it doesn't (common), GitHub
> merges immediately — before CI finishes and regardless of pass/fail. This skill
> therefore **explicitly watches CI green first, then merges** (Steps 5→7), which is
> correct whether or not branch protection exists. `--auto` may only be used as a
> convenience *after* confirming required checks are configured (see Step 7).

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
| PR exists, CI pending/failed | Step 5 (watch CI) |
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

## Step 5: Watch CI (do NOT merge yet)

Wait for the PR's checks to complete. This blocks until all checks finish:

```bash
gh pr checks <pr_number> --watch
```

If the PR has **no checks at all** (`gh pr checks` exits non-zero with "no checks reported"), there is no CI to gate on — note this to the user and proceed to Step 7 (merge).

- **All pass** → go to Step 7 (merge on green).
- **Any fail** → enter Step 6.

> Do not merge here. The merge happens only in Step 7, after green.

## Step 6: CI Fix Loop (max 3 attempts)

On CI failure:

### 6a. Fetch failure details

```bash
gh run list --branch <branch> --limit 1 --json databaseId,conclusion --jq '.[0]'
gh run view <run_id> --log-failed
```

### 6b. Diagnose

Analyze failure logs. Classify:

- **Lint/format/type error** → fix code directly
- **Test failure** → determine if implementation or test is wrong, fix accordingly. A test that only fails intermittently is **flaky** — harden it (focus/settle guards, generous `waitFor` timeouts) rather than blindly rerunning; a green rerun of a flaky test is not a fix.
- **Infrastructure/flaky-by-environment** → rerun failed jobs: `gh run rerun <run_id> --failed`

### 6c. Fix and re-push

For code fixes:
1. Apply fix at Opus level
2. Spawn `mp-git-committer` sub-agent (Haiku) with push: true, commit_hint: "fix: CI failure — <summary>"
3. Return to Step 5 (watch CI again). Still do NOT merge until green.

For flaky/infra reruns:
1. `gh run rerun <run_id> --failed`
2. Return to Step 5 (watch CI again).

### 6d. Escalation

After 3 fix attempts: report full failure summary to user and stop. **Do not merge.**

## Step 7: Merge on Green

Only reached once Step 5 reports **all checks green** (or confirmed no checks exist).

Detect repo merge strategy:

```bash
gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed --jq '.'
```

Prefer squash > merge > rebase (use first allowed).

Merge **explicitly** (not `--auto`) so the merge is gated by the green CI you just confirmed, independent of whether branch protection exists:

```bash
gh pr merge <pr_number> --squash
```

(Replace `--squash` with the detected strategy if squash is not allowed.)

Confirm the merge landed:

```bash
gh pr view <pr_number> --json state,mergeCommit --jq '{state, mergeCommit: .mergeCommit.oid}'
```

> **`--auto` exception:** if the base branch already has required status checks
> configured (`gh api repos/{owner}/{repo}/branches/{base}/protection/required_status_checks`
> returns a non-empty `contexts`/`checks`), `gh pr merge <pr> --squash --auto` is
> equally safe and may be used instead — GitHub will then genuinely wait for those
> checks. When in doubt, use the explicit green-then-merge flow above.

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
