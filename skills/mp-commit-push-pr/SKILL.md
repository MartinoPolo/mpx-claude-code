---
name: mp-commit-push-pr
description: 'Full workflow - commit, push, and create or update PR. Use when: "commit push and PR", "full workflow", "commit push PR"'
allowed-tools: Agent, Read, Bash(node *), Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git push *), Bash(git branch *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git rev-list *), Bash(git remote *), Bash(gh pr *), Bash(gh issue view *)
metadata:
  author: MartinoPolo
  version: "0.5"
  category: git-workflow
---

# Commit, Push, and Create/Update PR

Full workflow: stage → commit → push → find issue → create/update PR. $ARGUMENTS

Pass `draft` as argument to create a draft PR instead of a normal PR.

## Workflow

1. Read `${CLAUDE_SKILL_DIR}/../shared/GIT_COMMIT_WORKFLOW.md` now.
2. Run **Phase A** (commit via `mp-git-committer`) with `push: true`. Delta: on **SKIP** (nothing to commit), check if the branch is already pushed; if yes, continue to Phase B.
3. Run **Phase B** (find linked issue).
4. Run **Phase C** (create or update PR via `mp-pr-manager`), passing `description_hint` from $ARGUMENTS or the Phase A summary. Its PR rules and troubleshooting apply.

## Output

After completion, display:

- Commit hash and message (if committed)
- Push status
- Base branch used
- PR URL and number
- Whether PR was created or updated
- Steps skipped (if any)
- **Session Activity:** list agents dispatched
