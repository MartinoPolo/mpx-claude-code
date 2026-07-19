---
name: mp-rebase
description: 'Rebase or merge target branch into current branch. Use when: "rebase on main", "update from dev", "merge main into branch"'
allowed-tools: Bash(git *), Task, Read, Edit, Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: git-workflow
---

# Rebase or Merge

Rebase (default) or merge a target branch into the current branch. $ARGUMENTS

**Args:** `[branch] [--merge]`

## Workflow

### Step 1: Parse Arguments

- Extract target branch from `$ARGUMENTS` (if provided)
- Check for `--merge` flag → merge mode. Default → rebase mode

### Step 2: Detect Target Branch

If target branch provided in Step 1 → use it.

Otherwise, spawn `mp-base-branch-detector` agent (via Task tool, subagent_type `mp-base-branch-detector`, model haiku) with:

- Explicit base branch: none
- Remote branches: output of `git branch -r`

**Based on result:**

- **Branch returned** → use it, display to user
- **Null with candidates** → ask user with `AskUserQuestion` to pick from candidates
- **Null without candidates** → ask user with `AskUserQuestion` to specify manually

### Step 3: Sync Check

**3a. Uncommitted changes:**

```bash
git status --porcelain
```

If output is non-empty → AskUserQuestion: "Uncommitted changes detected. Rebase requires a clean working tree."

- "Stash changes and continue" → `git stash push -m "Auto-stash before rebase"`
- "Abort"

**3b. Remote sync (current branch):**

```bash
git branch --show-current
git rev-parse --verify origin/<current> 2>/dev/null
```

If no tracking branch exists → skip to Step 4.

Otherwise:

```bash
git fetch origin <current>
git rev-list --left-right --count HEAD...origin/<current>
```

Based on ahead/behind counts:

- **Behind only** → AskUserQuestion: "Current branch is N behind remote. Pull first?"
  - "Pull remote changes (Recommended)" → `git pull --rebase origin <current>`
  - "Continue anyway"
- **Ahead only** → inform user, continue silently
- **Diverged** → AskUserQuestion: "Branch diverged (N ahead, M behind). Pull with rebase first?"
  - "Pull with rebase (Recommended)" → `git pull --rebase origin <current>`
  - "Continue anyway"
- **In sync** → continue silently

### Step 4: Fetch and Preview

```bash
git fetch origin <target>
git log HEAD..origin/<target> --oneline
```

Display incoming commits. If none → report "Already up-to-date" and stop.

Also count local commits ahead: `git rev-list origin/<target>..HEAD --count`

**Complexity check (rebase mode only):**
If incoming commits > 15 OR local commits ahead > 15 → ask user with `AskUserQuestion`:
"This is a large rebase (N incoming, M local commits). Merge the target branch into this branch instead? Merge is safer for large changes."
Options: "Merge instead (Recommended)", "Rebase anyway"
If user picks merge → switch to merge mode.

### Step 5: Execute

**Rebase mode (default):**

```bash
git rebase origin/<target>
```

**Merge mode (`--merge` or switched from complexity check):**

```bash
git merge origin/<target>
```

### Step 6: Resolve Conflicts (if any)

If conflicts occur:

1. List conflicted files: `git diff --name-only --diff-filter=U`
2. For each conflicted file:
   a. Read the file (use Read tool)
   b. Analyze conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
   c. **Simple conflicts** (non-overlapping changes, clear intent) → resolve with Edit tool, then `git add <file>`
   d. **Complex conflicts** (overlapping logic, ambiguous intent) → show both sides to user, ask with `AskUserQuestion` how to resolve
3. After all conflicts resolved:
   - Rebase: `git rebase --continue`
   - Merge: `git commit` (accept default merge message)
4. If new conflicts appear after continue → repeat from step 1

## Output

After completion, display:

- Target branch
- Mode (rebase/merge)
- Number of incoming commits applied
- Conflicts resolved (if any), with brief description of each resolution
- **Session Activity:** list agents dispatched (if any)
