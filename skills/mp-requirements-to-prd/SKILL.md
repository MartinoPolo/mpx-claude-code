---
name: mp-requirements-to-prd
description: 'Create a PRD as a GitHub issue from REQUIREMENTS.md. Use when: "create PRD", "write PRD", "requirements to PRD"'
argument-hint: "[milestone name]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(gh *), AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.1"
  category: project-management
---

# Write PRD

Create a Product Requirements Document as a GitHub issue from REQUIREMENTS.md. $ARGUMENTS

## Workflow

### Step 1: Read Requirements

```bash
# From project root
```

Read `.mpx/REQUIREMENTS.md`. If missing, report error and stop.

### Step 2: Explore Codebase

Understand current project state:

- Read `package.json` for project name, dependencies, scripts
- Glob for key structural files (src/, lib/, etc.)
- Read existing README or docs for context
- Note existing patterns, frameworks, conventions

### Step 3: Design Modules

Sketch out the major modules needed for this feature:

- Identify the key modules/components the implementation requires
- Look for opportunities to extract deep modules (simple interface hiding extensive implementation)
- Confirm modules match user expectations and determine which modules need tests

```
Ask: "Here is the proposed module breakdown. Does this match your expectations? Which modules need tests?"
```

Incorporate feedback before proceeding to the draft.

### Step 4: Draft PRD

Build the PRD with these sections:

#### Overview

What this is and why it matters. Tie back to REQUIREMENTS.md.

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

Show the full PRD draft to the user:

```
Ask: "Here is the PRD draft. Approve, or describe edits?"
```

Incorporate any requested edits. Re-show if changes are substantial.

### Step 6: Create Label

Ensure the `prd` label exists:

```bash
gh label create prd --description "Product Requirements Document" --color 0052CC --force
```

### Step 7: Create Issue

```bash
gh issue create --title "PRD: [title from requirements]" --label "prd" --body "$(cat <<'EOF'
[PRD body from Step 4]
EOF
)"
```

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

- Always read REQUIREMENTS.md first — the PRD must trace back to requirements
- Show the PRD to the user before creating the issue
- Use `gh` CLI, not the GitHub MCP
- PRD body must be well-formatted GitHub markdown
- Never create the issue without user approval
