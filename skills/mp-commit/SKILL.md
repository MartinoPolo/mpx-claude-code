---
name: commit
description: "Stages and commits changes in conventional commit format."
disable-model-invocation: true
allowed-tools: Agent, Read, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *)
metadata:
  author: MartinoPolo
  version: "0.6"
  category: git-workflow
---

# Commit Changes

Stage and commit changes with conventional commit format. $ARGUMENTS

## Workflow

1. Read `${CLAUDE_SKILL_DIR}/../shared/GIT_COMMIT_WORKFLOW.md` now.
2. Run **Phase A** (commit via `mp-git-committer`) with `push: false`, including its result handling and escalation. Only Phase A applies.

## Output

After commit, display:

- Commit hash
- Commit message
- Files changed summary
