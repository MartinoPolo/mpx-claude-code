---
name: mp-execute
description: 'Execute tasks with TDD from GitHub issues, milestones, or inline descriptions. Use when: "execute issue", "implement issue", "work on issue", "execute tasks", "run TDD"'
argument-hint: '<#issue | #42 #43 | milestone:"Epic 1" | "inline task description">'
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Bash(gh *), Bash(git status *), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(git log *), Bash(bash $HOME/.claude/skills/mp-execute/scripts/detect-project-scripts.sh*), Bash(bash $HOME/.claude/scripts/detect-check-scripts.sh*), Bash(*run dev*), Bash(*run start*), Bash(*run preview*), Bash(cd * && *run dev*), Bash(cd * && *run start*), Bash(cd * && *run preview*), Bash(npm *), Bash(pnpm *), Bash(yarn *), Bash(bun *), Bash(lsof *), Bash(ss *), Bash(netstat *)
metadata:
  author: MartinoPolo
  version: "1.0"
  category: project-management
---

# Execute Work

Unified execution skill with TDD methodology. Accepts GitHub issues, milestones, or inline tasks.

## Usage

```
/mp-execute #42                        # Single GitHub issue
/mp-execute #42 #43 #44               # Multiple issues (executed in order)
/mp-execute milestone:"Epic 2"        # All open issues in milestone
/mp-execute "add dark mode toggle"    # Inline task (no GitHub issue)
/mp-execute --hard-gate #42           # Single issue with 6-reviewer hard gate
```

## Behavior Contract

- Default: run automatically end-to-end
- Ask user only when scope is unclear, conflicting, risky, or blocked
- TDD is the default execution method for all work

## Step 1: Resolve Input

Detect input type from `$ARGUMENTS`:

### GitHub Issue(s): `#42` or `#42 #43 #44`

```bash
gh issue view <number> --json title,body,labels,comments,state,milestone,url
```

Extract: goal, constraints, acceptance criteria, blocking relationships.

### Milestone: `milestone:"Epic 2"`

```bash
gh issue list --milestone "Epic 2" --state open --json number,title,labels,body
```

Sort by blocking relationships. Execute in dependency order.

### Inline Tasks: `"add dark mode toggle, fix header spacing"`

Parse comma-separated tasks. No GitHub issue — just execute with TDD.

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

For each issue/task, execute using **red-green-refactor**:

### 4a. Confirm Behaviors to Test

From the analyzer output (or inline task description), list the behaviors that need tests:

- Each acceptance criterion becomes one or more test cases
- Ask user to confirm if the list seems incomplete

### 4b. Red-Green-Refactor Loop

For each behavior:

1. **RED**: Write ONE test that describes the expected behavior
   - Run the test → verify it FAILS
   - If it passes, the behavior already exists — skip to next

2. **GREEN**: Write the minimal code to make the test pass
   - Run the test → verify it PASSES
   - Write only enough code to pass the test

3. **REFACTOR**: Look for improvement opportunities
   - Duplication, naming, structure
   - Run tests again → verify they still pass

Repeat until all behaviors are covered.

### 4c. Implementation Guidelines

- **Deep modules over shallow**: Prefer fewer modules with clear interfaces
- **No mocks unless necessary**: Test real behavior, not implementation details
- **Test at the right boundary**: Unit tests for logic, integration tests for interactions
- **Each test should test ONE thing**: Clear failure messages

For TDD principles, see:
- [Good vs bad tests](tests.md)
- [When to mock](mocking.md)
- [Deep modules](deep-modules.md)
- [Interface design for testability](interface-design.md)

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

If still failing after 3 iterations → report remaining issues as blockers.

## Step 6: Frontend Verification (conditional)

Detect if changes include frontend/UI modifications:

- `.svelte`, `.tsx`, `.jsx`, `.vue`, `.css` files changed
- Component or page files modified

If frontend changes detected:

1. Ensure dev server is running — use the dev script detected in Step 3 (e.g., `npm run dev`)
2. Spawn `mp-chrome-devtools-tester` sub-agent with verification requirements
3. If issues found → fix and re-verify (up to 3 iterations)

## Step 7: Commit

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

## Step 8: Next Issue (if multiple)

If executing multiple issues or a milestone:

1. Mark current issue's commit as done
2. Move to next unblocked issue in dependency order
3. Repeat Steps 2-7
4. Skip blocked issues, report them at the end

## Step 9: Finalization

After all issues are done:

1. Spawn `mp-docs-updater` sub-agent if significant changes warrant documentation updates
2. Report summary:
   - Issues completed
   - Tests added/modified
   - Files changed
   - Any remaining blockers
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
