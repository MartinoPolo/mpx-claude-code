---
name: mp-issue-create
description: 'Create GitHub issues with optional PRD linking. Use when: "create issue", "open issue", "new feature issue", "add issue to PRD"'
argument-hint: '<description> [--prd <number>]'
allowed-tools: Bash(gh issue create *), Bash(gh label *), Bash(gh issue view *), Bash(gh issue list *), Bash(gh repo view *), Bash(gh api *), Bash(git log *), Bash(git diff *), Read, Glob, Grep, Agent, Bash(git *), Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.2"
  category: utility
---

# Create GitHub Issue

Create a well-structured GitHub issue using the canonical template. Optionally link to a PRD as a sub-issue. $ARGUMENTS

Issue body format: @skills/shared/GITHUB_ISSUE_TEMPLATE.md

## Workflow

### Step 1: Parse Intent

From `$ARGUMENTS`, extract:

- **Summary**: one-line description of what to build or fix
- **Details**: any specifics provided
- **`--prd <number>`**: optional PRD issue number to link as sub-issue

### Step 2: Fetch PRD Context (if `--prd` is set)

```bash
gh issue view <prd_number> --json title,body,milestone,labels
```

Extract from the PRD: requirements, milestone name, existing sub-issues (for blocking relationships).

Get owner/repo and PRD node ID for sub-issue linking:

```bash
OWNER_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
PRD_NODE_ID=$(gh api graphql -f query="{ repository(owner: \"${OWNER_REPO%/*}\", name: \"${OWNER_REPO#*/}\") { issue(number: $PRD_NUMBER) { id } } }" --jq '.data.repository.issue.id')
```

List existing sub-issues to determine blocking relationships:

```bash
gh issue list --search "parent:$PRD_NUMBER" --json number,title,labels,state
```

### Step 3: Explore Codebase

Search for affected code using Grep/Glob:

- Files related to the issue domain
- Existing patterns or prior art
- Architectural boundaries

### Step 4: Classify HITL vs AFK

Determine whether the issue requires human interaction:

- **HITL**: architectural decisions, API contract approvals, UX decisions, ambiguous requirements
- **AFK**: well-defined scope, clear acceptance criteria, no open design questions

Default to HITL when uncertain.

If HITL: write a clear reason for the blockquote (e.g. "Database schema change needs review before migration").

### Step 5: Ensure Labels Exist

```bash
gh label list --limit 100
```

Create missing labels:

```bash
gh label create "task" --description "Implementation task" --color "0E8A16" --force
gh label create "HITL" --description "Requires human interaction" --color "FBCA04" --force
gh label create "AFK" --description "Can be implemented autonomously" --color "0E8A16" --force
```

Create area labels as needed (`area:api`, `area:ui`, `area:db`, etc.).

### Step 6: Build Issue Body

Use the canonical template from `@skills/shared/GITHUB_ISSUE_TEMPLATE.md`.

**For HITL issues**, start with the blockquote:

```markdown
> **Requires discussion:** [Why human input is needed]

## Description
...
```

**For AFK issues**, start directly with Description:

```markdown
## Description
...
```

**Requirements section:**

- If `--prd` is set: map relevant requirements from the PRD body
- If standalone: define requirements directly, or omit if acceptance criteria are sufficient

**Blocking Relationships:**

- If `--prd` is set: reference sibling sub-issues that block or are blocked by this issue
- If standalone: include if user specifies dependencies, otherwise omit section

### Step 7: Create Issue

```bash
ISSUE_URL=$(gh issue create \
  --title "Short descriptive title" \
  --label "task,AFK,area:api" \
  --assignee @me \
  --milestone "Milestone Name" \
  --body "$(cat <<'EOF'
[body from Step 6]
EOF
)")
```

Include `--milestone` only when `--prd` is set and the PRD has a milestone.

### Step 8: Link to PRD (if `--prd` is set)

Link as a native sub-issue of the PRD:

```bash
gh api graphql -f query="
  mutation {
    addSubIssue(input: {
      issueId: \"$PRD_NODE_ID\",
      subIssueUrl: \"$ISSUE_URL\"
    }) {
      issue { number }
      subIssue { number }
    }
  }
"
```

If blocking relationships reference issues not yet created (forward references), note them for later update.

## Output

Display:

- Issue URL
- Issue number
- Title
- Labels applied
- PRD linked (if applicable)
- Blocking relationships
