---
name: to-epic
description: "Creates an epic (parent GitHub issue) from the requirements passed in; the epic's description is a spec written as user stories."
argument-hint: "[milestone name]"
disable-model-invocation: true
allowed-tools: Read, Agent, Bash(gh *), AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.9"
  category: project-management
---

# Write Epic

Create an epic as a GitHub issue from passed requirements. The epic's description is a **spec** — user stories, scope, acceptance criteria, and decisions. $ARGUMENTS

## Workflow

### Step 1: Read Requirements

Read `.mpx/CONTEXT.md` and `.mpx/DECISIONS.md` (if it exists). If CONTEXT.md is missing, report error and stop.

### Step 2: Explore Codebase

Spawn `Explore` (medium breadth, see [EXPLORATION.md](${CLAUDE_PLUGIN_ROOT}/../mp/skills/shared/EXPLORATION.md)) to understand current project state:

- Project name, dependencies, scripts (package.json)
- Key structural files (src/, lib/, etc.)
- Existing README/docs context
- Existing patterns, frameworks, conventions

### Step 3: Design Modules

Sketch out the major modules needed for this feature:

- Identify the key modules/components the implementation requires
- Look for opportunities to extract deep modules (simple interface hiding extensive implementation)
- Confirm modules match user expectations and determine which modules need tests

```
Ask: "Here is the proposed module breakdown. Does this match your expectations? Which modules need tests?"
```

Incorporate feedback before proceeding to the draft.

### Step 4: Draft the Spec

Build the epic's spec with these sections:

#### Overview

What this is and why it matters. Tie back to CONTEXT.md.

#### User Stories

For each requirement, write:

> As a [user], I want [action], so that [benefit]

#### Scope

- **Included**: features and deliverables explicitly in requirements
- **Excluded**: what is intentionally out of scope

#### Acceptance Criteria

Measurable, testable criteria for each user story. Use checkbox format:

- [ ] Criterion 1
- [ ] Criterion 2

#### Technical Notes

- Architecture constraints
- Dependencies and version requirements
- Known risks or open questions

#### Implementation Decisions

- Modules, interfaces, architectural decisions
- Schema changes, API contracts
- Specific interactions between components
- NO file paths or code snippets

#### Testing Decisions

- What makes good tests for this feature
- Which modules need tests (from Step 3)
- Prior art in the existing test suite
- Test boundaries

### Step 5: Get Approval

Show the full spec draft to the user:

```
Ask: "Here is the spec draft. Approve, or describe edits?"
```

Incorporate any requested edits. Re-show if changes are substantial.

### Step 6: Create Label

Ensure the `epic` label exists:

```bash
gh label create epic --description "Epic — parent issue" --color 0052CC --force
```

### Step 7: Create Issue

```bash
gh issue create --title "[title from requirements]" --label "epic" --body "$(cat <<'EOF'
[epic spec body from Step 4]
EOF
)"
```

GitHub assigns the issue number automatically. This number becomes the epic identifier (e.g., Epic #42).

### Step 8: Assign Milestone

If `$ARGUMENTS` contains a milestone name:

```bash
gh issue edit <number> --milestone "<milestone name>"
```

Skip if no milestone provided.

### Step 9: Report

Display:

- Issue URL
- Issue number
- Title
- Milestone (if assigned)

## Rules

- Always read CONTEXT.md first — the epic's spec must use project domain language and respect constraints
- Check DECISIONS.md for settled decisions that constrain the design
- Show the spec to the user before creating the issue
- Use `gh` CLI for all GitHub operations
- The spec body must be well-formatted GitHub markdown
- Never create the issue without user approval
