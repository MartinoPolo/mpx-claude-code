---
name: pr
description: "Creates or updates a pull request from the commits already on the current branch."
disable-model-invocation: true
allowed-tools: Agent, Read, Bash(node *), Bash(gh pr *), Bash(gh issue view *), Bash(git status *), Bash(git log *), Bash(git diff *), Bash(git branch *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git rev-list *), Bash(git remote *)
metadata:
  author: MartinoPolo
  version: "0.5"
  category: git-workflow
---

# Create or Update Pull Request

Create or update a PR from existing commits on current branch. $ARGUMENTS

Pass `draft` as argument to create a draft PR instead of a normal PR.

## Workflow

1. Read `${CLAUDE_PLUGIN_ROOT}/../mp/skills/shared/GIT_COMMIT_WORKFLOW.md` now.
2. Run **Phase B** (find linked issue). Phase A does not apply — commits already exist on the branch.
3. Run **Phase C** (create or update PR via `mp-pr-manager`), including its result handling, escalation, PR rules, and troubleshooting.

## Output

After completion, display:

- Base branch used
- PR URL and number
- Whether created or updated
- **Session Activity:** list agents dispatched
