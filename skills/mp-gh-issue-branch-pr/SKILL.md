---
name: mp-gh-issue-branch-pr
description: 'Create issue from current work, branch, then commit/push/create PR. Use when: "create issue and PR", "log bug and open PR", "issue + branch + PR"'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Task, AskUserQuestion, Bash(git *), Bash(gh *), Bash(node $HOME/.claude/scripts/detect-base-branch.js*), Bash(node $HOME/.claude/scripts/extract-branch-issue.js*)
metadata:
  author: MartinoPolo
  version: "0.2"
  category: git-workflow
---

# Create Issue and PR

Log work as a GitHub issue, create/switch branch, then commit/push and create or update draft PR. $ARGUMENTS

GitHub MCP allowed for this skill.

## Workflow

### Step 1: Capture Current Context

Collect current change context before issue creation.

```bash
git status
git diff --stat
git diff --cached --stat
```

Add context from the current session.
Use this context as input for issue drafting.

### Step 2: Create GitHub Issue

#### 2a: Parse Intent

From `$ARGUMENTS` and session context, determine:

- **Type**: bug | feature | chore | docs
- **Summary**: one-line description
- **Details**: any specifics provided

#### 2b: Explore Codebase

If relevant files aren't specified, search for affected code using Grep/Glob to identify:

- Files related to the issue
- Relevant line numbers
- Existing patterns or prior art

#### 2c: Detect Labels

```bash
gh label list --limit 50
```

Match issue type to existing repo labels. Don't create new labels.

#### 2d: Build Issue

**Title format:** `type: description`

**Body template by type:**

**Bug:**

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

**Feature:**

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

**Chore / Docs:**

```markdown
## Description

[What to do and why]

## Affected Files

- `path/to/file.ts` — [why relevant]

## Acceptance Criteria

- [ ] [Done when...]
```

#### 2e: Create Issue

```bash
gh issue create --title "type: description" --label "label1,label2" --body "$(cat <<'EOF'
[body from Step 2d]
EOF
)"
```

Capture `issue_number`, `issue_url`, `issue_title`, `labels_applied` from output.

### Step 3: Create and Switch Branch

Derive branch name from issue metadata.

Format:

`<issue-number>-<short-kebab-summary>`

Example:

`123-dashboard-filter-crash`

Create and switch:

```bash
git checkout -b <branch-name>
```

If branch exists, switch to it.

### Step 4: Stage and Commit

```bash
git status
git diff --stat
```

If nothing to commit (clean working tree + no staged changes) → skip to Step 5.

```bash
git log --oneline -5
```

Match repository's commit style.

```bash
git add <specific-files>
```

Prefer specific files over `git add -A`. Avoid staging sensitive files (.env, credentials).

```bash
git commit -m "$(cat <<'EOF'
type(scope): Description

Optional body with details
EOF
)"
```

**Commit Rules:**

- Conventional commit format: `type(scope): description`
- Types: feat, fix, refactor, chore, docs, style, test, perf, ci, build, revert
- Prefer new commits over `--amend`
- Focus on "why" over "what"
- Keep subject line under 72 characters
- Imperative mood: "Add feature" not "Added feature"

### Step 5: Push

```bash
git push -u origin $(git branch --show-current)
```

If nothing to push (local and remote in sync) → skip to Step 6.

### Step 6: Detect Base Branch

```bash
node $HOME/.claude/scripts/detect-base-branch.js
```

**Based on result:**

- **Branch returned** → use it, display to user
- **Null with candidates** → ask user with `AskUserQuestion` to pick from candidates
- **Null without candidates** → ask user with `AskUserQuestion` to specify manually

### Step 7: Find Linked Issue

Use the issue created in Step 2. Add `Closes #<issue_number>` to the PR body.

**Fast-path:** If the issue number is embedded in the branch name, extract it directly:

```bash
node $HOME/.claude/scripts/extract-branch-issue.js
```

Otherwise use the issue number captured from Step 2e.

### Step 8: Create or Update PR

```bash
gh pr view --json number,title,body,url,state 2>/dev/null
```

- **OPEN PR exists** → edit mode (Step 8a)
- **No PR or not OPEN** → create mode (Step 8b)

#### Step 8a: Update Existing PR

```bash
gh pr edit --title "type(scope): Description" --body "$(cat <<'EOF'
## Description
- Summary bullet 1
- Summary bullet 2

## Resolves
Closes #<issue_number>

## Testing (Optional)
- [ ] Manual smoke test: <what was verified>
EOF
)"
```

#### Step 8b: Create Draft PR

```bash
gh pr create --draft --base <base> --title "type(scope): Description" --body "$(cat <<'EOF'
## Description
- Summary bullet 1
- Summary bullet 2

## Resolves
Closes #<issue_number>

## Testing (Optional)
- [ ] Manual smoke test: <what was verified>
EOF
)"
```

**PR Rules:**

- Title: `type(scope): Description` — conventional commit format
- Review ALL commits `origin/<base>..HEAD` for description
- `## Description` → 1-6 concise bullets summarizing full scope
- `## Resolves` → `Closes #<issue_number>` (always present — issue created in Step 2)
- `## Testing (Optional)` → include only when tests/manual checks were run

### Step 9: Final Summary

Return:

- Issue URL and number
- Branch name
- Commit hash/message (if created)
- PR URL and number
- Whether PR was created or updated

## Rules

> Code quality and git conventions enforced by hooks.

- Always create the issue before branch/PR workflow
- Always branch from current HEAD unless user specifies otherwise
- Prefer existing branch if it already matches the issue
- Keep commit and PR titles in conventional format

## Failure Handling

| Problem               | Action                                           |
| --------------------- | ------------------------------------------------ |
| Issue creation fails  | Stop and report blocker                          |
| Branch creation fails | Ask for alternate branch name                    |
| No changes to commit  | Continue PR update path if commits already exist |
| PR creation blocked   | Report `gh` error and remediation                |

## Output

After completion, display:

- Issue created (URL, number, labels)
- Commit hash and message (if committed)
- Push status
- Base branch used
- PR URL and number
- Whether PR was created or updated
- Steps skipped (if any)
- **Session Activity:** list agents dispatched
