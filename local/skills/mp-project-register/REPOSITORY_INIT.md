# Repository initialization branch

Read this branch only when the project has no Git repository.

# Procedure

Check `git -C "<project>" rev-parse --git-dir` (or `Test-Path <project>/.git`). If it
succeeds, the project already has a repo — skip to step 4.

If it fails, resolve `MPX_SKILLS_DIR` from the environment. When it is unavailable, stop
and report that MPX_SKILLS_DIR is required. Then read `<resolved
MPX_SKILLS_DIR>/gh/skills/mp-init-repo/SKILL.md` in full and carry out its instructions
yourself, in this project directory, right now — script, `.mpx/` structure, the visibility
question, GitHub repo creation, `main`/`dev` branches, branch protection.
It only genuinely needs you to stop once: **repo visibility** (private/public), via
`AskUserQuestion` as its own step 4 directs. Everything else — including the graceful
403-on-branch-protection degradation for private repos on GitHub Free — proceeds without
asking, so this step completes autonomously apart from that one question.

After the init script has created and committed the seed, immediately refine the local
branch by replacing only a generated minimal `AGENTS.md` seed with real project
instructions. Preserve any pre-existing `AGENTS.md` unchanged. Keep the existing content
rules: derive guidance from `.mpx/` / conversation / existing docs, include only
undiscoverable conventions, point to authoritative branch documentation, and do not invent
stack commands when the stack is unknown.

After refining a generated seed, commit exactly:
```bash
git add AGENTS.md
git commit -m "docs: refine project instructions"
```
Commit this refinement before creating or pushing the GitHub repository.

Report what `mp-init-repo` created (or that it was skipped because a repo already existed)
in the same closing table as the rest of this skill's report.

Before returning to the parent workflow, verify that the repository exists and real project
instructions are committed. Record created or skipped initialization and any documented
branch-protection degradation in the closing report.
