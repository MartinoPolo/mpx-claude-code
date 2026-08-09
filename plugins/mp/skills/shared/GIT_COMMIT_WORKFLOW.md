# Git Commit Workflow

Single source of truth for commit conventions across the `mp` plugin. The **Commit Conventions** section below is authoritative for how commits are staged and worded — the inline `/mp:commit` skill and the `mp-git-committer` agent both follow it verbatim and neither restates its rules.

The **Phases** section defines the delegation flow that the compound skills (`/mp:commit-push`, `/mp:commit-push-pr`, `/mp:pr`) orchestrate; each of those states which phases it runs and its parameter deltas. `/mp:commit` runs the Commit Conventions inline in the main agent (no delegation).

## Phase A: Commit (and Optional Push) via `mp-git-committer`

The agent stages and words the commit per the **Commit Conventions** section below. Spawn `mp-git-committer` sub-agent with:

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

**Fast-path:** First try `node ${CLAUDE_PLUGIN_ROOT}/scripts/extract-branch-issue.js`. If it returns a number, verify with `gh issue view <N> --json title`. Only use agent fallback if no number extracted.

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

PR title and body format governed by the mp-gh plugin's `mp-pr-manager` agent. Git/PR conventions enforced by hooks (pre-commit-gate, dangerous-command-guard).

### Troubleshooting

| Problem                 | Solution                                                          |
| ----------------------- | ----------------------------------------------------------------- |
| "PR creation fails"     | Check `gh auth status`, verify remote exists with `git remote -v` |
| "No commits to push"    | Ensure working tree has staged/unstaged changes                   |
| "Base branch not found" | Specify base explicitly as a skill argument (e.g. `main`)         |
| "PR already exists"     | Existing PR is updated automatically — this is expected           |

## Commit Conventions

Authoritative spec for staging and wording a commit. Both consumers follow this section as-is; conventions are also validated by hooks (pre-commit-gate, dangerous-command-guard).

### Procedure

1. **Inspect** — `git status --short` and `git diff` (staged + unstaged). Understand what actually changed before wording anything. Clean tree → nothing to commit; report and stop.
2. **Stage one logical change** — `git add <explicit paths>` for the files that belong to the work under way. Split unrelated changes into separate commits. Staging is bounded by **Safety** below.
3. **Pick the type from the diff**, not from the branch name. Lowercase, one of the authoritative type list (see **Type source of truth**).
4. **Compose the message in a temp file**, then `git commit -F <tempfile>`. Composing to a file avoids the multi-line shell-quoting fragility of inline `-m`. Use the format below.
5. **Verify & report** — commit hash, subject line, and files-changed summary (`git show --stat --oneline HEAD`).

### Type source of truth

When `commitlint.config.js` exists in the repo, its `type-enum` is the authoritative list of allowed types — the `commit-msg` hook prints it when it rejects a message. Otherwise use the conventional default list: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.

### Message format

```
<type>[(scope)][!]: <imperative subject>

<body>

Claude-Session: <session url>
```

- **Subject** — conventional commit. Optional `(scope)` when one area is clearly the subject (`feat(button):`, `fix(icons):`). A `!` before the colon marks a breaking change (`feat!:`, `feat(api)!:`). Imperative mood ("Add feature", not "Added feature"), keep under ~72 characters.
- **Body** — explain **why**, not what: the motivation or the problem it solves. Bullets when several distinct changes share the commit. Wrap ~72 cols, keep concise (≈10 lines). **Omit the body entirely** when the subject already says everything.
- **`Claude-Session:` trailer** — append the session URL on AI-assisted commits (this repo's session-trailer convention). Keep other people's names and Gerrit-era trailers (`Topic:`, `Reviewed-by:`) out.
- **Ticket reference** — tracker-neutral and parameter-driven. When a GitHub-coupled flow passes an `issue_ref` (e.g. `refs #42`, `fixes #42`), append it to the subject; when no `issue_ref` is passed it is simply absent. Never hardcode a tracker or invent a reference.

### Safety

Stricter rules that always win over any looser convention:

- **Stage explicit paths only** — never `git add -A` or `git add .`.
- **Never stage secrets** — `.env*`, `credentials.*`, `*secret*`, `*.key`, `*.pem`.
- **No destructive git in this flow** — prefer a new commit over `--amend` (only amend when the user asks), and never `reset --hard`, rewrite history, or `--force` / force-push.
