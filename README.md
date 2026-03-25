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
/mp-execute                ◄── Pick phase, execute tasks (loop)
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
| `/mp-execute`              | Select phase, execute tasks (full phase or single)                              |
| `/mpx-add-requirements`    | Primary requirements skill (create/update SPEC + auto-parse)                    |
| `/mpx-report-issue-or-bug` | Track bugs/issues in .mpx/ phase system                                         |

### mp- Skills (General Purpose)

| Skill                     | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `/mp-commit`              | Stage and commit with conventional format        |
| `/mp-commit-push`         | Commit and push (no PR)                          |
| `/mp-pr`                  | Create or update draft PR from existing commits  |
| `/mp-commit-push-pr`      | Full workflow — commit, push, create/update PR   |
| `/mp-sync-base`           | Merge target branch into current branch          |
| `/mp-review`              | Unified code review (scope: PR, branch, changes) |
| `/mp-gh-issue-execute`    | Execute GitHub issues (bug/task/feature)         |
| `/mp-update-docs`         | Update README and documentation                  |
| `/mp-check-fix`           | Auto-detect and fix build/typecheck/lint errors  |
| `/mp-script-discovery`    | Discover runnable scripts and dev servers        |
| `/mp-handoff`             | Create ephemeral HANDOFF.md for session bridging |
| `/mp-execute`             | Execute task checklists via executor/reviewer agents |
| `/mp-decompose`           | Break down large files into logical modules      |
| `/mp-code-clean`          | Dead code removal and deduplication              |
| `/mp-gh-issue-branch-pr`  | Issue → branch → commit → push → PR             |
| `/mp-brainstorm`          | Exploration and design before implementation     |
| `/mp-grill-me`            | Stress-test a plan or design via relentless Q&A  |
| `/mp-publish-obsidian-plugin` | Publish Obsidian plugin to community directory |
| `/mp-gemini-fetch`        | Fetch blocked sites via Gemini CLI               |

## Agents

| Agent                        | Model  | Description                                        |
| ---------------------------- | ------ | -------------------------------------------------- |
| mp-executor                  | Opus   | Executes grouped task chunks                       |
| mpx-spec-analyzer            | Opus   | Analyzes specs and creates phase structure         |
| mpx-codebase-scanner         | Haiku  | Scans codebase for tech stack, features, structure |
| mpx-phase-reviewer           | Sonnet | Reviews completed phase diffs and quality          |
| mp-chrome-devtools-tester    | Sonnet | Browser test automation via Chrome DevTools MCP    |
| mp-gh-issue-analyzer         | Opus   | Analyzes GitHub issues, creates execution plans    |
| mp-gh-issue-finder           | Haiku  | Finds GitHub issue matching a PR branch            |
| mp-context7-docs-fetcher     | Haiku  | Fetches library docs via Context7 MCP              |
| mp-css-layout-debugger       | Opus   | CSS layout debugging                               |
| mp-checker                   | Haiku  | Runs check commands and reports failures           |
| mp-checks-detector           | Haiku  | Detects available check scripts                    |
| mp-docs-updater              | Sonnet | Updates docs after workflow/system changes         |
| mp-reviewer-full             | Opus   | Thorough multi-dimension code reviewer             |
| mp-reviewer-min              | Sonnet | Lightweight code reviewer                          |
| mp-reviewer-best-practices   | Sonnet | Best practices and conventions reviewer            |
| mp-reviewer-code-quality     | Sonnet | DRY, naming, maintainability reviewer              |
| mp-reviewer-error-handling   | Sonnet | Error handling and resilience reviewer             |
| mp-reviewer-performance      | Sonnet | Performance reviewer                               |
| mp-reviewer-security         | Sonnet | Security reviewer (OWASP-focused)                  |
| mp-reviewer-spec-alignment   | Sonnet | Spec compliance and scope reviewer                 |
| mp-ux-designer               | Opus   | UX research and design artifacts                   |
| mp-base-branch-detector      | Haiku  | Detect most likely base branch for current branch  |
| mp-bash-script-colorizer     | Haiku  | Bash script coloring guidelines                    |

Agents are auto-spawned based on rules in `AGENTS.md` — no manual invocation needed.

## Custom Status Line

![Status Line](assets/status-line.png)

4-line status bar showing:

- **Line 1**: Model name (colored)
- **Line 2**: Folder + git branch
- **Line 3**: Context usage bar (█/░), % tokens, session cost (USD/CZK)
- **Line 4**: 5-hour & 7-day quota utilization with reset countdowns

Configured via `scripts/context-bar.sh`.

## Hooks

Hook scripts in `hooks/` run automatically during Claude Code lifecycle events. Configured via `settings.json`.

| Hook | Event | Description |
| ---- | ----- | ----------- |
| `enforce-pkg-mgr.js` | PreToolUse (Bash) | Blocks wrong package manager commands (detects from lockfile) |
| `pre-commit-gate.js` | PreToolUse (Bash) | Runs typecheck before git commits |
| `format-lint-file.js` | PostToolUse (Edit/Write) | Auto-formats and lints edited files (Prettier/ESLint/Biome/Ruff) |
| `notify-flash-beep.ps1` | Stop, Notification | Flashes taskbar + plays notification sound (Windows) |
| `compact-context.js` | SessionStart (compact) | Re-injects project context after context compaction |

**Custom notification sound:** place a `.wav` file at `~/.claude/sounds/notify.wav` — falls back to a two-note console beep if missing.

## Settings

`settings.json` is the central configuration file. Contains environment variables, MCP plugins, hook definitions, and status line config. Installed to `~/.claude/settings.json`.

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
