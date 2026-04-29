---
name: mp-prd-to-issues
description: 'Break a PRD GitHub issue into vertical-slice sub-issues with blocking relationships. Use when: "break down PRD", "create sub-issues", "PRD to issues"'
argument-hint: <PRD issue URL or number>
allowed-tools: Read, Glob, Grep, Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.6"
  category: project-management
---

# PRD to Vertical-Slice Sub-Issues

Break a PRD GitHub issue into independently implementable vertical slices. $ARGUMENTS

Issue body format: @skills/shared/GITHUB_ISSUE_TEMPLATE.md

## Rules

- Fetch and read the PRD issue AND its comments before anything else
- Resolve all ambiguities before decomposition — ask the user, don't guess
- Vertical slices, not horizontal layers — each issue cuts through all relevant layers
- Each issue must have acceptance criteria and map to PRD requirements
- Show full breakdown to user before creating any issues
- Use `gh` CLI for all GitHub operations
- Label every sub-issue with `task` and either `HITL` or `AFK` (create labels if missing)
- HITL/AFK classification lives on the label only — never in the issue body
- Link every sub-issue as a native GitHub sub-issue of the PRD using the `addSubIssue` GraphQL mutation

## Workflow

### Step 1: Fetch the PRD Issue and Comments

```bash
gh issue view <number> --json title,body,labels
```

If the issue doesn't exist or has no body, stop and report.

Fetch all comments (these often contain clarifications, updates, or revised decisions that override the original body):

```bash
gh issue view <number> --json comments --jq '.comments[].body'
```

Fetch the PRD issue's node ID for later use in the `addSubIssue` mutation:

```bash
gh api graphql -f query='{ repository(owner: "OWNER", name: "REPO") { issue(number: <number>) { id } } }' --jq '.data.repository.issue.id'
```

Get owner/repo from `gh repo view --json nameWithOwner --jq '.nameWithOwner'`.

### Step 2: Clarify Ambiguities

Before any decomposition, review the PRD body and comments for ambiguous or contradictory requirements, missing details, unresolved decisions, and open questions or TBDs.

**If there are no unresolved questions:** skip to Step 3 — most or all sub-issues will be AFK.

**If there are unresolved questions:** grill the user before proceeding:

- Batch related questions into thematic groups. Present each group in one round.
- Only split into a follow-up round when answers to earlier questions would materially change later ones.
- Provide a recommended answer with each question.
- If a question can be answered by exploring the codebase, explore instead of asking.
- Do not proceed to Step 3 until every question is answered.

**Exception — question-heavy sub-issue:** if a large cluster of questions applies to one specific slice (not the PRD overall), defer those questions by creating that sub-issue as HITL with the unanswered questions listed in its blockquote.

### Step 3: Explore the Codebase

Use Glob/Grep to find files related to the PRD's domain. Identify existing patterns, services, components, data models, and architectural boundaries that inform slice design.

### Step 4: Design Vertical Slices

Break the PRD into **vertical slices** using the tracer-bullet concept:

- Target **3-15 sub-issues** depending on PRD complexity
- Order slices so the first one proves the riskiest assumptions
- Each slice must be independently implementable and testable
- Prefer thin end-to-end slices over thick single-layer chunks

For each sub-issue, define:

1. **Title** — short, descriptive, action-oriented. Plain English only — no PRD number, no conventional commit prefixes (`feat():`, `fix:`, `chore():`)
2. **Description** — what and why
3. **Requirements** — mapped from PRD body and comments (imperative statements)
4. **Acceptance criteria** — testable conditions (checkbox list)
5. **Blocking relationships** — which issues must complete first
6. **Labels** — `task` plus area labels (e.g., `area:api`, `area:ui`, `area:db`)

### Step 4b: Classify Slices — HITL vs AFK

- **HITL** — has unanswered questions or uncertain decisions that require asking the user. Examples: unclear API contract, ambiguous business rule, multiple valid approaches needing a decision. HITL issues get a blockquote listing the specific unanswered questions.
- **AFK** — well-defined scope, clear acceptance criteria, no open design questions.

HITL is exclusively for situations resolved by asking the user. Visual inspection, manual testing, code review, and QA verification are NOT reasons for HITL.

When all questions were resolved in Step 2, most or all slices should be AFK.

### Step 5: Present Breakdown for Approval

Show the user:

- Numbered list of all sub-issues: **Title**, **HITL/AFK**, **Blocked by**, **PRD requirements covered**
- Dependency graph (which issues block which)
- Labels per issue

Ask for explicit approval before creating anything. Accept feedback and revise.

### Step 6: Ensure Labels Exist

```bash
gh label list --limit 100
```

Create missing labels (`task`, `HITL`, `AFK`, area labels):

```bash
gh label create "task" --description "Implementation task" --color "0E8A16" --force
gh label create "HITL" --description "Requires human interaction" --color "FBCA04" --force
gh label create "AFK" --description "Can be implemented autonomously" --color "0E8A16" --force
```

### Step 7: Create Sub-Issues and Link to PRD

Create each sub-issue via `gh issue create`, then link as a native sub-issue using GraphQL.

```bash
# 1. Create the issue (HITL example — include blockquote with specific questions; omit for AFK)
ISSUE_URL=$(gh issue create --title "Short descriptive title" --label "task,HITL,area:api" --assignee @me --body "$(cat <<'EOF'
> **Unanswered questions:**
> - Should the API use cursor-based or offset pagination?
> - What's the rate limit for external callers?

## Description

[What and why]

## Requirements

- REQ-1: [Imperative statement mapped from PRD]

## Acceptance Criteria

- [ ] [Testable condition — maps to requirements above]

## Blocking Relationships

- Blocks #M (reason)
- Blocked by #N (reason)

## Notes

[Implementation hints, relevant files, constraints]
EOF
)")

# 2. Link as native sub-issue of the PRD
gh api graphql -f query="
  mutation {
    addSubIssue(input: {
      issueId: \"<PRD_NODE_ID>\",
      subIssueUrl: \"$ISSUE_URL\"
    }) {
      issue { number }
      subIssue { number }
    }
  }
"
```

Use `HITL` or `AFK` label (not both) based on Step 4b classification. After all issues are created, update issue bodies with correct blocking cross-references if forward references were needed.

### Step 8: Report Results

```
PRD: #<number> — <title>
Sub-issues created: <count>

Dependency Graph:
  #A — Title A [HITL]
    -> #B — Title B [AFK] (blocked by #A)
    -> #C — Title C [AFK] (blocked by #A)

Issues:
  - <url> — <title> [HITL]
  - <url> — <title> [AFK]
```
