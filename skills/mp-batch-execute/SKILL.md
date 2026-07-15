---
name: mp-batch-execute
description: 'Autonomously implement a batch of small issues (or a board section) end to end: select AFK issues by range/list/label/section, fix each in a sequential sub-agent on one shared branch, verify with checks + tests + visual Playwright, write results back to the board, and open one PR. Use when: "batch execute", "execute issues", "fix issues in bulk", "run the board", "execute range"'
argument-hint: '<#100-150 | #136,140 | label:redesign | BUGS | section:BUGS> [size:S]'
disable-model-invocation: true
allowed-tools: Read, Edit, Agent, TaskCreate, TaskUpdate, Bash(gh *), Bash(git *), Bash(bash $HOME/.claude/scripts/detect-check-scripts.sh*)
metadata:
  author: MartinoPolo
  version: "0.2"
  category: project-management
---

# mp-batch-execute

Orchestrate a batch of small fixes: this session is the Opus orchestrator; each fix runs in a Sonnet sub-agent. See [BOARD_CONVENTION.md](../shared/BOARD_CONVENTION.md) for the board write-back, [PLAYWRIGHT_TESTING.md](../shared/PLAYWRIGHT_TESTING.md) for the visual verify contract, and [REFERENCE.md](REFERENCE.md) for the experimental `--parallel` worktree mode. $ARGUMENTS

## Rules

- **One issue per fix sub-agent, sequential, on one shared branch** — all agents share the working tree, so parallel commits race the git index. (`--parallel` uses isolated worktrees instead; see REFERENCE.md.)
- **Skip HITL** — implement only `AFK` issues; report every issue skipped and why.
- **Never change a test just to make it pass** — fix the implementation, or the test only when it contradicts the acceptance criteria.
- This skill encodes the **policy**; concrete check/test/Playwright commands come from the project's `AGENTS.md` / memory, not from here.

## Step 1: Resolve selection

Parse `$ARGUMENTS`:

- `#100-150` (range), `#136,140` (list), `label:<x>` → **issue mode** (GitHub issues).
- `BUGS` / `# BUGS` / `section:BUGS` → **board-direct mode** (implement section items with no GitHub issue), per the BOARD_CONVENTION section syntax.
- optional `size:<S|M|L>` → filter the work list.

## Step 2: Build the work list

**Issue mode** — mirror the `mp-hitl` fetch-broad-then-filter pattern:

```bash
gh issue list --state open --json number,title,labels,body,url
```

Keep issues in the requested range/list/label; then filter client-side: keep `AFK`, drop `HITL` (collect the skipped list), drop blocked issues (parse `## Blocking Relationships` for open `Blocked by #N`), apply the `size:` filter.

**Board-direct mode** — read `.mpx/BOARD.md`, collect unchecked items under the section, and read each `![[...]]` image from `.mpx/board-files/`.

Create one `TaskCreate` entry per work item for visible progress.

## Step 3: Prepare the branch

From the repo root (`git rev-parse --show-toplevel`), confirm a clean tree and cut the batch branch from the base branch (slug from the section or range, e.g. `batch/bugs`):

```bash
git status --porcelain   # expect empty output
git checkout -b batch/<slug>
```

## Step 4: Fix loop (sequential)

For each work item, in order:

1. Set its Task `in_progress`.
2. Spawn a `claude` sub-agent (sonnet) with a prescriptive prompt: the exact issue/board text, the resolved screenshots, the target files (run a quick `Explore` first if the files are unknown), requirements as REQ-1..N, and the **exact** conventional commit message (`<type>: <subject>` plus a `Refs #<N>` trailer when an issue exists). Instruct it to **commit to the current branch only — do not push or open a PR.**
3. On the completion notification, confirm the commit landed. If the sub-agent died mid-run (e.g. `API Error: Overloaded`) leaving a partial edit, diagnose and finish/commit it yourself, or re-spawn — never leave a half-applied fix.
4. Mark the Task `completed`.

Spawn the next item's agent only after the current commit is confirmed.

## Step 5: Verify gate

In a Sonnet sub-agent, reuse the `mp-execute` Step 5/6 policy (details in [REFERENCE.md](REFERENCE.md)):

```bash
bash $HOME/.claude/scripts/detect-check-scripts.sh
```

- `mp-checker` runs **static checks** (`CHECK_ALL` or `TYPECHECK`/`LINT`/`FORMAT`/`BUILD`) — always.
- `mp-checker` runs **unit tests** (`TEST`/`TEST_UNIT`) — always; **e2e** (`TEST_E2E`) when source, route, component, spec, config, or dependency files changed.
- For UI-changed surfaces, run **raw-Playwright** visual verification with the **stale-worktree sanity-gate FIRST** ([PLAYWRIGHT_TESTING.md](../shared/PLAYWRIGHT_TESTING.md)).

Fix failures via a Sonnet fix sub-agent, up to 3 iterations. Failures still unresolved after that are a **hard blocker** — stop, report, and do not open the PR.

## Step 6: Write back to the board

For each successfully implemented item, `Edit` `.mpx/BOARD.md`: change the marker to `- [x]` and **move** the item under `# MANUAL TESTING`. Match the board item by its ` → #<N>` annotation (issue mode) or by item text (board-direct). Leave `# ARCHIVE` for the user.

## Step 7: One PR

```bash
gh pr create --draft --title "<batch title>" --body "<commit→issue table + Closes #<N> for each>"
```

If running inside a git worktree, sync the main worktree afterward (see REFERENCE.md).

## Report

List: implemented (issue/commit), skipped HITL/blocked, verify results (checks, tests, visual per surface), board items moved to `# MANUAL TESTING`, and the PR URL.
