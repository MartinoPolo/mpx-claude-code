---
name: epic-review
description: "End-of-epic review covering code quality, architecture, cleanup, documentation, and unresolved items; optionally executes the resulting fixes."
argument-hint: "<epic-number-or-URL>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Agent, AskUserQuestion, Bash(gh *), Bash(git diff *), Bash(git log *), Bash(git fetch *), Bash(node *)
metadata:
  author: MartinoPolo
  version: "1.9"
  category: project-management
---

# Epic Review

Comprehensive end-of-phase review for a completed epic. Runs 10 parallel analysis agents, synthesizes findings into a prioritized action list, and optionally executes fixes.

## Communication Style

Use compressed output throughout: drop articles, filler, pleasantries. Fragments OK. Use abbreviations and arrows (X → Y). Pattern: `[thing] [action] [reason]. [next step].`

**Exception:** PHASE_END document and user-facing summaries use normal professional prose.

## Usage

```
/mp-gh:epic-review #42
/mp-gh:epic-review https://github.com/owner/repo/issues/42
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

### Agents 7–10: Specialized branches

Read and dispatch every branch in [ANALYSIS_BRANCHES.md](ANALYSIS_BRANCHES.md): architecture, cleanup, documentation, and unresolved-items scanning.

**Gate:** Continue only when all 10 agents have returned a result in their required format.

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

Write `.mpx/reviews/PHASE_END_EPIC_<N>.md` from [PHASE_END_TEMPLATE.md](PHASE_END_TEMPLATE.md). Use each item's checkbox (`- [ ]`) as the execution tracking mechanism.

**Gate:** Continue only when every finding appears exactly once, severity totals match the summary, unresolved items have a disposition, and every actionable item has a checkbox.

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

## Step 5: Execute and close out

After the user responds at the HITL gate, read and follow [EXECUTION.md](EXECUTION.md) for the confirmed/deferred branch and epic close-out.

**Gate:** Continue only when every accepted finding is checked off or explicitly deferred and the epic state is reported.
