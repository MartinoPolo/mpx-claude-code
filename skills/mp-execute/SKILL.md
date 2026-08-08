---
name: execute
description: "Executes a GitHub issue, milestone, or inline task list end to end with TDD, opens a PR, and merges it once CI is green."
when_to_use: "User asks to execute, implement, or work on an issue, milestone, or task list."
argument-hint: '<#issue | milestone:"Version 1" | "inline task description or checklist">'
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Bash(gh *), Bash(git status *), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(git push *), Bash(git log *), Bash(git fetch *), Bash(git merge *), Bash(git checkout --ours *), Bash(git branch *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git remote *), Bash(git -C *), Bash(node *), Bash(node $HOME/.claude/scripts/detect-check-scripts.mjs*), Bash(*run dev*), Bash(*run start*), Bash(*run preview*), Bash(cd * && *run dev*), Bash(cd * && *run start*), Bash(cd * && *run preview*), Bash(npm *), Bash(pnpm *), Bash(yarn *), Bash(bun *), Bash(lsof *), Bash(ss *), Bash(netstat *)
metadata:
  author: MartinoPolo
  version: "2.7"
  category: project-management
---

# Execute Work

Unified execution skill with TDD methodology. Accepts GitHub issues, milestones, or inline tasks.

**The main agent is a pure orchestrator.** It parses input, sets up context, spawns sub-agents, routes their bounded JSON results, and gates on user decisions. Review findings, test failures, and CI logs are handled inside sub-agents — main only ever sees the return contracts. Never ask a sub-agent for its raw findings or logs.

## Communication Style

Use compressed output throughout execution: drop articles, filler, pleasantries, hedging. Fragments OK. Use abbreviations (DB/auth/config) and arrows (X → Y). Pattern: `[thing] [action] [reason]. [next step].` Keep technical terms exact, code blocks intact, error messages verbatim.

**Exception:** Step 10 final report uses normal professional prose (it's posted as a PR comment and read by humans).

## Usage

```
/mp:execute #42                        # Single GitHub issue
/mp:execute milestone:"Version 2"        # Pick one open, unblocked issue from milestone
/mp:execute "add dark mode toggle"    # Inline task (no GitHub issue)
/mp:execute "- [ ] add dark mode toggle\n- [ ] fix header spacing"  # Inline checklist
/mp:execute --full-review #42         # Full reviewer set
/mp:execute --no-review #42           # Simple task — skip reviewer sub-agents
/mp:execute --no-auto-merge #42       # Stop after CI green; leave PR open
```

## Behavior Contract

- Default: run automatically end-to-end
- Ask user only when scope is unclear, conflicting, risky, or blocked
- TDD is the default execution method for all work

## Step 1: Resolve Input

Detect input type from `$ARGUMENTS`:

- **GitHub issue** `#42` → `gh issue view <n> --json title,body,labels,comments,state,milestone,url`. Extract goal, constraints, acceptance criteria, blocking relationships.
- **Milestone** `milestone:"Version 2"` → `gh issue list --milestone "Version 2" --state open --json number,title,labels,body`. Select exactly one open, unblocked issue in milestone order; execute only that issue this run. None unblocked → report blockers, stop.
- **Inline tasks** `"add dark mode toggle, fix header spacing"` → parse comma-separated tasks or markdown checklist items. No GitHub issue — just execute with TDD.
- No `$ARGUMENTS` → ask user what to execute.

## Step 2: Analyze (GitHub issues only)

Spawn `mp-issue-analyzer` sub-agent to explore + analyze + plan:

> Issue: [title, body, acceptance criteria]
> Codebase: [project root]
>
> 1. Explore the codebase to understand relevant areas (breadth: medium)
> 2. Classify issue type (bug/task/feature) with rationale
> 3. Create execution plan: files to modify/create, behaviors to test (TDD), acceptance criteria mapped to test cases, risk areas and open questions
> 4. If external library behavior is uncertain, note it for Context7 lookup
> 5. If issue body/comments reference design files (e.g. `designs/<slug>/*.html`, `SUMMARY.md`, design brief), read them and extract layout + intent. Map to the existing design system per **Design Mapping** below; record mapping decisions in the plan as implementation constraints.

If analyzer identifies open questions → ask user (clarification gate).

If analyzer identifies external library uncertainty → spawn `mp-context7-docs-fetcher` sub-agent.

### Design Mapping (when issue references mockups)

Mockups are **inspiration, not source of truth.** When the issue links design files:

- Read the linked files before planning.
- **Layout** — match the mockup.
- **Colors** — match intent using existing semantic/theme tokens, even when the mockup uses a raw hex/OKLCH value a token already covers.
- **Components** — reuse existing custom components and variants (e.g. `Button`) instead of inlining raw elements. A significantly different look becomes a new variant of the custom component.
- Pass these mapping decisions to the TDD executor (Step 4) and verify-fix orchestrator (Step 5) as implementation constraints.

## Step 3: Detect Available Checks

Run `node $HOME/.claude/scripts/detect-check-scripts.mjs` and parse the key=value output. Store static check commands (`CHECK_ALL`, `TYPECHECK`, `LINT`, `FORMAT`, `BUILD`) and test commands (`TEST`, `TEST_UNIT`, `TEST_E2E`) — passed verbatim to sub-agents in Steps 5, 8d, 9.

**Test commands are first-class checks** — the CI parity gate: if CI runs them, they must pass locally before push.

## Step 4: TDD Execution Loop

Execute the selected issue/task using **red-green-refactor**:

### 4a. Confirm Behaviors to Test

From the analyzer output (or inline task description), list behaviors that need tests. Each acceptance criterion becomes one or more test cases. Ask user to confirm if the list seems incomplete.

### 4b. Execute TDD

Spawn `mp-tdd-executor` sub-agent with:

- The confirmed behaviors list from 4a
- Project context (test framework, file structure, relevant source files)
- Acceptance criteria from the issue/task
- Design Mapping constraints from Step 2 when the issue references mockups
- The test/check commands from Step 3, verbatim

The executor handles the full red-green-refactor cycle for each behavior.

## Step 5: Verify-Fix Loop (delegated)

All checking, reviewing, finding analysis, and fixing happens inside ONE nested orchestrator. Spawn an `mp-check-fixer` sub-agent (omit `model`; it declares its own):

> Inputs:
>
> - check_commands: [static check commands from Step 3]
> - test_commands: [test commands from Step 3]
> - reviewers: [list per flags — see below]
> - context: [issue/task summary, acceptance criteria, Design Mapping constraints from Step 2]
> - changed_scope: [branch + files changed in Step 4]
> - browser_verification: [true only for UI-heavy changes where e2e doesn't cover the interaction]
>
> Return ONLY your JSON contract.

Reviewer list by flags:

- Default: `mp-reviewer-code-quality`, `mp-reviewer-best-practices`, `mp-reviewer-spec-alignment`, `mp-reviewer-test-quality`
- `--full-review`: add `mp-reviewer-security`, `mp-reviewer-performance`, `mp-reviewer-error-handling`
- `--no-review`: empty list (static checks + tests still run — CI parity)

**Route the returned JSON:**

- `"clean"` → continue to Step 6
- `"issues_remaining"` → carry `unresolved_findings` (verbatim) into Step 6 triage; continue
- `"blocked"` → **do not push.** Report `blockers` + `summary` to user and stop. Hard blocker, not an unresolved item.

## Step 6: Unresolved Triage (GitHub issues only)

Collect items that remain unresolved: `unresolved_findings` from Step 5, open questions from Step 2 that couldn't be clarified, edge cases discovered during implementation but out of current issue's scope.

**If no unresolved items → skip to Step 7.**

Spawn `mp-unresolved-issue-tracker` sub-agent:

> Source issue: #<current_issue>
> Unresolved items:
>
> - **<summary>**: <reasoning why unresolved> — <description>
> - ...

The agent finds the parent epic, scans sibling issues for scope match (appends to sibling body if fits), and creates/updates an `Unresolved: [epic title]` tracking issue (labeled `HITL`) for remaining items. See `agents/mp-unresolved-issue-tracker.md` for full logic.

## Step 7: Commit and Push

Spawn `mp-git-committer` sub-agent to stage, commit, and push:

> push: true (for GitHub issues) / false (for inline tasks)
> issue_ref: "refs #N" or "fixes #N" (for GitHub issues)
> commit_hint: summary of implemented behaviors from Step 4

**Handle result:**

- **OK** → continue to Step 8 (GitHub issues) or Step 10 (inline tasks)
- **SKIP** → report "Nothing to commit" — check if push needed
- **FAIL** → diagnose error from agent output. If pre-commit hook failed, spawn `mp-executor` with the concrete fix and re-spawn committer. Up to 2 retries before escalating to user.

## Step 8: Create PR (GitHub issues only)

For inline tasks (no GitHub issue): skip to Step 10.

Spawn `mp-pr-manager` sub-agent to create or update the PR:

> issue_number: N (from Step 1)
> description_hint: summary of changes and behaviors implemented

**Handle result:**

- **OK** → continue to Step 8d
- **FAIL** → diagnose error, fix (spawn `mp-executor` with concrete instructions), re-spawn (up to 2 retries). If still failing → escalate to user.

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

## Step 9: CI Green Gate (mandatory — completion gate)

**The skill is not done until CI is green.** Local Step 5 is not a substitute — CI environment differences (OS, headless browsers, timing, secrets, build flags) can still produce divergent results.

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

### 9c. Completion Criteria

The skill is done **only when all of these are true**:

- All pushed commits are on the remote branch
- The PR is merged (default) — or left open if `--no-auto-merge` is set
- `gh pr checks <pr>` shows **all checks passed**
- No uncommitted changes remain

## Step 10: Finalization

After CI is green:

1. Compose the final report: issue/task completed, tests added/modified, files changed (from sub-agent `files_changed` lists), PR URL(s), CI run URL (green), remaining blockers, unresolved items triaged, review summary (from Step 5 `summary`).
2. Post it as a PR comment (GitHub issues only): write the composed text to a temp file, then `gh pr comment <pr_number> --body-file <temp_file>`. The comment must be byte-identical to the final report output — the PR carries a complete audit trail.
3. Unless `--no-auto-merge` is set, merge and sync:
   - **3a.** Check state (auto-merge may have already merged): `gh pr view <pr_number> --json state --jq '.state'`
   - **3b.** If `OPEN`: `gh pr merge <pr_number> --squash --auto` (without `--delete-branch` — it fails in worktree contexts). If `MERGED`: skip.
   - **3c.** Delete remote branch (idempotent): `git push origin --delete <branch_name> 2>/dev/null || true`
   - **3d.** Pull merged changes into the main worktree: `MAIN_REPO=$(dirname "$(cd "$(git rev-parse --git-common-dir)" && pwd)")` then `git -C "$MAIN_REPO" pull`. Skip when not in a worktree (`git rev-parse --git-common-dir` returns `.git`).
4. Output the same composed text as the final report of this run.

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
- **Main stays out of findings** — raw reviewer output, test failures, and CI logs live in sub-agents; main routes bounded JSON only

## Flags

Auto-merge is the **default** behavior: after CI is green and the final-report comment is posted, the PR is squash-merged and the branch deleted. Use `--no-auto-merge` to opt out.

| Flag              | Effect                                                                             |
| ----------------- | ---------------------------------------------------------------------------------- |
| `--full-review`   | Add security, performance, and error-handling reviewers to Step 5 (7 total)        |
| `--no-review`     | Skip reviewer sub-agents in Step 5 (static checks + tests still run for CI parity) |
| `--no-tdd`        | Skip TDD loop, implement directly (for trivial changes like config updates)        |
| `--no-auto-merge` | Stop after CI green + final-report comment; leave PR open instead of merging it    |
