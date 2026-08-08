---
name: mp-epic-review
description: "End-of-epic review covering code quality, architecture, cleanup, documentation, and unresolved items; optionally executes the resulting fixes."
argument-hint: "<epic-number-or-URL>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Agent, AskUserQuestion, Bash(gh *), Bash(git diff *), Bash(git log *), Bash(git fetch *), Bash(node *)
metadata:
  author: MartinoPolo
  version: "1.8"
  category: project-management
---

# Epic Review

Comprehensive end-of-phase review for a completed epic. Runs 10 parallel analysis agents, synthesizes findings into a prioritized action list, and optionally executes fixes.

## Communication Style

Use compressed output throughout: drop articles, filler, pleasantries. Fragments OK. Use abbreviations and arrows (X → Y). Pattern: `[thing] [action] [reason]. [next step].`

**Exception:** PHASE_END document and user-facing summaries use normal professional prose.

## Usage

```
/mp-epic-review #42
/mp-epic-review https://github.com/owner/repo/issues/42
```

## Step 1: Gather Context

### 1a. Fetch Epic and Sub-Issues

```bash
gh issue view <number> --json number,title,body,comments,labels,state
```

Fetch all sub-issues:

```bash
gh issue list --search "parent:<number>" --state all --json number,title,body,comments,labels,state,closedAt --limit 100
```

Warn if any sub-issues are still open. Proceed anyway — the user triggered this manually for a reason.

### 1b. Fetch All Merged PRs

For each closed sub-issue, find its merged PR:

```bash
gh pr list --search "closes #<sub_issue_number>" --state merged --json number,title,body,comments,url --limit 5
```

Collect all PR bodies and comments.

### 1c. Compute Aggregate Diff

Find the merge-base before the first epic-related commit and diff against current HEAD:

```bash
git fetch origin main
git log --oneline --all --grep="refs #<first_sub_issue>" --grep="fixes #<first_sub_issue>" --grep="closes #<first_sub_issue>" --format="%H" | tail -1
```

Use the parent of the earliest epic commit as the base:

```bash
git diff <base>..HEAD --stat
git diff <base>..HEAD
```

If the diff exceeds context limits, fall back to `--stat` only and let agents read files directly.

### 1d. Build Context Slices

The orchestrator builds tailored context for each agent:

| Agent                 | Diff | Changed Files | PR/Issue Comments                   |
| --------------------- | ---- | ------------- | ----------------------------------- |
| spec-alignment        | Full | Yes           | Full — needs decision context       |
| code-quality          | Full | Yes           | Brief digest                        |
| best-practices        | Full | Yes           | Brief digest                        |
| security              | Full | Yes           | —                                   |
| performance           | Full | Yes           | —                                   |
| error-handling        | Full | Yes           | —                                   |
| architecture scanner  | —    | Yes           | Architectural decisions only        |
| dead code scanner     | Full | Yes           | —                                   |
| documentation scanner | —    | Yes           | Full — needs to know what was built |
| unresolved scanner    | —    | Yes           | Full — primary data source          |

Build a brief digest of PR/issue comments for agents that receive it: summarize key decisions, concerns raised, and deferred items in ~500 words.

## Step 2: Parallel Analysis (10 Sub-Agents)

Spawn all 10 agents in parallel. Each agent receives its tailored context slice from Step 1d.

### Agents 1-6: Existing Reviewer Agents

Spawn each as a sub-agent:

1. `mp-reviewer-code-quality` — DRY, dead code, SoC, naming, complexity
2. `mp-reviewer-best-practices` — language/framework conventions, type design
3. `mp-reviewer-spec-alignment` — requirements coverage, scope creep, test quality
4. `mp-reviewer-security` — injection, XSS, auth gaps (HIGH confidence only)
5. `mp-reviewer-performance` — N+1, re-renders, hot paths, memory leaks
6. `mp-reviewer-error-handling` — propagation, retry/timeout, race conditions

Prompt each with:

> Review the following epic-scope changes (aggregate of multiple PRs implementing Epic #N: "[title]").
> This is a epic-end review — look for cross-PR patterns, not just individual PR issues.
>
> [context slice per agent table above]

### Agent 7: Architecture Scanner (Standalone Agent)

Spawn `mp-scanner-architecture` sub-agent:

> Scan these files changed during Epic #N: "[title]".
> Focus on structural concerns introduced or worsened across the full epic scope.
>
> Changed files: [list with stats]
> Architectural decisions from discussions: [filtered comments]

The agent reads its own reference files (`deep-modules.md`, `interface-design.md`, `REFERENCE.md`).

### Agent 8: Dead Code / Cleanup Scanner (Inline)

Spawn `Explore` sub-agent (breadth: medium):

> Scan files changed during Epic #N for cleanup opportunities introduced across multiple PRs:
>
> - Unused exports, types, or functions added in one PR but never consumed
> - Stale imports left after refactoring across PRs
> - Duplicated logic across files that should be a shared utility
> - Redundant code where one PR's implementation superseded another's
> - Orphaned test helpers or fixtures no longer referenced
>
> Changed files: [list with stats]
> Diff: [full diff]
>
> Verify each finding: grep for usages before flagging as unused. Only report HIGH confidence.
>
> Output format per finding:
> `[Critical|Important|Minor] title — file:line`
> `What & Why` + `Suggested fix`

### Agent 9: Documentation Scanner (Inline)

Spawn `Explore` sub-agent (breadth: medium):

> Check if project documentation is stale relative to changes made in Epic #N: "[title]".
>
> For each file below, check only the ones that exist; treat missing files as out of scope.
>
> - `.mpx/CONTEXT.md` — are there new domain terms not in § Domain Language? Are features in § Core Features still marked as pending when implemented?
> - `.mpx/DECISIONS.md` — do structural changes warrant new decision entries?
> - `README.md` — are setup steps, features, or usage instructions outdated?
>
> Changed files: [list with stats]
> PR/issue context: [full comments — to understand what was built]
>
> Output format per finding:
> `[Important|Minor] title — file`
> `What needs updating` + `Specific content to add/change`

### Agent 10: Unresolved Items Scanner (Inline)

Spawn a `general-purpose` sub-agent with `model: "sonnet"`:

> Scan all PR bodies and comments + issue bodies and comments from Epic #N for deferred, unfinished, or incomplete work.
>
> Look for: "deferred", "TODO", "left for later", "unresolved", "out of scope", "follow-up", "nice to have", "future work", "skipped", "punted", "not implemented yet", "known issue", "hack", "workaround", "temporary".
>
> For each candidate found:
>
> 1. Read the relevant source files to check if it was actually implemented in a later PR within the epic
> 2. Search open GitHub issues to check if it's already tracked:
>    ```bash
>    gh issue list --state open --search "<keywords>" --json number,title --limit 5
>    ```
> 3. Classify:
>    - **Complete** — verified implemented in code → omit from findings
>    - **Tracked** — open issue exists → report with issue link, no action needed
>    - **Needs AFK issue** — clear scope, ready to implement → report with suggested issue title
>    - **Needs HITL issue** — uncertain scope, needs human decision → report with open questions
>
> PR bodies and comments: [full content]
> Issue bodies and comments: [full content]
> Changed files: [list for code verification]
>
> Output format per finding:
> `[Critical|Important|Minor] title`
> `Source: PR #N comment by @user` or `Issue #N body`
> `Status: Complete|Tracked (#N)|Needs AFK issue|Needs HITL issue`
> `Details` + [for HITL: `Open questions`]

## Step 3: Synthesis

Collect all 10 agents' findings. Merge into a unified action list:

### 3a. Deduplicate

Multiple agents may flag the same issue (e.g., code-quality and dead-code scanner both finding unused code). Merge duplicates, keeping the most specific description.

### 3b. Classify and Categorize

**Severity:** Critical → Important → Minor

- **Critical** — must fix before the epic is considered done (security vulnerabilities, broken functionality, spec violations)
- **Important** — should fix (DRY violations, architectural concerns, missing docs)
- **Minor** — nice to have (naming improvements, minor refactors)

**Categories:**

1. **Code Quality** — from reviewers 1-3 (DRY, naming, spec alignment, best practices)
2. **Architecture** — from agent 7 (structural concerns, coupling, shallow modules)
3. **Decomposition** — large file candidates from agent 7 (subset of architecture)
4. **Cleanup** — from agent 8 (dead code, unused exports, duplication)
5. **Documentation** — from agent 9 (stale docs needing updates)
6. **Unresolved Items** — from agent 10 (deferred work from PR/issue comments)

### 3c. Write PHASE_END Document

Write to `.mpx/reviews/PHASE_END_EPIC_<N>.md`:

```markdown
# Epic Review: Epic #<N> — [Title]

Generated: [date] | Sub-issues: #1, #2, #3 | PRs: #4, #5, #6

## Summary

[2-3 sentences on overall epic health, total findings count by severity]

## Critical

### [Category] — [Title]

- [ ] **File:** path/to/file.ts:42
- **Finding:** [what's wrong]
- **Action:** [what to do]

## Important

### [Category] — [Title]

- [ ] **File:** path/to/file.ts:99
- **Finding:** [what's wrong]
- **Action:** [what to do]

## Minor

### [Category] — [Title]

- [ ] **File:** path/to/file.ts:10
- **Finding:** [what's wrong]
- **Action:** [what to do]

## Unresolved Items

### Needs AFK Issue

- [ ] [Title] — [details, suggested issue title]

### Needs HITL Issue

- [ ] [Title] — [details, open questions]

### Already Tracked

- #N — [title] (no action needed)

## Documentation Updates

- [ ] [file] — [specific update needed]

## Architecture Promotion Candidates

- [Title] — [brief description, recommended for `/mp-architecture-review`]
```

Each item's checkbox (`- [ ]`) is the execution tracking mechanism.

## Step 4: HITL Gate

Present the synthesized action list to the user:

> Epic #N review complete. Found X critical, Y important, Z minor items across 6 categories.
>
> [Show the PHASE_END document content]
>
> Review the findings. You can:
>
> - Confirm all items → proceed to execution
> - Drop specific items → "drop items 3, 7"
> - Edit items → "change item 5 to [X]"
> - Defer everything → document is saved at `.mpx/reviews/PHASE_END_EPIC_N.md`

Wait for user response before proceeding.

## Step 5: Execution

Count actionable items (excluding "Already Tracked" and dropped items).

### If ≤ 20 items and user confirms execution:

Execute using `mp-executor` sub-agents. The orchestrator:

1. Analyzes each item and determines the concrete fix (exact file, line, change)
2. Groups items by parallelizability:
   - **Parallel group**: items touching different files or independent code paths
   - **Sequential group**: items where one fix affects another (e.g., extracting a shared utility before deduplicating callers)
3. Spawns `mp-executor` sub-agents with pre-analyzed fix instructions for each parallel group
4. After each group completes, update PHASE_END.md checkboxes (`- [x]`)
5. For unresolved items needing issues:

```bash
gh issue create --title "[title]" --label "task,AFK" --body "[body]"
```

or for HITL items:

```bash
gh issue create --title "[title]" --label "task,HITL" --body "[body with open questions]"
```

Link new issues as sub-issues of the epic using GraphQL `addSubIssue`.

6. After all fixes: run static checks and tests to verify nothing broke

```bash
bash $HOME/.claude/scripts/detect-check-scripts.sh
```

Run all detected CHECK and TEST commands via `mp-checker`.

### If > 20 items or user defers:

Document is saved. User can return in a new session, read `.mpx/reviews/PHASE_END_EPIC_N.md`, and execute items manually or via `/mp-execute` for individual issues created from unresolved items.

## Step 6: Close-out

After all items are resolved (or explicitly deferred):

1. Update PHASE_END.md with final status
2. Check if all sub-issues of the epic are closed:

```bash
gh issue list --search "parent:<epic_number>" --state open --json number,title --limit 100
```

3. If all closed and all critical/important items resolved:

> All items resolved. Close Epic #N: "[title]"?

Wait for user confirmation before closing:

```bash
gh issue close <epic_number> --reason completed
```
