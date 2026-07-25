# Git Commit Workflow

Canonical delegation workflow shared by `mp-commit`, `mp-commit-push`, `mp-commit-push-pr`, and `mp-pr`. This file defines the phases; each skill states which phases it runs and its parameter deltas.

## Phase A: Commit (and Optional Push) via `mp-git-committer`

Spawn `mp-git-committer` sub-agent with:

> push: true|false (per calling skill)
> commit_hint: $ARGUMENTS (user's description of what to commit, if any)

### Handle Result

Parse the agent's JSON output:

- **OK** → continue to the next phase, or display results if this is the final phase
- **SKIP** → report "Nothing to commit" (clean tree) or "Already up-to-date" (nothing to push)
- **FAIL** → escalate (below)

### Escalation (on FAIL only)

**Handle at main-agent level — do not delegate the fix to a sub-agent.** Read the error from the committer's output. Diagnose and fix the issue (e.g., pre-commit hook failure, staging error, push rejection). Once fixed, re-spawn `mp-git-committer` with the same parameters.

Up to 2 retry attempts. If still failing → report error to user and stop.

## Phase B: Find Linked Issue

**Fast-path:** First try `node $HOME/.claude/scripts/extract-branch-issue.js`. If it returns a number, verify with `gh issue view <N> --json title`. Only use agent fallback if no number extracted.

If agent fallback needed, spawn `mp-issue-finder` sub-agent with repo, branch name, commit messages, and diff summary.

**Based on result:**

- **High confidence match** → pass issue_number to Phase C
- **Candidates returned** → ask user which (if any) to link
- **No match** → proceed without issue_number

## Phase C: Create or Update PR via `mp-pr-manager`

Spawn `mp-pr-manager` sub-agent with:

> issue_number: (from Phase B, if found)
> base_branch: (from $ARGUMENTS if user specified, otherwise omit for auto-detection)
> draft: true (if `draft` in $ARGUMENTS)
> description_hint: $ARGUMENTS, or summary from the mp-git-committer result if Phase A ran

### Handle Result

- **OK** → display PR URL, number, whether created or updated, base branch
- **FAIL** → escalate exactly as in Phase A: diagnose (e.g., `gh auth` problem, remote not set), fix, re-spawn with the same parameters, up to 2 retries, then report error to user and stop

### PR Rules

PR title and body format governed by `agents/mp-pr-manager.md`. Git/PR conventions enforced by hooks (pre-commit-gate, dangerous-command-guard).

### Troubleshooting

| Problem                 | Solution                                                          |
| ----------------------- | ----------------------------------------------------------------- |
| "PR creation fails"     | Check `gh auth status`, verify remote exists with `git remote -v` |
| "No commits to push"    | Ensure working tree has staged/unstaged changes                   |
| "Base branch not found" | Specify base explicitly as a skill argument (e.g. `main`)         |
| "PR already exists"     | Existing PR is updated automatically — this is expected           |

## Commit Rules

> Git conventions validated by hooks (pre-commit-gate, dangerous-command-guard).

- Prefer new commits over --amend

### Format

`type(scope): description`

**Types:** feat, fix, refactor, chore, docs, style, test, perf, ci, build, revert

### Guidelines

- Focus on "why" over "what"
- Keep subject line under 72 characters
- Use imperative mood: "Add feature" not "Added feature"
