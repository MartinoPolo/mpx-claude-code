# mpx — Claude Code Customization Toolkit

A collection of skills, agents, hooks, scripts, and instructions that extend [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with GitHub-driven project workflows, TDD execution, and general-purpose dev tools.

**Two ways to use it:**

- **Full workflow** — requirements → PRD → GitHub issues → TDD execution → PR
- **Individual skills** — cherry-pick general-purpose tools (commits, PRs, reviews, design, etc.)

## Terms

| Term    | Meaning                                                                      |
| ------- | ---------------------------------------------------------------------------- |
| **PRD** | Product Requirements Document — structured spec created from requirements    |
| **TDD** | Test-Driven Development — write a failing test first, then implement to pass |
| **ADR** | Architecture Decision Record — documents _why_ a technical choice was made   |

### Issue Labels

| Label    | Meaning                                                                                  |
| -------- | ---------------------------------------------------------------------------------------- |
| **HITL** | Human In The Loop — issue requires human decisions (architecture, design, API contracts) |
| **AFK**  | Away From Keyboard — issue can be implemented and merged autonomously                    |

## Installation

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and working

## Workflow

```
/mp-grill-requirements     ◄── Raw requirements → grill user → structured REQUIREMENTS.md
        │
        ▼
/mp-requirements-to-prd    ◄── REQUIREMENTS.md → PRD as GitHub issue (with module design)
        │
        ▼
/mp-prd-to-issues          ◄── PRD → vertical-slice sub-issues (HITL/AFK classified)
        │
        ▼
/mp-execute                ◄── Orchestrate TDD, checks, review, unresolved triage,
                            commit, push, and PR creation for issue-driven work
```

`/mp-commit-push-pr` and `/mp-pr` remain available as standalone Git workflows when implementation is already done and you only want to prepare or update a PR.

**For bugs:** `/mp-bug-report` investigates root cause, designs TDD fix plan, creates labeled issue.

**Cross-cutting:** `/mp-glossary` maintains canonical domain terms in `GLOSSARY.md`.

Between sessions, use `/mp-handoff` to save context to `HANDOFF.md` for continuity.

### Execution Pipeline (`/mp-execute`)

`/mp-execute` is the core execution orchestrator — it executes one GitHub issue per run (or one inline task/checklist), while still accepting milestone input to select a single issue.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           /mp-execute #42                                │
└─────────────────────────────────┬────────────────────────────────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 1) Resolve Input        │  #issue, milestone, inline
                        └────────────┬────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 2) Analyze (issues)     │  mp-issue-analyzer
                        └────────────┬────────────┘
                                      │
                      open questions? yes -> ask user
                      library gaps?  yes -> mp-context7-docs-fetcher
                                      │
                        ┌────────────▼────────────┐
                        │ 3) Detect Checks        │  detect-check-scripts.sh
                        │                         │  (CHECK_ALL-aware)
                        └────────────┬────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 4) TDD Execution        │  mp-tdd-executor handles
                        │                         │  red-green-refactor loop
                        └────────────┬────────────┘
                                      │
                              --no-tdd? yes -> skip to 5
                                      │
         ┌─────────────────────────▼──────────────────────────────────────┐
         │ 5) Review + Check Loop (up to 3 iterations)                   │
         │   parallel: mp-checker + 3 reviewers                           │
         │   --hard-gate adds: security + performance + error-handling    │
         │   findings/confidence > 65 -> mp-executor fixes -> re-run      │
         └─────────────────────────┬──────────────────────────────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 6) Frontend Verify      │  if UI files changed ->
                        │    (conditional)        │  mp-playwright-tester
                        └────────────┬────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 7) Unresolved Triage    │  issues only,
                        │    (conditional)        │  mp-unresolved-issue-tracker
                        └────────────┬────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 8) Commit               │  conventional commit
                        │                         │  refs/fixes #N
                        └────────────┬────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 9) Push + PR            │  issues only,
                        │                         │  create or update PR
                        └────────────┬────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 10) Finalization        │  optional --docs ->
                        │                         │  mp-docs-updater
                        └─────────────────────────┘
```

Pipeline summary:

1. Resolve input (`#issue`, milestone, or inline task/checklist)
2. Analyze issue context via `mp-issue-analyzer` (issues only)
3. Detect checks via `detect-check-scripts.sh` (supports `CHECK_ALL` fallback logic)
4. Execute TDD via `mp-tdd-executor` (unless `--no-tdd`)
5. Run review + check loop with `mp-checker` and reviewers (up to 3 iterations)
6. Run conditional frontend verification with `mp-playwright-tester`
7. Triage unresolved items with `mp-unresolved-issue-tracker` (issues only)
8. Commit, then push and create/update PR (issues only)
9. Finalize and optionally run docs sync with `--docs` (Step 10)

**Flags:** `--no-tdd` skips TDD for trivial work, `--hard-gate` adds security/performance/error-handling reviewers (6 total), `--dry-run` analyzes without implementing, `--docs` runs docs sync during finalization.

**TDD principles:** tests are still mandatory by default. `mp-execute` now delegates TDD execution to `mp-tdd-executor`, which enforces red-before-green and minimal implementation. See `skills/mp-execute/` for [test quality](skills/mp-execute/tests.md), [mocking strategy](skills/mp-execute/mocking.md), [deep modules](skills/mp-execute/deep-modules.md), and [interface design](skills/mp-execute/interface-design.md).

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
└── decisions/           # Architecture Decision Records explaining _why_ choices were made
    └── 001-chose-drizzle.md
```

## Skills Reference

### Planning Skills

| Skill                     | Description                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `/mp-grill-me`            | Stress-test a plan or design via relentless Q&A                                              |
| `/mp-grill-requirements`  | Raw requirements → grill user → structured REQUIREMENTS.md (updates GLOSSARY.md if present)  |
| `/mp-requirements-to-prd` | REQUIREMENTS.md → PRD as GitHub issue (module design, implementation & testing decisions)    |
| `/mp-prd-to-issues`       | Break PRD into vertical-slice sub-issues with HITL/AFK classification and blocking           |
| `/mp-hitl`                | Resolve HITL issues into AFK-ready by grilling decisions (`lowest` or `most-blocking` order) |
| `/mp-glossary`            | Create/update GLOSSARY.md — canonical domain terms, aliases, relationships                   |
| `/mp-issue-create`        | Create well-structured GitHub issues (feature, chore, docs) with codebase context            |
| `/mp-bug-report`          | Investigate root cause → TDD fix plan → GitHub issue (labeled bug). Accepts multiple bugs    |

### Execution Skills

| Skill         | Description                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/mp-execute` | Orchestrate issue execution: TDD via `mp-tdd-executor`, reviewers/checks, unresolved triage, commit, push, and PR creation. `--no-tdd` to skip tests |

### Code Quality Skills

| Skill                     | Description                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/mp-check-fix`           | Auto-detect and fix checks, preferring `CHECK_ALL` when available; otherwise typecheck/lint/format/build |
| `/mp-review`              | Unified code review (scope: PR, branch, changes)                                                         |
| `/mp-architecture-review` | Explore codebase for shallow modules → parallel interface design → refactor GitHub issue                 |
| `/mp-decompose`           | Break down large files into logical modules                                                              |
| `/mp-code-clean`          | Dead code removal and deduplication                                                                      |

### Design Skills

| Skill             | Description                                                                        |
| ----------------- | ---------------------------------------------------------------------------------- |
| `/mp-design-ui-3` | Generate multiple UI variants in different visual styles using parallel sub-agents |

### Git Skills

| Skill                | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| `/mp-commit`         | Stage and commit with conventional format                             |
| `/mp-commit-push`    | Commit and push (no PR)                                               |
| `/mp-pr`             | Create or update PR from existing commits (`draft` arg optional)      |
| `/mp-commit-push-pr` | Full workflow — commit, push, create/update PR (`draft` arg optional) |
| `/mp-sync-base`      | Merge target branch into current branch                               |

### Deprecated Skills

| Skill         | Description                       |
| ------------- | --------------------------------- |
| `/mp-release` | Bump version, push tag, verify CI |

### Setup Skills

| Skill                    | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `/mp-setup-sveltekit`    | Create SvelteKit project from template with GitHub setup     |
| `/mp-setup-react-native` | Create React Native monorepo from template with GitHub setup |
| `/mp-init-repo`          | Initialize git repo with .gitignore and .claude/ structure   |

### Utility Skills

| Skill                         | Description                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `/mp-handoff`                 | Create or update HANDOFF.md with a general session summary for continuity                   |
| `/mp-update-docs`             | Update README and documentation                                                             |
| `/mp-skill-create`            | Create new skills with structured conventions (SKILL.md <200 lines, progressive disclosure) |
| `/mp-agent-create`            | Create new custom agents with structured conventions and review checklist                   |
| `/mp-script-discovery`        | Discover runnable scripts and dev servers                                                   |
| `/mp-gemini-fetch`            | Fetch blocked sites via Gemini CLI                                                          |
| `/mp-publish-obsidian-plugin` | Publish Obsidian plugin to community directory                                              |

## Agents

| Agent                       | Model  | Description                                                                 |
| --------------------------- | ------ | --------------------------------------------------------------------------- |
| mp-executor                 | Opus   | Executes grouped task chunks                                                |
| mp-issue-analyzer           | Opus   | Analyzes issues and codebase, creates execution plans                       |
| mp-issue-finder             | Haiku  | Finds issue matching a PR branch                                            |
| mp-tdd-executor             | Opus   | Executes strict TDD red-green-refactor loops for behaviors                  |
| mp-ui-variant-generator     | Opus   | Generates a single UI variant in a specific design style                    |
| mp-playwright-tester        | Sonnet | Browser test automation via Playwright MCP (headless, works remotely)       |
| mp-checker                  | Haiku  | Runs check commands and reports failures                                    |
| mp-context7-docs-fetcher    | Haiku  | Fetches library docs via Context7 MCP                                       |
| mp-docs-updater             | Sonnet | Updates docs after workflow/system changes                                  |
| mp-unresolved-issue-tracker | Sonnet | Routes unresolved implementation items to sibling issues or tracking issue  |
| mp-reviewer-best-practices  | Sonnet | Best practices and conventions reviewer (with language-specific references) |
| mp-reviewer-code-quality    | Sonnet | DRY, naming, maintainability reviewer                                       |
| mp-reviewer-error-handling  | Sonnet | Error handling and resilience reviewer                                      |
| mp-reviewer-performance     | Sonnet | Performance reviewer                                                        |
| mp-reviewer-security        | Sonnet | Security reviewer (OWASP-focused)                                           |
| mp-reviewer-spec-alignment  | Sonnet | Spec compliance and scope reviewer                                          |

Agents are spawned automatically by Claude Code when task context matches their description.

### Language-Specific Review References

Reviewers load framework-specific guides from `agents/references/` when relevant code is detected:

| Reference              | Scope                                                        |
| ---------------------- | ------------------------------------------------------------ |
| `typescript-review.md` | Type narrowing, generics, utility types, async patterns      |
| `react-review.md`      | Hooks discipline, RSC, React 19 Actions, TanStack Query v5   |
| `svelte-review.md`     | Svelte 5 runes, $state/$derived/$effect, component structure |
| `python-review.md`     | Type hints, async patterns, packaging                        |
| `rust-review.md`       | Ownership, lifetimes, error handling, async                  |

## Hooks

Hook scripts in `hooks/` run automatically during Claude Code lifecycle events. Configured via `settings.json`.

| Hook                         | Event                    | Description                                                                |
| ---------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `enforce-pkg-mgr.js`         | PreToolUse (Bash)        | Blocks wrong package manager commands (detects from lockfile)              |
| `pre-commit-gate.js`         | PreToolUse (Bash)        | Runs `check:all` (Vite Plus) or typecheck before git commits               |
| `dangerous-command-guard.js` | PreToolUse (Bash)        | Blocks dangerous git commands (force push, reset --hard, clean, branch -D) |
| `gh-transform.js`            | PreToolUse (Bash)        | Transforms GitHub API calls for compatibility                              |
| `format-lint-file.js`        | PostToolUse (Edit/Write) | Auto-formats and lints edited files (Vite Plus/Biome/Prettier/ESLint/Ruff) |
| `post-bash-context.js`       | PostToolUse (Bash)       | Enriches context after bash commands                                       |
| `notify-flash-beep.ps1`      | Stop                     | Flashes taskbar + plays notification sound (Windows)                       |
| `compact-context.js`         | SessionStart (compact)   | Re-injects project context after context compaction                        |

Hooks auto-detect the project toolchain (`vite-plus` | `biome` | `classic`) via `shared.js` and branch behavior accordingly. All hooks include test suites in `hooks/__tests__/`.

**Custom notification sound:** place a `.wav` file at `~/.claude/sounds/notify.wav` — falls back to a two-note console beep if missing.

## Template Repos

| Template                         | Stack                                                       | GitHub                                                                                                      |
| -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `template-sveltekit`             | SvelteKit + Vite Plus + Drizzle + Vitest + Playwright       | [MartinoPolo/template-sveltekit](https://github.com/MartinoPolo/template-sveltekit)                         |
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

**MCP plugins:** Context7 (library docs), TypeScript LSP. **MCP servers:** Playwright (browser testing, headless).

## Review System

`/mp-review` scopes to branch, uncommitted changes, or PR diff. Does not commit or post GitHub comments/reviews.

**Report file:** `REVIEW.md` (project root, actionable checklist). Only created when findings exist.

**6 review dimensions** (via parallel sub-agents): code quality, best practices, spec alignment, security (OWASP), performance, error handling. `partial` mode runs 3 (quality, best practices, spec alignment). Each reviewer loads language-specific references when applicable.

**Confidence scoring** (0-100): >80 must fix, 66-80 should address, 40-65 worth reviewing, <40 minor/stylistic.

**Autofix:** When enabled, spawns `mp-executor` to fix findings, then re-runs reviewers — up to 3 iterations or until clean. Controlled via `autofix` param: explicit `autofix`/`autofix=true` → ON, `autofix=false` → OFF, omitted → auto (ON when <10 findings, OFF otherwise). Read-only when autofix is off.

## Testing

Hooks and scripts include test suites using Vitest (`package.json` + `vitest.config.ts`):

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

## Design System

`/mp-design-ui-3` generates multiple UI variants in radically different visual styles using parallel sub-agents. Each variant is a fully functional component with fonts, colors, responsive layout, and all interactive states.

**18 built-in styles:** brutalism, cafe, cosmic, dashboard, doodle, editorial, energetic, glassmorphism, luxury, minimal, mono, neobrutalism, pacman, paper, contemporary, lingo, vintage, enterprise.

Auto-selection maximizes distance across 4 axes: theme polarity, typography family, density, and mood. Style catalog in `skills/mp-design-ui-3/style-catalog.md`.

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
