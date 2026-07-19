---
name: mp-commit
description: 'Stage and commit changes with conventional commit format. Use when: "commit this", "stage and commit", "make a commit"'
allowed-tools: Agent, Read, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *)
metadata:
  author: MartinoPolo
  version: "0.4"
  category: git-workflow
---

# Commit Changes

Stage and commit changes with conventional commit format. $ARGUMENTS

## Workflow

1. Read `${CLAUDE_SKILL_DIR}/../shared/GIT_COMMIT_WORKFLOW.md` now.
2. Run **Phase A** (commit via `mp-git-committer`) with `push: false`, including its result handling and escalation. Phases B and C do not apply.

## Output

After commit, display:

- Commit hash
- Commit message
- Files changed summary
