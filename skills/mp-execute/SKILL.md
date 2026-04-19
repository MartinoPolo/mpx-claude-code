---
name: mp-execute
description: 'Execute tasks with TDD from GitHub issues, milestones, or inline descriptions. Use when: "execute issue", "implement issue", "work on issue", "execute tasks", "run TDD"'
argument-hint: '<#issue | milestone:"Epic 1" | "inline task description or checklist">'
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Bash(gh *), Bash(git status *), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(git push *), Bash(git log *), Bash(git fetch *), Bash(git merge *), Bash(git checkout --ours *), Bash(git branch *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git remote *), Bash(git -C *), Bash(node *), Bash(bash $HOME/.claude/skills/mp-execute/scripts/detect-project-scripts.sh*), Bash(bash $HOME/.claude/scripts/detect-check-scripts.sh*), Bash(*run dev*), Bash(*run start*), Bash(*run preview*), Bash(cd * && *run dev*), Bash(cd * && *run start*), Bash(cd * && *run preview*), Bash(npm *), Bash(pnpm *), Bash(yarn *), Bash(bun *), Bash(lsof *), Bash(ss *), Bash(netstat *)
metadata:
  author: MartinoPolo
  version: "1.9"
  category: project-management
---

# Execute Work

Unified execution skill with TDD methodology. Accepts GitHub issues, milestones, or inline tasks.

## Usage

```
/mp-execute #42                        # Single GitHub issue
/mp-execute milestone:"Epic 2"        # Pick one open, unblocked issue from milestone
/mp-execute "add dark mode toggle"    # Inline task (no GitHub issue)
/mp-execute "- [ ] add dark mode toggle\n- [ ] fix header spacing"  # Inline checklist
/mp-execute --full-review #42         # Single issue with 6-reviewer full review
/mp-execute --no-review #42           # Simple task — skip reviewer sub-agents
/mp-execute --no-auto-merge #42       # Stop after CI green; leave PR open
```

## Behavior Contract

- Default: run automatically end-to-end
- Ask user only when scope is unclear, conflicting, risky, or blocked
- TDD is the default execution method for all work

## Step 1: Resolve Input

Detect input type from `$ARGUMENTS`:

### GitHub Issue: `#42`

```bash
gh issue view <number> --json title,body,labels,comments,state,milestone,url
```

Extract: goal, constraints, acceptance criteria, blocking relationships.

### Milestone: `milestone:"Epic 2"`

```bash
gh issue list --milestone "Epic 2" --state open --json number,title,labels,body
```

Select exactly one open, unblocked issue from milestone order and execute only that issue in this run. If none are unblocked, report blockers and stop.

### Inline Tasks: `"add dark mode toggle, fix header spacing"`

Parse comma-separated tasks or markdown checklist items. No GitHub issue — just execute with TDD.

If no `$ARGUMENTS`: ask user what to execute.

## Step 2: Analyze (GitHub issues only)

Spawn `mp-issue-analyzer` sub-agent to explore + analyze + plan:

> Issue: [title, body, acceptance criteria]
> Codebase: [project root]
>
> 1. Explore the codebase to understand relevant areas
> 2. Classify issue type (bug/task/feature) with rationale
> 3. Create execution plan with:
>    - Files to modify/create
>    - Behaviors to test (for TDD)
>    - Acceptance criteria mapped to test cases
>    - Risk areas and open questions
> 4. If external library behavior is uncertain, note it for Context7 lookup

If analyzer identifies open questions → ask user (clarification gate).

If analyzer identifies external library uncertainty → spawn `mp-context7-docs-fetcher` sub-agent.

## Step 3: Detect Available Checks

```bash
bash $HOME/.claude/scripts/detect-check-scripts.sh
```

Parse output key=value pairs. Store all detected commands — both check-style (`CHECK_ALL`, `TYPECHECK`, `LINT`, `FORMAT`, `BUILD`) and test-style (`TEST`, `TEST_UNIT`, `TEST_E2E`) — for use in Step 5 and Step 6.

**Treat test commands as first-class checks.** They are the CI parity gate: if CI runs them, this skill must run them locally before push.

## Step 4: TDD Execution Loop

Execute the selected issue/task using **red-green-refactor**:

### 4a. Confirm Behaviors to Test

From the analyzer output (or inline task description), list the behaviors that need tests:

- Each acceptance criterion becomes one or more test cases
- Ask user to confirm if the list seems incomplete

### 4b. Execute TDD

Spawn `mp-tdd-executor` sub-agent with:

- The confirmed behaviors list from 4a
- Project context (test framework, file structure, relevant source files)
- Acceptance criteria from the issue/task

The executor handles the full red-green-refactor cycle for each behavior.

## Step 5: Review + Static Check Loop (up to 3 iterations)

After TDD execution, always spawn `mp-checker` with detected **static** check commands from Step 3 (`CHECK_ALL` or `TYPECHECK`/`LINT`/`FORMAT`/`BUILD`). Static checks always run — they are part of the CI-parity gate.

Unless `--no-review` is set, also spawn these reviewer sub-agents in parallel:

- `mp-reviewer-code-quality`
- `mp-reviewer-best-practices`
- `mp-reviewer-spec-alignment`

If `--full-review` is set, additionally spawn in parallel:

- `mp-reviewer-security`
- `mp-reviewer-performance`
- `mp-reviewer-error-handling`

### Resolve Findings

If reviewers or checker report issues (confidence > 65):

1. Collect all findings into a scoped fix list
2. Spawn `mp-executor` sub-agent in fix mode with the findings
3. Re-run ONLY the failed reviewers/checks
4. Repeat up to 3 iterations total

If still failing after 3 iterations → collect remaining issues as **unresolved items** for triage in Step 7.

## Step 6: Test Execution Gate (mandatory — CI parity)

**This step runs the project's own test suites exactly as CI does.** This is the mandatory CI-parity gate and must pass before commit/push.

### 6a. Run All Detected Test Commands

Using the test commands detected in Step 3 (`TEST`, `TEST_UNIT`, `TEST_E2E`), spawn `mp-checker` with:

- `TEST` or `TEST_UNIT` (unit tests — fast, always run)
- `TEST_E2E` (e2e/browser tests — run when any of the following changed: source files, route files, component files, e2e spec files, build config, or dependencies)

If no test commands were detected → skip to Step 6c.

### 6b. Fix Loop (up to 3 iterations)

If any test command fails:

1. Collect failures with file:line, error message, and failing test name
2. Spawn `mp-executor` sub-agent in fix mode. The fix scope is **either** the implementation **or** the test — whichever is incorrect relative to the issue's acceptance criteria. Never change a test just to make it pass (see Rules).
3. Re-run ONLY the failed test commands
4. Repeat up to 3 iterations

If tests still fail after 3 iterations → **do not push**. Report failures to user and stop. This is a hard blocker, not an unresolved item.

### 6c. Interactive Manual Verification (optional, frontend only)

When changes are UI-heavy and e2e tests don't cover the specific interaction, optionally spawn `mp-playwright-tester` sub-agent for exploratory browser-based verification. This is in addition to `TEST_E2E`, never a replacement for it.

## Step 7: Unresolved Triage (GitHub issues only)

After review and frontend verification, collect any items that remain unresolved:

- Review persisting findings (from Step 5)
- Open questions from analysis that couldn't be clarified (from Step 2)
- Edge cases discovered during implementation but out of current issue's scope
- Frontend verification issues persisting after 3 iterations (from Step 6)

**If no unresolved items → skip to Step 8.**

Spawn `mp-unresolved-issue-tracker` sub-agent:

> Source issue: #<current_issue>
> Unresolved items:
>
> - **<summary>**: <reasoning why unresolved> — <description>
> - ...

The agent finds the parent PRD, scans sibling issues for scope match (appends to sibling body if fits), and creates/updates an `Unresolved: [PRD title]` tracking issue (labeled `HITL`) for remaining items. See `agents/mp-unresolved-issue-tracker.md` for full logic.

## Step 8: Commit

Stage and commit with conventional commit format:

```bash
git add <specific-files>
git commit -m "type(scope): description (refs #N)"
```

Rules:

- Reference GitHub issue in commit message: `refs #N` or `fixes #N`
- For inline tasks (no issue): no refs suffix
- Prefer specific files over `git add -A`
- Prefer new commits over `--amend`

## Step 9: Push and Create PR (GitHub issues only)

After commit, push and create a PR unless a significant blocker prevents it (e.g., failing checks, unresolved critical findings).

### 9a. Push

```bash
git push -u origin $(git branch --show-current)
```

### 9b. Detect Base Branch

```bash
node $HOME/.claude/scripts/detect-base-branch.js
```

### 9c. Create or Update PR

```bash
gh pr view --json number,title,body,url,state 2>/dev/null
```

- **OPEN PR exists** → update with `gh pr edit`
- **No PR** → create with `gh pr create`

PR title format: `#N type(scope): Description` (where N is the issue number).

PR body structure:

```
## Description
- Summary bullets

## Resolves
Closes #N

## Testing (Optional)
- [ ] Tests added/modified
```

For inline tasks (no GitHub issue): skip PR creation.

### 9d. Ensure Mergeable (resolve merge conflicts)

After creating/updating the PR, check mergeability:

```bash
gh pr view <pr_number> --json mergeable,mergeStateStatus --jq '{mergeable, mergeStateStatus}'
```

If `mergeable` is `CONFLICTING`: the base branch has diverged and CI **will not run** until conflicts are resolved. Do not assume CI is pending or rate-limited — merge conflicts are the most common reason for missing CI checks.

1. Fetch and merge the base branch locally:
   ```bash
   git fetch origin <base_branch>
   git merge origin/<base_branch>
   ```
2. Resolve all conflicts (prefer the feature branch's version for code this skill just wrote; incorporate base-only changes where they don't conflict with the current work)
3. Run Step 5 (static checks) + Step 6 (tests) locally to verify the merge resolution
4. Commit the merge and push
5. Re-check mergeability — repeat if still conflicting (up to 2 iterations)

If still conflicting after 2 iterations → escalate to user.

## Step 10: CI Green Gate (mandatory — completion gate)

**The skill is not done until CI is green.** Local Step 6 is not a substitute — CI environment differences (OS, headless browsers, timing, secrets, build flags) can still produce divergent results.

### 10a. Watch CI

After push (and after confirming PR is mergeable per Step 9d), watch checks until they complete:

```bash
gh pr checks <pr_number> --watch
```

### 10b. Fix Loop (up to 3 iterations)

If any CI check fails:

1. Pull the failed run logs:
   ```bash
   gh run view <run_id> --log-failed
   ```
2. Diagnose root cause from logs (file:line, error, failing test name)
3. Apply fix (source code, test, or config — whichever is wrong)
4. Re-run Step 5 (static checks) + Step 6 (tests) locally to verify
5. Commit + push + watch CI again
6. Repeat up to 3 iterations

If CI still fails after 3 iterations → escalate to user with full log summary. **Do not declare completion.**

### 10c. Completion Criteria

The skill is done **only when all of these are true**:

- All pushed commits are on the remote branch
- The PR is merged (default) — or left open if `--no-auto-merge` is set
- `gh pr checks <pr>` shows **all checks passed**
- No uncommitted changes remain

## Step 11: Finalization

After CI is green:

1. Spawn `mp-docs-updater` sub-agent if significant changes warrant documentation updates
2. Compose the final report (the same text that will be the final report of this run) covering:

- Issue/task completed
- Tests added/modified
- Files changed
- PR URL(s) created
- CI run URL (green)
- Any remaining blockers
- Unresolved items triaged (routed to sibling issues or tracking issue)
- Review findings summary

3. Post the final report as a PR comment (GitHub issues only). Write the composed text to a temp file and post it:

```bash
gh pr comment <pr_number> --body-file <temp_file>
```

The comment must be byte-identical to the text output as the final report of this run, so the PR carries a complete audit trail.

4. Unless `--no-auto-merge` is set, merge the PR and sync the main worktree:

**4a. Check PR state** (auto-merge may have already merged it):

```bash
gh pr view <pr_number> --json state --jq '.state'
```

**4b. Merge if still open** (without `--delete-branch` — it fails in worktree contexts):

If state is `OPEN`:

```bash
gh pr merge <pr_number> --squash --auto
```

If state is `MERGED`, skip.

**4c. Delete the remote feature branch** (idempotent):

```bash
git push origin --delete <branch_name> 2>/dev/null || true
```

**4d. Pull merged changes into the main worktree:**

```bash
MAIN_REPO=$(dirname "$(cd "$(git rev-parse --git-common-dir)" && pwd)")
git -C "$MAIN_REPO" pull
```

Skip 4d if not in a worktree (i.e., `git rev-parse --git-common-dir` returns `.git`).

5. Output the same composed text as the final report of this run.

## Rules

> Code quality and git conventions enforced by hooks.

- **TDD is not optional** — every behavior gets a test before implementation
- **Never weaken a correct test to make it pass.** A test may be fixed only when its assertion/selector/setup is demonstrably wrong relative to the acceptance criteria (e.g. invalid CSS selector, stale API contract, wrong role). Document the reason in the commit message.
- **Fix underlying issues** rather than suppressing (`@ts-ignore`, `eslint-disable`)
- **One behavior, one test** — keep tests focused
- **Red before green** — verify the test fails before implementing
- **Minimal green** — write only enough code to pass the test
- **Commit after each issue** — one commit per issue
- **CI is the completion gate** — a run ends when `gh pr checks` shows green, not when local checks pass

## Flags

Auto-merge is the **default** behavior: after CI is green and the final-report comment is posted, the PR is squash-merged and the branch deleted. Use `--no-auto-merge` to opt out.

| Flag              | Effect                                                                          |
| ----------------- | ------------------------------------------------------------------------------- |
| `--full-review`   | Add security, performance, and error-handling reviewers (6 reviewers total)     |
| `--no-review`     | Skip all reviewer sub-agents in Step 5 (static checks still run for CI parity)  |
| `--no-tdd`        | Skip TDD loop, implement directly (for trivial changes like config updates)     |
| `--no-auto-merge` | Stop after CI green + final-report comment; leave PR open instead of merging it |
