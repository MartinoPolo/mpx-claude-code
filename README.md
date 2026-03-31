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
/mp-execute                ◄── Implement with TDD, run reviews and checks, commit
        │
        ▼
/mp-commit-push-pr         ◄── Commit, push, create/update PR
```

**For bugs:** `/mp-bug-report` investigates root cause, designs TDD fix plan, creates labeled issue.

**Cross-cutting:** `/mp-glossary` maintains canonical domain terms in `GLOSSARY.md`.

Between sessions, use `/mp-handoff` to save context to `HANDOFF.md` for continuity.

### Execution Pipeline (`/mp-execute`)

`/mp-execute` is the core skill — it takes a GitHub issue (or inline task) and drives it through TDD implementation, parallel code review, automated checks, optional frontend verification, and commit. The full internal pipeline:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        /mp-execute #42                                  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   1. Resolve Input    │  GitHub issue(s), milestone,
                    │                       │  or inline task description
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   2. Analyze          │  mp-issue-analyzer explores
                    │   (issues only)       │  codebase, classifies type,
                    │                       │  creates execution plan
                    └───────────┬───────────┘
                                │
                       open questions? ──yes──► ask user (clarification gate)
                       library gaps?   ──yes──► mp-context7-docs-fetcher
                                │
                    ┌───────────▼───────────┐
                    │   3. Detect Checks    │  detect-check-scripts.sh finds
                    │                       │  available build/lint/type cmds
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   4. TDD Loop         │  red-green-refactor per behavior
                    │                       │
                    │   for each behavior:  │
                    │     RED   → write test, verify it FAILS
                    │     GREEN → minimal code to PASS
                    │     REFACTOR → clean up, tests still pass
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────────────────────────────────┐
                    │   5. Review + Check Loop  (up to 3 iterations)   │
                    │                                                   │
                    │   parallel:                                       │
                    │   ┌─────────────────┐  ┌───────────────────────┐  │
                    │   │ mp-checker      │  │ mp-reviewer-code-     │  │
                    │   │ (build/lint/    │  │   quality              │  │
                    │   │  typecheck)     │  │ mp-reviewer-best-     │  │
                    │   │                 │  │   practices            │  │
                    │   │                 │  │ mp-reviewer-spec-     │  │
                    │   │                 │  │   alignment            │  │
                    │   └─────────────────┘  └───────────────────────┘  │
                    │                                                   │
                    │   with --hard-gate, also:                         │
                    │   mp-reviewer-security, -performance,             │
                    │   -error-handling (6 reviewers total)             │
                    │                                                   │
                    │   findings (confidence > 65)?                     │
                    │     → mp-executor fixes → re-run failed checks   │
                    └───────────┬───────────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   6. Frontend Check   │  if .svelte/.tsx/.jsx/.vue/.css
                    │   (conditional)       │  changed → start dev server →
                    │                       │  mp-playwright-tester (headless)
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   7. Commit           │  conventional commit format
                    │                       │  refs #N / fixes #N
                    └───────────┬───────────┘
                                │
                         more issues? ──yes──► next unblocked issue (repeat 2–7)
                                │
                    ┌───────────▼───────────┐
                    │   8. Finalization      │  mp-docs-updater (if needed),
                    │                       │  summary report
                    └───────────────────────┘
```

**Flags:** `--no-tdd` skips the TDD loop (trivial changes), `--hard-gate` adds 3 extra reviewers (security, performance, error handling), `--dry-run` analyzes and plans without implementing.

**TDD principles:** tests are not optional — every behavior gets a test before implementation. Never modify tests to make them pass; fix the implementation. See `skills/mp-execute/` for detailed guides on [test quality](skills/mp-execute/tests.md), [mocking strategy](skills/mp-execute/mocking.md), [deep modules](skills/mp-execute/deep-modules.md), and [interface design](skills/mp-execute/interface-design.md).

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
├── LESSONS_LEARNED.md   # Knowledge gathered on the way
└── decisions/           # Architecture Decision Records explaining _why_ choices were made
    └── 001-chose-drizzle.md
```

## Skills Reference

### Planning Skills

| Skill                     | Description                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `/mp-grill-me`            | Stress-test a plan or design via relentless Q&A                                             |
| `/mp-grill-requirements`  | Raw requirements → grill user → structured REQUIREMENTS.md (updates GLOSSARY.md if present) |
| `/mp-requirements-to-prd` | REQUIREMENTS.md → PRD as GitHub issue (module design, implementation & testing decisions)   |
| `/mp-prd-to-issues`       | Break PRD into vertical-slice sub-issues with HITL/AFK classification and blocking          |
| `/mp-glossary`            | Create/update GLOSSARY.md — canonical domain terms, aliases, relationships                  |
| `/mp-issue-create`        | Create well-structured GitHub issues (feature, chore, docs) with codebase context           |
| `/mp-bug-report`          | Investigate root cause → TDD fix plan → GitHub issue (labeled bug). Accepts multiple bugs   |

### Execution Skills

| Skill         | Description                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/mp-execute` | Implement issues with TDD, parallel code review (up to 6 reviewers), run all checks, commit per issue. `--no-tdd` to skip tests |

### Code Quality Skills

| Skill                     | Description                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `/mp-check-fix`           | Auto-detect and fix build/typecheck/lint errors                                          |
| `/mp-review`              | Unified code review (scope: PR, branch, changes)                                         |
| `/mp-architecture-review` | Explore codebase for shallow modules → parallel interface design → refactor GitHub issue |
| `/mp-decompose`           | Break down large files into logical modules                                              |
| `/mp-code-clean`          | Dead code removal and deduplication                                                      |

### Design Skills

| Skill                 | Description                                                                        |
| --------------------- | ---------------------------------------------------------------------------------- |
| `/mp-design-ui-3` | Generate multiple UI variants in different visual styles using parallel sub-agents |

### Git Skills

| Skill                | Description                                     |
| -------------------- | ----------------------------------------------- |
| `/mp-commit`         | Stage and commit with conventional format       |
| `/mp-commit-push`    | Commit and push (no PR)                         |
| `/mp-pr`             | Create or update draft PR from existing commits |
| `/mp-commit-push-pr` | Full workflow — commit, push, create/update PR  |
| `/mp-sync-base`      | Merge target branch into current branch         |

### Deprecated Skills

| Skill         | Description                          |
| ------------- | ------------------------------------ |
| `/mp-release` | Bump version, push tag, verify CI    |

### Setup Skills

| Skill                    | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `/mp-setup-sveltekit`    | Create SvelteKit project from template with GitHub setup     |
| `/mp-setup-react-native` | Create React Native monorepo from template with GitHub setup |
| `/mp-init-repo`          | Initialize git repo with .gitignore and .claude/ structure   |

### Utility Skills

| Skill                         | Description                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `/mp-handoff`                 | Create ephemeral HANDOFF.md for session bridging                                            |
| `/mp-update-docs`             | Update README and documentation                                                             |
| `/mp-skill-create`            | Create new skills with structured conventions (SKILL.md <200 lines, progressive disclosure) |
| `/mp-agent-create`            | Create new custom agents with structured conventions and review checklist                    |
| `/mp-script-discovery`        | Discover runnable scripts and dev servers                                                   |
| `/mp-gemini-fetch`            | Fetch blocked sites via Gemini CLI                                                          |
| `/mp-publish-obsidian-plugin` | Publish Obsidian plugin to community directory                                              |

## Agents

| Agent                      | Model  | Description                                                                |
| -------------------------- | ------ | -------------------------------------------------------------------------- |
| mp-executor                | Opus   | Executes grouped task chunks                                               |
| mp-issue-analyzer          | Opus   | Analyzes issues and codebase, creates execution plans                      |
| mp-issue-finder            | Haiku  | Finds issue matching a PR branch                                           |
| mp-ui-variant-generator    | Opus   | Generates a single UI variant in a specific design style                   |
| mp-playwright-tester       | Sonnet | Browser test automation via Playwright MCP (headless, works remotely)      |
| mp-checker                 | Haiku  | Runs check commands and reports failures                                   |
| mp-context7-docs-fetcher   | Haiku  | Fetches library docs via Context7 MCP                                      |
| mp-docs-updater            | Sonnet | Updates docs after workflow/system changes                                 |
| mp-reviewer-best-practices | Sonnet | Best practices and conventions reviewer (with language-specific references)|
| mp-reviewer-code-quality   | Sonnet | DRY, naming, maintainability reviewer                                      |
| mp-reviewer-error-handling | Sonnet | Error handling and resilience reviewer                                     |
| mp-reviewer-performance    | Sonnet | Performance reviewer                                                       |
| mp-reviewer-security       | Sonnet | Security reviewer (OWASP-focused)                                          |
| mp-reviewer-spec-alignment | Sonnet | Spec compliance and scope reviewer                                         |

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

**MCP plugins:** Context7 (library docs), GitHub, TypeScript LSP. **MCP servers:** Playwright (browser testing, headless).

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
