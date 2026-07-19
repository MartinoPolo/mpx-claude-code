# mp-batch-execute — Reference

Extended detail for the verify gate and the experimental parallel mode. The main flow is in [SKILL.md](SKILL.md).

## Playwright visual verification

The verify gate runs raw-Playwright visual verification in a read-only Sonnet sub-agent (it asserts, it does not fix). The full reliability contract — stale-worktree sanity-gate, assert-don't-eyeball, programmatic auth, never `networkidle`, per-surface PASS/FAIL — lives in `${CLAUDE_SKILL_DIR}/../shared/PLAYWRIGHT_TESTING.md`. Run checks in **fix-list order**; only surfaces whose UI actually changed need one.

## Experimental `--parallel` mode (worktree isolation)

Default execution is **sequential on one shared branch** because all sub-agents share one working tree and parallel commits race the git index. `--parallel` trades that for speed by giving each fix sub-agent its own git worktree.

**Mechanism.** Spawn each fix sub-agent via the Agent tool with `isolation: "worktree"` — the harness creates a temporary worktree per agent (auto-removed if unchanged), so agents edit and commit isolated copies concurrently. Because worktrees share the same `.git` object store, their commits are all visible from the main checkout.

**Integration.** After the parallel agents finish, integrate each item's commit onto the batch branch from the main checkout (`git merge --no-ff` or `git cherry-pick`). Small issues touch disjoint files, so conflicts are rare; resolve any that occur before the verify gate. The verify gate (Step 5) then runs **once** on the integrated branch — not per worktree.

**Worktree cleanup / sync.** After merging, if the orchestrator itself is running inside a worktree, sync the main worktree:

```bash
# Returns .git → not in a worktree; returns a path containing worktrees/ → pull into main.
git rev-parse --git-common-dir
MAIN_REPO=$(dirname "$(cd "$(git rev-parse --git-common-dir)" && pwd)")
git -C "$MAIN_REPO" pull
```

**Caveats.** Each worktree hardlinks dependencies (~15s setup) and, for any per-worktree check that needs a running app/DB, its own server/DB — so keep parallel agents to static-checkable fixes and defer app-driven verification to the single post-integration gate. Treat `--parallel` as experimental: no other skill exercises worktree-isolated sub-agents yet, so validate results against a sequential run before relying on it.
