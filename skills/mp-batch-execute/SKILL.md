---
name: batch-execute
description: "Implements a batch of small AFK issues in sequential sub-agents on one shared branch, then opens a single PR."
argument-hint: '<#100-150 | #136,140 | label:redesign | board> [size:S] [--full-review | --no-review]'
disable-model-invocation: true
allowed-tools: Read, Edit, Agent, AskUserQuestion, TaskCreate, TaskUpdate, Bash(gh *), Bash(git *), Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/detect-check-scripts.mjs*)
metadata:
  author: MartinoPolo
  version: "0.10"
  category: project-management
---

# mp-batch-execute

Orchestrate a batch of small fixes: this session orchestrates; each fix runs in its own sub-agent. Read `${CLAUDE_SKILL_DIR}/../shared/BOARD_CONVENTION.md` now — board write-back format and lane layout. See `${CLAUDE_SKILL_DIR}/REFERENCE.md` for the experimental `--parallel` worktree mode. $ARGUMENTS

## Rules

- **One issue per fix sub-agent, sequential, on one shared branch** — all agents share the working tree, so parallel commits race the git index. (`--parallel` uses isolated worktrees instead; see REFERENCE.md.)
- **Gate `HITL` / `design needed`** — if the selection catches issues with either label and the user's filter didn't explicitly target that label (e.g. `label:design needed`), stop **before implementing anything** and `AskUserQuestion`: skip them / include anyway / run the design phase (mockup + refine) first. Only an explicit label filter proceeds without asking. Report every issue skipped and why.
- **Never change a test just to make it pass** — fix the implementation, or the test only when it contradicts the acceptance criteria.
- This skill encodes the **policy**; concrete check/test/Playwright commands come from the project's `AGENTS.md` / memory, not from here.

## Step 1: Resolve selection

Parse `$ARGUMENTS`:

- `#100-150` (range), `#136,140` (list), `label:<x>` → **issue mode** (GitHub issues).
- `board` → **board-direct mode** (implement the `# To Process` items that have no GitHub issue), per BOARD_CONVENTION.
- optional `size:<S|M|L>` → filter the work list.

## Step 2: Build the work list

**Issue mode** — mirror the `/mp:hitl` fetch-broad-then-filter pattern:

```bash
gh issue list --state open --json number,title,labels,body,url
```

Keep issues in the requested range/list/label; then filter client-side: keep `AFK`, but route anything labeled `HITL` or `design needed` through the gate in Rules first (`design needed` issues carry `AFK` too — the gate still applies; collect the skipped list); drop blocked issues (parse `## Blocking Relationships` for open `Blocked by #N`), apply the `size:` filter.

**Board-direct mode** — read `.mpx/BOARD.md`, collect items under `# To Process` (the checkbox is the user's manual-verification flag, not a work signal — don't filter on it), and read each `![[...]]` image from `.mpx/board-files/`. In issue mode, the corresponding board items sit under `# Ready to implement` (moved there by the board-to-issues step).

Create one `TaskCreate` entry per work item for visible progress.

## Step 3: Prepare the branch

From the repo root (`git rev-parse --show-toplevel`), confirm a clean tree and cut the batch branch from the base branch (slug from the range/label/selection, e.g. `batch/redesign`):

```bash
git status --porcelain   # expect empty output
git checkout -b batch/<slug>
```

## Step 4: Fix loop (sequential)

For each work item, in order:

1. Set its Task `in_progress`.
2. Spawn a `claude` sub-agent with `model: "opus"` and a prescriptive prompt — the plan is already made, so it applies rather than re-decides: the exact issue/board text, the resolved screenshots, the target files (run a quick `Explore` first if the files are unknown), requirements as REQ-1..N, and the **exact** conventional commit message (`<type>: <subject>` plus a `Refs #<N>` trailer when an issue exists). Instruct it to **commit to the current branch only, leaving push and PR creation for Step 7.**
3. On the completion notification, confirm the commit landed. If the sub-agent died mid-run (e.g. `API Error: Overloaded`) leaving a partial edit, diagnose and finish/commit it yourself, or re-spawn — never leave a half-applied fix.
4. Mark the Task `completed`.

Spawn the next item's agent only after the current commit is confirmed.

## Step 5: Verify gate

Runs **once** on the integrated batch branch, orchestrated at this level (not nested inside a single fix agent). Mirrors `/mp:execute`'s Step 5/6: static checks + tests, then code review, then visual.

### 5a. Static checks + tests

Run the detect script and hand the results to `mp-checker`:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/detect-check-scripts.mjs
```

- **Static checks** (`CHECK_ALL` or `TYPECHECK`/`LINT`/`FORMAT`/`BUILD`) — always.
- **Unit tests** (`TEST`/`TEST_UNIT`) — always; **e2e** (`TEST_E2E`) when source, route, component, spec, config, or dependency files changed.

Fix failures via an `mp-executor` sub-agent, up to 3 iterations. Still failing → **hard blocker**: stop and report, leaving the PR unopened.

### 5b. Code review (batch diff)

Unless `--no-review` is set, review the whole batch: spawn a `claude` sub-agent with `model: "opus"` to run `/mp:review scope=branch autofix=true` against the batch-branch diff (default → `partial` 4-reviewer set; `--full-review` → `full` 7-reviewer set). It engages the `mp-reviewer-*` agents and applies confidence-gated fixes via `mp-executor` (up to 3 iterations), writing `REVIEW.md`.

`/mp:review` does not commit — so **commit its fixes** as one `fix(review): apply batch review fixes` commit on the batch branch, then re-run **5a** to confirm still green. Review findings that persist after autofix are **non-blocking**: carry them into the PR body (Step 7), optionally routing them to the sibling issues with `mp-unresolved-issue-tracker`.

### 5c. Visual verification

For UI-changed surfaces: Read `${CLAUDE_SKILL_DIR}/../shared/PLAYWRIGHT_TESTING.md` now, then run **raw-Playwright** visual verification with the **stale-worktree sanity-gate FIRST**, in fix-list order. Fix failures via an `mp-executor` sub-agent, up to 3 iterations; still failing → **hard blocker**.

## Step 6: Write back to the board

For each successfully implemented item, `Edit` `.mpx/BOARD.md` to **move** the item under `# Manual testing` (create that heading if it's missing). **Leave the checkbox marker as `- [ ]` — never write `- [x]`; the checkbox is the user's alone, set only when they manually verify the fix before moving it to `# Archive`.** Match the board item by its ` → #<N>` annotation (issue mode, moving it out of `# Ready to implement`) or by item text (board-direct, moving it out of `# To Process`). (`.mpx/BOARD.md` is a symlink — if Edit/Write refuses it, resolve to the real vault path and edit that; see BOARD_CONVENTION.)

## Step 7: One PR

```bash
gh pr create --title "<batch title>" --body "<commit→issue table + Closes #<N> for each + non-blocking review findings from Step 5b>"
```

If running inside a git worktree, sync the main worktree afterward (see REFERENCE.md).

## Report

List: implemented (issue/commit), skipped `HITL`/`design needed`/blocked (with the gate decision), verify results (checks, tests, review findings + fixes, visual per surface), board items moved to `# Manual testing`, and the PR URL.
