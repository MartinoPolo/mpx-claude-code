---
name: mp-issue-create
description: 'Create GitHub issues with optional PRD linking. Use when: "create issue", "create github issue"'
argument-hint: "<description> [--prd <number>]"
allowed-tools: Bash(gh issue create *), Bash(gh label *), Bash(gh issue view *), Bash(gh issue list *), Bash(gh repo view *), Bash(gh api *), Bash(git log *), Bash(git diff *), Read, Glob, Grep, Agent
metadata:
  author: MartinoPolo
  version: "0.5"
  category: utility
---

# Create GitHub Issue

Create a well-structured GitHub issue using the canonical template. Links to a PRD as a native sub-issue — either from `--prd <number>` or auto-discovered. $ARGUMENTS

## Workflow

### Step 0: Load Template

Read `${CLAUDE_SKILL_DIR}/../shared/GITHUB_ISSUE_TEMPLATE.md` now. It defines the issue body format, section rules, HITL/AFK classification, labels, label creation commands, and PRD sub-issue linking used below.

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

Fetch owner/repo and the PRD node ID using the template's "Linking as PRD Sub-Issue" commands.

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

Classify per the template's "HITL vs AFK Classification" rules. If HITL: list the specific unanswered questions in the blockquote.

### Step 5: Ensure Labels Exist

Run the template's "Label Creation Commands". Apply `design needed` per the template's label rules.

### Step 6: Build Issue Body

Use the canonical template loaded in Step 0. HITL issues start with the unanswered-questions blockquote; AFK issues start directly with `## Description`.

**Requirements section:**

- If PRD resolved: map relevant requirements from the PRD body
- If standalone: define requirements directly, or omit if acceptance criteria are sufficient

**Blocking Relationships:**

- If PRD resolved: reference sibling sub-issues that block or are blocked by this issue
- If standalone: include if user specifies dependencies, otherwise omit section

### Step 7: Create Issue

Use the template's "Creation Command". Include `--milestone` only when a PRD was resolved and it has a milestone.

### Step 8: Link to PRD (if PRD resolved)

Link as a native sub-issue of the PRD using the template's "Linking as PRD Sub-Issue" mutation.

If blocking relationships reference issues not yet created (forward references), note them for later update.

## Output

Display:

- Issue URL
- Issue number
- Title
- Labels applied
- PRD linked (if applicable)
- Blocking relationships
