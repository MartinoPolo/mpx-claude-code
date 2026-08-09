---
name: commit
description: "Stages and commits changes in conventional commit format."
disable-model-invocation: true
allowed-tools: Read, Write, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git show *), Bash(git rev-parse *), Bash(git symbolic-ref *)
metadata:
  author: MartinoPolo
  version: "0.7"
  category: git-workflow
---

# Commit Changes

Stage and commit the working changes as one conventional commit, inline in the main agent (no delegation). $ARGUMENTS

## Workflow

1. Read `${CLAUDE_SKILL_DIR}/../shared/GIT_COMMIT_WORKFLOW.md` now.
2. Follow its **Commit Conventions** section directly — inspect, stage explicit paths, pick the type from the diff, compose the message to a temp file, `git commit -F`, then verify. Treat `$ARGUMENTS` as the `commit_hint`; there is no `issue_ref` unless the caller supplies one. Do not run any push or PR phase.
