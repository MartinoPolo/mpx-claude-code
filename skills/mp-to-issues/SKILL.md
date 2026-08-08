---
name: mp-to-issues
description: "Breaks an epic issue into vertical-slice sub-issues with blocking relationships."
argument-hint: <epic issue URL or number>
disable-model-invocation: true
allowed-tools: Read, Agent, Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.12"
  category: project-management
---

# Epic to Vertical-Slice Sub-Issues

Break an epic GitHub issue into independently implementable vertical slices. $ARGUMENTS

## Rules

- Fetch and read the epic issue AND its comments before anything else
- Resolve all ambiguities before decomposition by asking the user
- Vertical slices, not horizontal layers — each issue cuts through all relevant layers
- Each issue must have acceptance criteria and map to epic requirements
- Show full breakdown to user before creating any issues
- Use `gh` CLI for all GitHub operations
- Label every sub-issue with `task` and either `HITL` or `AFK` (create labels if missing)
- HITL/AFK classification lives on the label only
- Link every sub-issue as a native GitHub sub-issue of the epic using the `addSubIssue` GraphQL mutation

## Workflow

### Step 0: Load Template

Read `${CLAUDE_SKILL_DIR}/../shared/GITHUB_ISSUE_TEMPLATE.md` now. It defines the issue body format, section rules, HITL/AFK classification, labels, label creation commands, and epic sub-issue linking used below.

### Step 1: Fetch the Epic Issue and Comments

```bash
gh issue view <number> --json title,body,labels
```

If the issue doesn't exist or has no body, stop and report.

Fetch all comments (these often contain clarifications, updates, or revised decisions that override the original body):

```bash
gh issue view <number> --json comments --jq '.comments[].body'
```

Fetch owner/repo and the epic issue's node ID using the template's "Linking as Epic Sub-Issue" commands — needed later for the `addSubIssue` mutation.

### Step 2: Clarify Ambiguities

Before any decomposition, review the epic body and comments for ambiguous or contradictory requirements, missing details, unresolved decisions, and open questions or TBDs.

**If there are no unresolved questions:** skip to Step 3 — most or all sub-issues will be AFK.

**If there are unresolved questions:** grill the user before proceeding:

- Batch related questions into thematic groups. Present each group in one round.
- Only split into a follow-up round when answers to earlier questions would materially change later ones.
- Provide a recommended answer with each question.
- If a question can be answered by exploring the codebase, explore instead of asking.
- Proceed to Step 3 only after every question is answered.

**Exception — question-heavy sub-issue:** if a large cluster of questions applies to one specific slice (not the epic overall), defer those questions by creating that sub-issue as HITL with the unanswered questions listed in its blockquote.

### Step 3: Explore the Codebase

Spawn `Explore` (medium breadth, see [EXPLORATION.md](../shared/EXPLORATION.md)) to find files related to the epic's domain — existing patterns, services, components, data models, architectural boundaries that inform slice design.

### Step 4: Design Vertical Slices

Break the epic into **vertical slices** using the tracer-bullet concept:

- Target **3-15 sub-issues** depending on epic complexity
- Order slices so the first one proves the riskiest assumptions
- Each slice must be independently implementable and testable
- Prefer thin end-to-end slices over thick single-layer chunks

For each sub-issue, define per the template: title (plain English — no epic number, no conventional commit prefixes like `feat():`), description, requirements mapped from epic body and comments, acceptance criteria, blocking relationships, and labels.

### Step 4b: Classify Slices — HITL vs AFK

Classify each slice per the template's "HITL vs AFK Classification" rules. HITL issues get a blockquote listing the specific unanswered questions. When all questions were resolved in Step 2, most or all slices should be AFK.

### Step 5: Present Breakdown for Approval

Show the user:

- Numbered list of all sub-issues: **Title**, **HITL/AFK**, **Blocked by**, **epic requirements covered**
- Dependency graph (which issues block which)
- Labels per issue

Ask for explicit approval before creating anything. Accept feedback and revise.

### Step 6: Ensure Labels Exist

Run the template's "Label Creation Commands". Apply `design needed` per the template's label rules.

### Step 7: Create Sub-Issues and Link to Epic

For each approved sub-issue:

1. Create it with the template's "Creation Command", using the template body format (HITL issues include the unanswered-questions blockquote; AFK issues omit it). Use `HITL` or `AFK` label (not both) based on Step 4b.
2. Link it as a native sub-issue of the epic using the template's "Linking as Epic Sub-Issue" mutation.

After all issues are created, update issue bodies with correct blocking cross-references if forward references were needed.

### Step 8: Report Results

```
Epic: #<number> — <title>
Sub-issues created: <count>

Dependency Graph:
  #A — Title A [HITL]
    -> #B — Title B [AFK] (blocked by #A)
    -> #C — Title C [AFK] (blocked by #A)

Issues:
  - <url> — <title> [HITL]
  - <url> — <title> [AFK]
```
