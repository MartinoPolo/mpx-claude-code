# mpx — Claude Code Customization Toolkit

A collection of skills, agents, scripts, and instructions that extend [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with spec-driven project development workflows and general-purpose dev tools.

**Two ways to use it:**

- **Full mpx workflow** — spec-driven, phase-based project development from scratch
- **Individual skills** — cherry-pick general-purpose tools (commits, PRs, reviews, etc.)

## Installation

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and working

## Quick Start

**New project:**

```bash
cd your-project
# Then in Claude Code:
/mpx-setup
```

Auto-detects project state — fresh init, existing codebase, or restructure. Creates spec, initializes git, generates phased roadmap and checklists.

## MPX Workflow

```
/mpx-setup                 ◄── Auto-detects: fresh init, convert existing, or restructure
        │
        ▼
/mpx-add-requirements      ◄── Primary requirements entry → SPEC.md
        │
        ▼
/mpx-init-repo             ◄── Git setup (.gitignore, .editorconfig, etc.)
        │
        ▼
/mpx-parse-spec            ◄── Spawn mpx-spec-analyzer → ROADMAP.md + phase folders
        │
        ▼
/mpx-execute               ◄── Pick phase, execute tasks (loop)
```

Between sessions, optionally use `/mp-handoff` to save context to `HANDOFF.md` for continuity.

## Project Structure

All mpx projects use phase-based organization inside `.mpx/`:

```
.mpx/
├── SPEC.md              # Master project specification
├── ROADMAP.md           # Phase overview + tracking + decisions + blockers
└── phases/
    ├── 01-foundation/
    │   └── CHECKLIST.md  # Phase specs + tasks + state
    ├── 02-core-feature/
    │   └── CHECKLIST.md
    └── 03-polish/
        └── CHECKLIST.md
```

- `SPEC.md` — project requirements source of truth for full lifecycle
- `ROADMAP.md` — phase tracking, dependencies, project-level decisions and blockers
- Each phase has `CHECKLIST.md` (phase-level source of truth for scope + tasks + state)
- `HANDOFF.md` is ephemeral and optional — created in project root by `/mp-handoff`, consumed by `/mpx-execute`

## Skills Reference

### mpx- Skills (Spec-Driven Workflow)

| Skill                      | Description                                                                     |
| -------------------------- | ------------------------------------------------------------------------------- |
| `/mpx-setup`               | Unified project setup (auto-detects: fresh init, convert existing, restructure) |
| `/mpx-init-repo`           | Initialize git repo                                                             |
| `/mpx-parse-spec`          | Re-parse SPEC.md via `mpx-spec-analyzer`                                        |
| `/mpx-execute`             | Select phase, execute tasks (full phase or single)                              |
| `/mpx-add-requirements`    | Primary requirements skill (create/update SPEC + auto-parse)                    |
| `/mpx-report-issue-or-bug` | Track bugs/issues in .mpx/ phase system                                         |

### mp- Skills (General Purpose)

| Skill                     | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `/mp-commit`              | Stage and commit with conventional format        |
| `/mp-commit-push`         | Commit and push (no PR)                          |
| `/mp-pr`                  | Create or update draft PR from existing commits  |
| `/mp-commit-push-pr`      | Full workflow — commit, push, create/update PR   |
| `/mp-rebase`              | Rebase or merge target branch into current       |
| `/mp-review-pr`           | Read-only PR review via subagents                |
| `/mp-gh-issue-execute`    | Execute GitHub issues (bug/task/feature)         |
| `/mp-update-readme`       | Update README.md                                 |
| `/mp-update-instructions` | Analyze history, improve CLAUDE.md/AGENTS.md     |
| `/mp-check-fix`           | Auto-detect and fix build/typecheck/lint errors  |
| `/mp-script-discovery`    | Discover runnable scripts and dev servers        |
| `/mp-handoff`             | Create ephemeral HANDOFF.md for session bridging |
| `/mp-gemini-fetch`        | Fetch blocked sites via Gemini CLI               |

## Agents

| Agent                     | Model  | Description                                        |
| ------------------------- | ------ | -------------------------------------------------- |
| mpx-executor              | Opus   | Executes tasks with fresh context                  |
| mpx-spec-analyzer         | Sonnet | Analyzes specs and creates phase structure         |
| mpx-codebase-scanner      | Sonnet | Scans codebase for tech stack, features, structure |
| mp-chrome-devtools-tester | Sonnet | Browser test automation via Chrome DevTools MCP    |
| mp-gh-issue-analyzer      | Opus   | Analyzes GitHub issues, creates execution plans    |
| mp-context7-docs-fetcher  | Sonnet | Fetches library docs via Context7 MCP              |
| mp-css-layout-debugger    | Haiku  | CSS layout debugging                               |
| mp-base-branch-detector   | Haiku  | Detect base branch for PRs and rebases             |
| mp-bash-script-colorizer  | Haiku  | Bash script coloring guidelines                    |
| mp-ux-designer            | Sonnet | UX research and design artifacts                   |

Agents are auto-spawned based on rules in `AGENTS.md` — no manual invocation needed.

## Custom Status Line

![Status Line](assets/status-line.png)

3-line status bar showing:

- **Line 1**: Model, directory, git branch
- **Line 2**: Context usage bar (█/░), % tokens, session cost (USD/CZK)
- **Line 3**: 5-hour & 7-day quota utilization with reset countdowns

Configured via `scripts/context-bar.sh`.

## Review Skills

Review skill (`/mp-review`) is read-only except writing `REVIEW.md` and does not commit or post GitHub comments/reviews.

**Report file:** `REVIEW.md` (project root, actionable checklist).

**Categories checked:** tech stack best practices, security (OWASP top 10), performance, error handling, code quality.

**Confidence scoring** (0–100): >80 must fix, 66–80 should address, 40–65 worth reviewing, <40 minor/stylistic.

## Worktree Scripts

Create isolated worktrees for parallel development:

```bash
bash scripts/setup-worktree.sh <name>    # Create worktree branched from current branch
bash scripts/remove-worktree.sh <name>   # Remove worktree and its branch
```

**What `setup-worktree` copies automatically:**

- **IDE configs** — `.vscode/`, `.cursor/`
- **Local project context** — `.local/`
- **Claude Code settings** — `.claude/settings.local.json`
- **`.env` files** — copied from source repo, with `.env.example` fallback for any missing ones
- **`.mpx/` folder** — copied if gitignored (local-only project data that git won't track to worktrees)
- **Dependencies** — runs `pnpm/yarn/npm install` based on detected lockfile
