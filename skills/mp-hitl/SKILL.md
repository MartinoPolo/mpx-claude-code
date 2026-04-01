---
name: mp-hitl
description: 'Resolve HITL issues into AFK-ready by grilling human decisions. Use when: "resolve HITL", "make issues AFK", "grill HITL issues", "prep for overnight run"'
argument-hint: "[PRD issue URL or number]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(gh *), Agent
metadata:
  author: MartinoPolo
  version: "0.1"
  category: project-management
---

# HITL to AFK — Resolve Human Decisions

Grill the user on open decisions in HITL-labeled GitHub issues, then flip resolved issues to AFK for autonomous execution. $ARGUMENTS

## Workflow

### Step 1: Identify PRD and Repo

If a PRD issue URL or number is provided, use it directly. Otherwise auto-detect:

```bash
gh repo view --json nameWithOwner --jq '.nameWithOwner'
gh issue list --label "prd" --state open --json number,title
```

If multiple open PRDs found, show them and ask which one. If zero, report and exit.

Fetch the PRD body — it provides shared context (especially `## Implementation Decisions`):

```bash
gh issue view <PRD_NUMBER> --json title,body
```

### Step 2: Fetch All Sub-Issues and Build Dependency Graph

```bash
gh issue list --label "task" --state open --json number,title,labels,body
```

For each issue, parse the `## Blocking Relationships` section to extract `Blocked by #N` references. Build a dependency graph.

### Step 3: Find Unblocked HITL Issues

An HITL issue is **unblocked** when all its blockers are either:
- Closed (implemented)
- Labeled `AFK` (will be resolved autonomously)

Filter to only HITL-labeled issues that meet this criteria. If zero found:
- "No HITL issues found" → exit
- "All HITL resolved" → exit
- "N HITL issues exist but all blocked by other HITL issues" → show which ones and their blockers, exit

### Step 4: Prioritize by Blocking Impact

Sort unblocked HITL issues by **transitive unblock count** — how many downstream issues (direct + indirect) each one unblocks. Process the highest-impact issue first.

Present the queue to the user:

```
HITL issues to resolve (ordered by blocking impact):
1. #3 — Dashboard + issue CRUD (unblocks 6 downstream)
2. #6 — Session spawning (unblocks 4 downstream)
```

### Step 5: Grill Each Issue

For each HITL issue, in priority order:

#### 5a: Extract Decision Points

1. Read the issue body — focus on `## Notes` for the HITL reason, `## Acceptance Criteria` for ambiguity, `## Description` for open questions
2. Cross-reference against the PRD's `## Implementation Decisions` section — remove anything already decided
3. Spawn an `Explore` agent to scan the codebase for files relevant to this issue (components, patterns, configs mentioned in the issue). Use findings to pre-answer questions where possible

#### 5b: Grill One Question at a Time

For each unresolved decision point:
- Ask ONE question
- Provide a recommended answer backed by codebase evidence or PRD context
- Wait for user response
- Move to next decision

Follow the `mp-grill-me` pattern: if a question can be answered by exploring the codebase, explore instead of asking.

#### 5c: Record Outcome

**If all decisions resolved:** Append a `## Resolved Decisions` section to the issue body:

```markdown
## Resolved Decisions

- **Decision name**: Resolution with implementation context.
- **Another decision**: Resolution with implementation context.
```

Then flip labels:

```bash
gh issue edit <NUMBER> --remove-label "HITL" --add-label "AFK"
```

**If some decisions require implementation to answer:** Append both sections, keep HITL label:

```markdown
## Resolved Decisions

- **Decision name**: Resolution with implementation context.

## Unresolved — Needs Implementation

- **Decision name**: Why it needs experimentation first.
```

#### 5d: Continue or Stop

After completing an issue, ask: "Continue to the next HITL issue?"

If yes, proceed. If no, skip to Step 6.

#### 5e: Re-check for Newly Unblocked HITL Issues

After flipping issues to AFK, re-evaluate the dependency graph. Issues that were blocked solely by the just-resolved HITL issues are now unblocked. Add them to the queue and continue grilling.

### Step 6: Session Summary

```
HITL Resolution Summary
========================
Resolved (flipped to AFK):
  - #3 — Dashboard + issue CRUD
  - #6 — Session spawning

Partially resolved (still HITL):
  - #7 — Embedded terminal (2 decisions unresolved)

Still blocked (not grilled):
  - #9 — Rich chat view (blocked by #6 HITL)

Newly unblocked AFK issues (ready for execution):
  - #4 — Git CLI integration (was blocked by #3)
  - #10 — Worktree lifecycle (was blocked by #3)
```
