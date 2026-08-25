# Execute: Mergeability, CI, and Close-out

Read and follow this sequence after PR creation succeeds.

### 8d. Ensure Mergeable (resolve merge conflicts — delegated)

Check: `gh pr view <pr_number> --json mergeable,mergeStateStatus --jq '{mergeable, mergeStateStatus}'`

If `mergeable` is `CONFLICTING`: the base branch has diverged and CI **will not run** until conflicts are resolved (the most common reason for missing CI checks — not pending or rate-limited CI). Spawn a `general-purpose` sub-agent with `model: "opus"`:

> Merge origin/<base> into <branch> and resolve all conflicts.
>
> 1. `git fetch origin <base>` then `git merge origin/<base>`
> 2. Resolve conflicts: prefer the feature branch's version for code just written for issue #N; incorporate base-only changes where they don't conflict with that work
> 3. Verify the resolution: spawn `mp-checker` with [static + test commands from Step 3]; fix regressions before committing
> 4. Spawn `mp-git-committer` with push: true, commit_hint: "merge conflict resolution with <base>"
> 5. Return ONLY JSON: `{"status": "clean"|"blocked", "summary": "≤5 lines", "conflicts_resolved": ["file", ...]}`

Re-check mergeability. Repeat if still conflicting (up to 2 iterations), then escalate to user.

## Step 9: CI Green Gate

Require green CI before finalization. Local Step 5 is not a substitute — CI environment differences (OS, headless browsers, timing, secrets, build flags) can still produce divergent results.

### 9a. Watch CI

After push (and after confirming PR is mergeable per Step 8d): `gh pr checks <pr_number> --watch`

### 9b. Fix Loop (delegated — main never reads CI logs)

If any CI check fails, get the run id (`gh run list --branch <branch> --limit 1 --json databaseId --jq '.[0].databaseId'`) and spawn an `mp-ci-fixer` sub-agent (omit `model`; it declares its own):

> Fix failing run <run_id> on branch <branch> for PR #<pr_number>.
> Local verify commands: [static + test commands from Step 3].
> Return ONLY your JSON contract.

The agent fetches logs, diagnoses, fixes, commits+pushes, and re-watches CI — up to 3 attempts internally.

**Route the returned JSON:**

- `"clean"` → confirm with `gh pr checks <pr_number>`; continue to 9c
- `"issues_remaining"` → CI green; route `unresolved_findings` through Step 6 triage, then continue
- `"blocked"` → escalate to user with the agent's `summary` + `blockers`. **Do not declare completion.**

### 9c. Pre-finalization checks

Confirm all of the following:

- All pushed commits are on the remote branch
- `gh pr checks <pr>` shows **all checks passed**
- No uncommitted changes remain

## Step 10: Finalization

After CI is green:

1. Compose the final report: issue/task completed, tests added/modified, files changed (from sub-agent `files_changed` lists), PR URL(s), CI run URL (green), remaining blockers, unresolved items triaged, review summary (from Step 5 `summary`).
2. Post it as a PR comment (GitHub issues only): write the composed text to a temp file, then `gh pr comment <pr_number> --body-file <temp_file>`. The comment must be byte-identical to the final report output — the PR carries a complete audit trail.
3. Unless `--no-auto-merge` is set, merge and sync:
   - **3a.** Check state (auto-merge may have already merged): `gh pr view <pr_number> --json state --jq '.state'`
   - **3b.** If `OPEN`: `gh pr merge <pr_number> --squash --auto` (without `--delete-branch` — it fails in worktree contexts). If `MERGED`: skip.
   - **3c.** Re-check until `gh pr view <pr_number> --json state --jq '.state'` reports `MERGED`. If policy or merge-queue state keeps it open, report the blocker and stop before deleting the branch or syncing.
   - **3d.** Delete the remote branch after merge (idempotent): `git push origin --delete <branch_name> 2>/dev/null || true`
   - **3e.** Pull merged changes into the main worktree: `MAIN_REPO=$(dirname "$(cd "$(git rev-parse --git-common-dir)" && pwd)")` then `git -C "$MAIN_REPO" pull`. Skip when not in a worktree (`git rev-parse --git-common-dir` returns `.git`).
4. Output the same composed text as the final report of this run.

**Gate:** Continue only when every applicable close-out check passes, including green CI and a merged PR unless `--no-auto-merge` is set.
