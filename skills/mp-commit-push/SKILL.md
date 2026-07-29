---
name: mp-commit-push
description: "Stages, commits, and pushes changes without opening a PR."
disable-model-invocation: true
allowed-tools: Agent, Read, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git push *)
metadata:
  author: MartinoPolo
  version: "0.6"
  category: git-workflow
---

# Commit and Push

Stage, commit, and push changes. No PR created. $ARGUMENTS

## Workflow

1. Read `${CLAUDE_SKILL_DIR}/../shared/GIT_COMMIT_WORKFLOW.md` now.
2. Run **Phase A** (commit via `mp-git-committer`) with `push: true`, including its result handling and escalation. Only Phase A applies — it covers both the commit and the push.

## Output

After completion, display:

- Commit hash and message (if committed)
- Push status
- "Nothing to commit — already up-to-date" (if applicable)
