---
name: mp-sync-base
description: 'Merge target branch into current branch. Use when: "sync with main", "merge dev into branch", "update from main"'
allowed-tools: Bash(git *), Task, Read, Edit, Bash(gh *)
metadata:
  author: MartinoPolo
  version: "1.0"
  category: git-workflow
---

# Sync Base Branch

Merge a target branch into the current branch. $ARGUMENTS

**Args:** `[branch]`

## Workflow

### Step 1: Determine Target Branch

If `$ARGUMENTS` provides a branch → use it.

Otherwise, spawn `mp-base-branch-detector` agent (via Task tool, subagent_type `mp-base-branch-detector`, model haiku) with:

- Explicit base branch: none
- Remote branches: output of `git branch -r`

**Based on result:**

- **Branch returned** → use it, display to user
- **Null with candidates** → ask user with `AskUserQuestion` to pick from candidates
- **Null without candidates** → ask user with `AskUserQuestion` to specify manually

### Step 2: Pre-merge Checks

**2a. Uncommitted changes:**

```bash
git status --porcelain
```

If non-empty → AskUserQuestion: "Uncommitted changes detected. Stash before merging?"

- "Stash and continue" → `git stash push -m "Auto-stash before merge"`
- "Abort"

**2b. Remote sync (current branch):**

```bash
git branch --show-current
git rev-parse --verify origin/<current> 2>/dev/null
```

If no tracking branch → skip to Step 3.

Otherwise:

```bash
git fetch origin <current>
git rev-list --left-right --count HEAD...origin/<current>
```

- **Behind only** → AskUserQuestion: "Current branch is N behind remote. Pull first?"
  - "Pull remote changes (Recommended)" → `git pull origin <current>`
  - "Continue anyway"
- **Ahead only** → inform user, continue
- **Diverged** → AskUserQuestion: "Branch diverged (N ahead, M behind). Pull first?"
  - "Pull (Recommended)" → `git pull origin <current>`
  - "Continue anyway"
- **In sync** → continue

### Step 3: Fetch and Preview

```bash
git fetch origin <target>
git log HEAD..origin/<target> --oneline
```

Display incoming commits. If none → report "Already up-to-date" and stop.

### Step 4: Merge

```bash
git merge origin/<target>
```

### Step 5: Resolve Conflicts (if any)

If conflicts occur:

1. List conflicted files: `git diff --name-only --diff-filter=U`
2. For each conflicted file:
   a. Read the file (use Read tool)
   b. Analyze conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
   c. **Simple conflicts** (non-overlapping, clear intent) → resolve with Edit tool, then `git add <file>`
   d. **Complex conflicts** (overlapping logic, ambiguous) → show both sides to user, ask with `AskUserQuestion` how to resolve
3. After all resolved: `git commit` (accept default merge message)
4. If new conflicts appear → repeat from step 1

## Output

After completion, display:

- Target branch merged
- Number of incoming commits applied
- Conflicts resolved (if any), with brief description
- **Session Activity:** list agents dispatched (if any)
