---
name: mp-issue-create
description: 'Create well-structured GitHub issues (feature, chore, docs) with codebase context. Use when: "create issue", "open issue", "new feature issue", "create chore"'
allowed-tools: Bash(gh issue create *), Bash(gh label *), Bash(git log *), Bash(git diff *), Read, Glob, Grep, Agent, Bash(git *), Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: utility
---

# Create GitHub Issue

Create a well-structured GitHub issue with codebase context. $ARGUMENTS

## Workflow

### Step 1: Parse Intent

From `$ARGUMENTS`, determine:

- **Type**: bug | feature | chore | docs
- **Summary**: one-line description
- **Details**: any specifics provided

### Step 2: Explore Codebase

If relevant files aren't specified, search for affected code:

```bash
# Find related files
```

Use Grep/Glob to identify:

- Files related to the issue
- Relevant line numbers
- Existing patterns or prior art

### Step 3: Detect Labels

```bash
gh label list --limit 50
```

Match issue type to existing repo labels only.

### Step 4: Build Issue

**Title format:** `type: description`

**Body template by type:**

#### Bug

```markdown
## Description

[What's broken]

## Steps to Reproduce

1. [Step 1]
2. [Step 2]

## Expected Behavior

[What should happen]

## Actual Behavior

[What happens instead]

## Affected Files

- `path/to/file.ts:123` — [why relevant]

## Acceptance Criteria

- [ ] [How to verify the fix]
```

#### Feature

```markdown
## Description

[What to build and why]

## Affected Files

- `path/to/file.ts` — [why relevant]

## Acceptance Criteria

- [ ] [Requirement 1]
- [ ] [Requirement 2]

## Notes

[Implementation hints, constraints, related issues]
```

#### Chore / Docs

```markdown
## Description

[What to do and why]

## Affected Files

- `path/to/file.ts` — [why relevant]

## Acceptance Criteria

- [ ] [Done when...]
```

### Step 5: Create Issue

```bash
gh issue create --title "type: description" --label "label1,label2" --body "$(cat <<'EOF'
[body from Step 4]
EOF
)"
```

## Output

Display:

- Issue URL
- Issue number
- Title
- Labels applied
