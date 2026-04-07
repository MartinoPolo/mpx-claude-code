---
name: mp-execute
description: 'Execute tasks with TDD from GitHub issues, milestones, or inline descriptions. Use when: "execute issue", "implement issue", "work on issue", "execute tasks", "run TDD"'
argument-hint: '<#issue | milestone:"Epic 1" | "inline task description or checklist">'
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Bash(gh *), Bash(git status *), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(git push *), Bash(git log *), Bash(git branch *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git remote *), Bash(node *), Bash(bash $HOME/.claude/skills/mp-execute/scripts/detect-project-scripts.sh*), Bash(bash $HOME/.claude/scripts/detect-check-scripts.sh*), Bash(*run dev*), Bash(*run start*), Bash(*run preview*), Bash(cd * && *run dev*), Bash(cd * && *run start*), Bash(cd * && *run preview*), Bash(npm *), Bash(pnpm *), Bash(yarn *), Bash(bun *), Bash(lsof *), Bash(ss *), Bash(netstat *)
metadata:
  author: MartinoPolo
  version: "1.4"
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
/mp-execute --hard-gate #42           # Single issue with 6-reviewer hard gate
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

Parse output key=value pairs. Store detected check commands for use in review loop.

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

## Step 5: Review + Check Loop (up to 3 iterations)

After TDD execution, spawn these sub-agents in parallel:

- `mp-reviewer-code-quality`
- `mp-reviewer-best-practices`
- `mp-reviewer-spec-alignment`
- `mp-checker` — with detected check commands from Step 3

If `--hard-gate` flag is set, also spawn in parallel:

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

## Step 6: Frontend Verification (conditional)

Detect if changes include frontend/UI modifications:

- `.svelte`, `.tsx`, `.jsx`, `.vue`, `.css` files changed
- Component or page files modified

If frontend changes detected:

1. Ensure dev server is running — use the dev script detected in Step 3 (e.g., `npm run dev`)
2. Spawn `mp-playwright-tester` sub-agent with verification requirements
3. If issues found → fix and re-verify (up to 3 iterations)
4. If issues persist after 3 iterations → collect as **unresolved items** for triage in Step 7

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

## Step 10: Finalization

After execution is done:

1. Spawn `mp-docs-updater` sub-agent if significant changes warrant documentation updates
2. Report summary:

- Issue/task completed
- Tests added/modified
- Files changed
- PR URL(s) created
- Any remaining blockers
- Unresolved items triaged (routed to sibling issues or tracking issue)
- Review findings summary

## Rules

> Code quality and git conventions enforced by hooks.

- **TDD is not optional** — every behavior gets a test before implementation
- **Never modify tests to make them pass** — fix the implementation
- **Fix underlying issues** rather than suppressing (`@ts-ignore`, `eslint-disable`)
- **One behavior, one test** — keep tests focused
- **Red before green** — verify the test fails before implementing
- **Minimal green** — write only enough code to pass the test
- **Commit after each issue** — one commit per issue

## Flags

| Flag          | Effect                                                                      |
| ------------- | --------------------------------------------------------------------------- |
| `--hard-gate` | Add security, performance, and error-handling reviewers (6 total)           |
| `--no-tdd`    | Skip TDD loop, implement directly (for trivial changes like config updates) |
| `--dry-run`   | Analyze and plan only, don't implement                                      |
