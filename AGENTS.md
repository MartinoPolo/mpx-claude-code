# User-Level Instructions

## Communication Style

- **Concise** - Be extremely concise. Sacrifice grammar for the sake of concision.
- **Imperative mood** - "Return value", "Handle errors"
- **Present tense** - "Handles", not "Will handle"
- **Why over what** - Reasons > descriptions

## Code Standards

- **Dead Code**: Remove unused code, exports, commented code, unreachable paths
- **DRY**: Extract reusable logic. Share types. Don't extract single-use code
- **Verbose Naming**: Full descriptive names. No abbreviations. Clear intent
- **Docs**: Update when functionality changes. Keep comments minimal

## Iron Laws

1. **NO COMPLETION CLAIMS WITHOUT VERIFICATION** — Run command, read output, THEN claim
2. **NO FIXES WITHOUT ROOT CAUSE** — Understand why before changing code

## MCP Tools

Use `ToolSearch` to load deferred tools only when needed.

| Need            | Search            | Instead Of |
| --------------- | ----------------- | ---------- |
| Docs            | `context7`        | Web search |
| GitHub          | `github`          | `gh` CLI   |
| Browser testing | `chrome-devtools` | Manual     |

## Agent Auto-Spawn Rules

**Spawn `mp-context7-docs-fetcher` agent when:**

- User asks about library APIs, syntax, or best practices
- Questions mention: React, Svelte, Typescript, Next.js, Tailwind, etc.
- Question mentions context7 or library documentation
- "Use [library] best practices", "How do I use [library]?", "What's the best way to [library task]?"

**Spawn `mp-base-branch-detector` agent when:**

- Detecting base branch for PR creation/update

**Spawn `mp-chrome-devtools-tester` agent when:**

- Need to verify UI behavior via browser
- "Verify with chrome devtools", "Test in browser"

**Use `/mp-gh-issue-create` skill when:**

- "Create github issue", "Open github issue"

**Use `/mp-commit` skill when:**

- User asks to commit changes
- "Commit"

**Use `/mp-pr` skill when:**

- User asks to create or update a PR
- "Create PR", "Open pull request", "Update PR"

**Use `/mp-commit-push` skill when:**

- User asks to commit and push
- "Commit and push", "Push my changes", "Ship it"

**Use `/mp-rebase` skill when:**

- User asks to rebase or merge upstream changes
- "Rebase...", "Merge ... into ..."

**Use `/mp-check-fix` skill when:**

- "Fix lint errors", "Fix type errors", "Check and fix", "Run checks"

**Use `/mpx-report-issue-or-bug` skill when:**

- "Track this bug", "Add issue to project", "Log this bug"

**Use `/mp-release` skill when:**

- "Release", "Bump version", "Version bump", "Cut a release"

**Use `/mp-update-docs` skill when:**

- "Update docs", "Refresh documentation", "Sync docs"
- "Update README", "Update instructions", "Fix tracking"

**Use `/mp-brainstorm` skill when:**

- User wants to explore/design before coding
- "Brainstorm", "Design a..."

## Self-Improvement Protocol

When encountering errors, unexpected behavior, or workflow friction:

1. **Analyze** - root cause, why instructions didn't prevent it
2. **Fix** - resolve immediate issue
3. **Update instructions** - modify AGENTS.md or relevant files
4. **Document** - note what changed and why

**Trigger examples**: silent command failures, missing workflow steps, ambiguous instructions, unreliable tools

## Documentation Maintenance

Update docs when behavior, patterns, or structure changes.

## Plan Mode

- Extremely concise plans. Sacrifice grammar for the sake of concision.
- End each plan with unresolved questions (if any)

## Summary Requirements

Concise. Include reasoning, sources.

Use these emoji indicators in summaries:
Choose one of these:

- 🟢 Success/completed
- 🔴 Issues occurred (briefly describe)
- ⚪ No action
  Add any number of these:
- 🟡 Committed (mention branch/message)
- 🟠 Pushed (mention remote/branch)
- 🔵 PR created/updated (include link)
- 🟣 Question/needs input

## Session Activity Tracking

At end of each response where agents were spawned or skills invoked, append:

**Session Activity:**

- `agent-name` (model) — brief purpose [× count if >1]
- `/skill-name` — brief purpose

Rules:

- Omit entirely if no agents/skills used
- Include model (opus/sonnet/haiku) for agents
- Show parallel runs as × count
- Keep descriptions to ~5 words

## Git Commits

Conventional commits: `type(scope): description`

**Types**: feat, fix, refactor, chore, docs, style, test, perf, ci, build, revert

- **No AI attribution**: Never include "Co-authored-by: Claude" or similar
