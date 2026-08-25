---
name: issue-create
description: "Creates or files a GitHub issue in the repo's standard format, optionally linked to an epic."
argument-hint: "<description> [--epic <number>]"
allowed-tools: Bash(gh issue create *), Bash(gh label *), Bash(gh issue view *), Bash(gh issue list *), Bash(gh repo view *), Bash(gh api *), Read, Agent
metadata:
  author: MartinoPolo
  version: "0.11"
  category: utility
---

# Create GitHub Issue

Create a well-structured GitHub issue using the canonical template. Links to an epic as a native sub-issue — either from `--epic <number>` or auto-discovered. $ARGUMENTS

## Workflow

### Step 0: Load Template

Read `${CLAUDE_SKILL_DIR}/../shared/GITHUB_ISSUE_TEMPLATE.md` now. It defines the issue body format, section rules, HITL/AFK classification, labels, label creation commands, and epic sub-issue linking used below.

### Step 1: Parse Intent

From `$ARGUMENTS`, extract:

- **Summary**: one-line description of what to build or fix
- **Details**: any specifics provided
- **`--epic <number>`**: optional epic issue number to link as sub-issue

### Step 2: Resolve Epic

**If `--epic` is set**, use that number directly.

**If `--epic` is not set**, spawn an `Explore` sub-agent (breadth: medium) to find the most relevant open epic:

```
Agent task: Search open GitHub issues labelled "epic" (gh issue list --label epic --state open --json number,title,body --limit 50).
Return the single best-matching epic number for: "<summary>".
If no match is found, return null.
```

If the agent returns an epic number, treat it as if `--epic <number>` was passed. If it returns null, proceed without an epic (standalone issue).

### Step 2b: Fetch Epic Context (if epic resolved)

```bash
gh issue view <epic_number> --json title,body,milestone,labels
```

Extract from the epic: requirements, milestone name, existing sub-issues (for blocking relationships).

Fetch owner/repo and the epic node ID using the template's "Linking as Epic Sub-Issue" commands.

List existing sub-issues to determine blocking relationships:

```bash
gh issue list --search "parent:$EPIC_NUMBER" --json number,title,labels,state
```

### Step 3: Explore Codebase

Spawn `Explore` (medium breadth, see [EXPLORATION.md](${CLAUDE_PLUGIN_ROOT}/../mp/skills/shared/EXPLORATION.md)) to find affected code:

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

- If epic resolved: map relevant requirements from the epic body
- If standalone: define requirements directly, or omit if acceptance criteria are sufficient

**Blocking Relationships:**

- If epic resolved: reference sibling sub-issues that block or are blocked by this issue
- If standalone: include if user specifies dependencies, otherwise omit section

### Step 7: Create Issue

Use the template's "Creation Command". Include `--milestone` only when an epic was resolved and it has a milestone.

### Step 8: Link to Epic (if epic resolved)

Link as a native sub-issue of the epic using the template's "Linking as Epic Sub-Issue" mutation.

If blocking relationships reference issues not yet created (forward references), note them for later update.

## Output

Display:

- Issue URL
- Issue number
- Title
- Labels applied
- Epic linked (if applicable)
- Blocking relationships
