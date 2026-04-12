---
name: mp-prd-to-issues
description: 'Break a PRD GitHub issue into vertical-slice sub-issues with blocking relationships. Use when: "break down PRD", "create sub-issues", "PRD to issues"'
argument-hint: <PRD issue URL or number>
allowed-tools: Read, Glob, Grep, Bash(gh *), AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.2"
  category: project-management
---

# PRD to Vertical-Slice Sub-Issues

Break a PRD GitHub issue into independently implementable vertical slices. $ARGUMENTS

## Rules

- Always fetch and read the PRD issue first
- Vertical slices, not horizontal layers — each issue cuts through all relevant layers (UI, API, DB)
- Each issue must have acceptance criteria
- Assign sub-issues to the same milestone as the PRD issue
- Show full breakdown to user before creating any issues
- Use `gh` CLI for all GitHub operations
- Label every sub-issue with `task` and either `HITL` or `AFK` (create labels if they don't exist)
- Link every sub-issue as a native GitHub sub-issue of the PRD using the `addSubIssue` GraphQL mutation

## Workflow

### Step 1: Fetch the PRD Issue

```bash
gh issue view <number> --json title,body,milestone,labels
```

Parse the PRD title, body, milestone name, and labels. If the issue doesn't exist or has no body, stop and report.

Also fetch the PRD issue's node ID for later use in the `addSubIssue` mutation:

```bash
gh api graphql -f query='{ repository(owner: "OWNER", name: "REPO") { issue(number: <number>) { id } } }' --jq '.data.repository.issue.id'
```

Get owner/repo from `gh repo view --json nameWithOwner --jq '.nameWithOwner'`.

### Step 2: Explore the Codebase

Understand integration layers and existing code relevant to the PRD:

- Use Glob/Grep to find files related to the PRD's domain
- Identify existing patterns, services, components, and data models
- Note architectural boundaries that inform slice design

### Step 3: Design Vertical Slices

Break the PRD into **vertical slices** using the tracer-bullet concept:

- Each slice flushes out unknown unknowns quickly by cutting through all layers
- Target **3-15 sub-issues** depending on PRD complexity
- Order slices so the first one proves the riskiest assumptions
- Each slice must be independently implementable and testable
- Prefer thin end-to-end slices over thick single-layer chunks

For each sub-issue, define:

1. **Title** — short, descriptive, action-oriented
2. **Description** — what needs to be done and why
3. **Acceptance criteria** — testable conditions (checkbox list)
4. **Blocking relationships** — which issues must complete first
5. **Labels** — `task` plus feature-area labels (e.g., `area:api`, `area:ui`, `area:db`)

### Step 3b: Classify Slices — HITL vs AFK

Classify each slice as one of:

- **HITL** (Human In The Loop) — requires human interaction during implementation: architectural decisions, design reviews, API contract approvals, UX decisions, ambiguous requirements needing clarification
- **AFK** (Away From Keyboard) — can be implemented and merged autonomously without human interaction: well-defined scope, clear acceptance criteria, no open design questions

Default to HITL when uncertain. A slice is AFK only when the path forward is unambiguous.

### Step 4: Present Breakdown for Approval

Show the user:

- Numbered list of all sub-issues: **Title**, **Type** [HITL or AFK], **Blocked by**, **User stories covered**
- Dependency graph (which issues block which)
- Milestone assignment
- Labels per issue

Ask for explicit approval before creating anything. Accept feedback and revise if needed.

### Step 5: Ensure Labels Exist

```bash
gh label list --limit 100
```

Check that `task`, `HITL`, `AFK`, and any area labels exist. Create missing ones:

```bash
gh label create "task" --description "Implementation task" --color "0E8A16" --force
gh label create "HITL" --description "Requires human interaction" --color "FBCA04" --force
gh label create "AFK" --description "Can be implemented autonomously" --color "0E8A16" --force
gh label create "area:api" --description "API layer" --color "1D76DB" --force
```

### Step 6: Create Sub-Issues and Link to PRD

Create each sub-issue via `gh issue create`, then link it as a native sub-issue of the PRD using GraphQL.

```bash
# 1. Create the issue
ISSUE_URL=$(gh issue create --title "Short descriptive title" --label "task,HITL,area:api" --milestone "Milestone Name" --body "$(cat <<'EOF'
**Type:** HITL | AFK

## Description

[What and why]

## Acceptance Criteria

- [ ] [Testable condition 1]
- [ ] [Testable condition 2]

## Blocking Relationships

- Blocked by #N (if applicable)
- Blocks #M (if applicable)

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

Use `HITL` or `AFK` label (not both) based on the slice classification from Step 3b.

Capture each created issue number from the output.

### Step 7: Update Blocking References

After all issues are created (and numbers are known), update issue bodies with correct blocking cross-references if forward references were needed.

### Step 8: Report Results

Display:

- All created issue URLs with titles
- Dependency graph showing blocking order
- Milestone assigned
- Total sub-issues created

## Output

```
PRD: #<number> — <title>
Milestone: <name>
Sub-issues created: <count>

Dependency Graph:
  #A — Title A [HITL]
    -> #B — Title B [AFK] (blocked by #A)
    -> #C — Title C [AFK] (blocked by #A)
  #B — Title B [AFK]
    -> #D — Title D [HITL] (blocked by #B)

Issues:
  - <url> — <title> [HITL]
  - <url> — <title> [AFK]
  ...
```
