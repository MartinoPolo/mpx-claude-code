# mpx — Claude Code Customization Toolkit

A collection of skills, agents, scripts, and instructions that extend [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with GitHub-driven project workflows, TDD execution, and general-purpose dev tools.

**Two ways to use it:**

- **Full workflow** — requirements → PRD → GitHub issues → TDD execution
- **Individual skills** — cherry-pick general-purpose tools (commits, PRs, reviews, etc.)

## Installation

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and working

## Quick Start

**New SvelteKit project:**

```bash
# In Claude Code:
/mp-setup-sveltekit my-app
```

**New React + React Native monorepo:**

```bash
/mp-setup-react-native my-app
```

Both create a GitHub repo from a template, set up `main`/`dev` branches with protection, and verify all checks pass.

## Workflow

```
/mp-grill-requirements     ◄── Raw requirements → grill user → structured REQUIREMENTS.md
        │
        ▼
/mp-write-prd              ◄── REQUIREMENTS.md → PRD as GitHub issue
        │
        ▼
/mp-prd-to-issues          ◄── PRD → vertical-slice sub-issues with blocking
        │
        ▼
/mp-execute #42            ◄── TDD execution: red-green-refactor per issue
        │
        ▼
/mp-pr                     ◄── Create or update PR
```

Between sessions, use `/mp-handoff` to save context to `HANDOFF.md` for continuity.

## Planning System (Hybrid)

Planning uses GitHub Issues for tracking and local files for persistence:

**GitHub (tracking + execution):**
- **Milestones** = Epics
- **Issues** = Tasks (PRDs, sub-issues with blocking relationships)
- **Project Board** = Visual tracking

**Local `.mpx/` (persistent knowledge):**

```
.mpx/
├── REQUIREMENTS.md      # Persistent requirements (source of truth)
├── LESSONS_LEARNED.md   # Architectural knowledge
└── decisions/           # ADR-style decision records
    └── 001-chose-drizzle.md
```

- `REQUIREMENTS.md` — all project requirements, updated via `/mp-grill-requirements`
- `LESSONS_LEARNED.md` — hard-won architectural insights
- `decisions/` — Architecture Decision Records explaining *why* choices were made
- `HANDOFF.md` — ephemeral session bridge (project root, consumed by `/mp-execute`)

## Skills Reference

### Planning Skills

| Skill | Description |
| ----- | ----------- |
| `/mp-grill-requirements` | Raw requirements → grill user → structured REQUIREMENTS.md |
| `/mp-write-prd` | REQUIREMENTS.md → PRD as GitHub issue |
| `/mp-prd-to-issues` | Break PRD into vertical-slice sub-issues with blocking |
| `/mp-grill-me` | Stress-test a plan or design via relentless Q&A |

### Execution Skills

| Skill | Description |
| ----- | ----------- |
| `/mp-execute` | Unified TDD execution — accepts issues, milestones, or inline tasks |
| `/mp-check-fix` | Auto-detect and fix build/typecheck/lint errors |
| `/mp-review` | Unified code review (scope: PR, branch, changes) |

### Setup Skills

| Skill | Description |
| ----- | ----------- |
| `/mp-setup-sveltekit` | Create SvelteKit project from template with GitHub setup |
| `/mp-setup-react-native` | Create React Native monorepo from template with GitHub setup |
| `/mpx-init-repo` | Initialize git repo with .gitignore and .claude/ structure |

### Git Skills

| Skill | Description |
| ----- | ----------- |
| `/mp-commit` | Stage and commit with conventional format |
| `/mp-commit-push` | Commit and push (no PR) |
| `/mp-pr` | Create or update draft PR from existing commits |
| `/mp-commit-push-pr` | Full workflow — commit, push, create/update PR |
| `/mp-sync-base` | Merge target branch into current branch |
| `/mp-release` | Bump version, push tag, verify CI |
| `/mp-gh-issue-branch-pr` | Issue → branch → commit → push → PR |

### Utility Skills

| Skill | Description |
| ----- | ----------- |
| `/mp-handoff` | Create ephemeral HANDOFF.md for session bridging |
| `/mp-update-docs` | Update README and documentation |
| `/mp-script-discovery` | Discover runnable scripts and dev servers |
| `/mp-decompose` | Break down large files into logical modules |
| `/mp-code-clean` | Dead code removal and deduplication |
| `/mp-gh-issue-create` | Create well-structured GitHub issues |
| `/mp-gemini-fetch` | Fetch blocked sites via Gemini CLI |
| `/mp-publish-obsidian-plugin` | Publish Obsidian plugin to community directory |

## Agents

| Agent | Model | Description |
| ----- | ----- | ----------- |
| mp-executor | Opus | Executes grouped task chunks |
| mpx-codebase-scanner | Haiku | Scans codebase for tech stack, features, structure |
| mp-chrome-devtools-tester | Sonnet | Browser test automation via Chrome DevTools MCP |
| mp-gh-issue-analyzer | Opus | Analyzes GitHub issues, creates execution plans |
| mp-gh-issue-finder | Haiku | Finds GitHub issue matching a PR branch |
| mp-context7-docs-fetcher | Haiku | Fetches library docs via Context7 MCP |
| mp-css-layout-debugger | Opus | CSS layout debugging |
| mp-checker | Haiku | Runs check commands and reports failures |
| mp-checks-detector | Haiku | Detects available check scripts |
| mp-docs-updater | Sonnet | Updates docs after workflow/system changes |
| mp-reviewer-full | Opus | Thorough multi-dimension code reviewer |
| mp-reviewer-min | Sonnet | Lightweight code reviewer |
| mp-reviewer-best-practices | Sonnet | Best practices and conventions reviewer |
| mp-reviewer-code-quality | Sonnet | DRY, naming, maintainability reviewer |
| mp-reviewer-error-handling | Sonnet | Error handling and resilience reviewer |
| mp-reviewer-performance | Sonnet | Performance reviewer |
| mp-reviewer-security | Sonnet | Security reviewer (OWASP-focused) |
| mp-reviewer-spec-alignment | Sonnet | Spec compliance and scope reviewer |
| mp-ux-designer | Opus | UX research and design artifacts |
| mp-base-branch-detector | Haiku | Detect most likely base branch |
| mp-bash-script-colorizer | Haiku | Bash script coloring guidelines |

Agents are spawned automatically by Claude Code when task context matches their description.

## Hooks

Hook scripts in `hooks/` run automatically during Claude Code lifecycle events. Configured via `settings.json`.

| Hook | Event | Description |
| ---- | ----- | ----------- |
| `enforce-pkg-mgr.js` | PreToolUse (Bash) | Blocks wrong package manager commands (detects from lockfile) |
| `pre-commit-gate.js` | PreToolUse (Bash) | Runs `check:all` (Vite Plus) or typecheck before git commits |
| `format-lint-file.js` | PostToolUse (Edit/Write) | Auto-formats and lints edited files (Vite Plus/Biome/Prettier/ESLint/Ruff) |
| `notify-flash-beep.ps1` | Stop | Flashes taskbar + plays notification sound (Windows) |
| `compact-context.js` | SessionStart (compact) | Re-injects project context after context compaction |

Hooks auto-detect the project toolchain (`vite-plus` | `biome` | `classic`) via `shared.js` and branch behavior accordingly.

**Custom notification sound:** place a `.wav` file at `~/.claude/sounds/notify.wav` — falls back to a two-note console beep if missing.

## Template Repos

| Template | Stack | GitHub |
| -------- | ----- | ------ |
| `template-sveltekit` | SvelteKit + Vite Plus + Drizzle + Vitest + Playwright | [MartinoPolo/template-sveltekit](https://github.com/MartinoPolo/template-sveltekit) |
| `template-react-native-monorepo` | React + RN + Expo + Hono + Gluestack + NativeWind + Drizzle | [MartinoPolo/template-react-native-monorepo](https://github.com/MartinoPolo/template-react-native-monorepo) |

Both include: Vite Plus toolchain (OxLint + Oxfmt + tsgolint), ESLint gap rules, Stylelint, knip, 80% coverage thresholds, `.claude/` with CLAUDE.md, `.mpx/` with REQUIREMENTS.md, GitHub Actions CI.

## Custom Status Line

![Status Line](assets/status-line.png)

4-line status bar showing:

- **Line 1**: Model name (colored)
- **Line 2**: Folder + git branch
- **Line 3**: Context usage bar, % tokens, session cost (USD/CZK)
- **Line 4**: 5-hour & 7-day quota utilization with reset countdowns

Configured via `scripts/context-bar.sh`.

## Settings

`settings.json` is the central configuration file. Contains environment variables, MCP plugins, hook definitions, and status line config. Installed to `~/.claude/settings.json`.

## Review Skills

Review skill (`/mp-review`) is read-only except writing `REVIEW.md` and does not commit or post GitHub comments/reviews.

**Report file:** `REVIEW.md` (project root, actionable checklist).

**Categories checked:** tech stack best practices, security (OWASP top 10), performance, error handling, code quality.

**Confidence scoring** (0-100): >80 must fix, 66-80 should address, 40-65 worth reviewing, <40 minor/stylistic.

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
