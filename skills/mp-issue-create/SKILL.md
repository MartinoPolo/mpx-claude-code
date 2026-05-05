---
name: mp-issue-create
description: 'Create GitHub issues with optional PRD linking. Use when: "create issue", "create github issue"'
argument-hint: "<description> [--prd <number>]"
allowed-tools: Bash(gh issue create *), Bash(gh label *), Bash(gh issue view *), Bash(gh issue list *), Bash(gh repo view *), Bash(gh api *), Bash(git log *), Bash(git diff *), Read, Glob, Grep, Agent, Bash(git *), Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.4"
  category: utility
---

# Create GitHub Issue

Create a well-structured GitHub issue using the canonical template. Links to a PRD as a native sub-issue — either from `--prd <number>` or auto-discovered. $ARGUMENTS

Issue body format: @skills/shared/GITHUB_ISSUE_TEMPLATE.md

## Workflow

### Step 1: Parse Intent

From `$ARGUMENTS`, extract:

- **Summary**: one-line description of what to build or fix
- **Details**: any specifics provided
- **`--prd <number>`**: optional PRD issue number to link as sub-issue

### Step 2: Resolve PRD

**If `--prd` is set**, use that number directly.

**If `--prd` is not set**, spawn a sonnet sub-agent to find the most relevant open PRD:

```
Agent task: Search open GitHub issues labelled "PRD" (gh issue list --label PRD --state open --json number,title,body --limit 50).
Return the single best-matching PRD number for: "<summary>".
If no match is found, return null.
```

If the agent returns a PRD number, treat it as if `--prd <number>` was passed. If it returns null, proceed without a PRD (standalone issue).

### Step 2b: Fetch PRD Context (if PRD resolved)

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

- **HITL**: has unanswered questions or uncertain decisions that require asking the user. Examples: unclear API contract, ambiguous business rule, multiple valid approaches needing a decision. NOT for: visual inspection, manual testing, code review, QA verification
- **AFK**: well-defined scope, clear acceptance criteria, no open design questions

When all questions have been resolved upfront, the issue should be AFK.

If HITL: list the specific unanswered questions in the blockquote.

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
> **Unanswered questions:**
>
> - [Specific question that needs answering before/during implementation]

## Description

...
```

**For AFK issues**, start directly with Description:

```markdown
## Description

...
```

**Requirements section:**

- If PRD resolved: map relevant requirements from the PRD body
- If standalone: define requirements directly, or omit if acceptance criteria are sufficient

**Blocking Relationships:**

- If PRD resolved: reference sibling sub-issues that block or are blocked by this issue
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

Include `--milestone` only when a PRD was resolved and it has a milestone.

### Step 8: Link to PRD (if PRD resolved)

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
