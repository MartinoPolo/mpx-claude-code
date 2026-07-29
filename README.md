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

### Machine Roots (`MPX_*`)

This repo is public, so personal absolute paths live in user-scope environment variables rather
than in any committed file. The [`machine-paths.js`](hooks/machine-paths.js) SessionStart hook
reads them and injects whichever are set into every session; unset ones are skipped silently, so
the setup is optional and portable.

| Variable             | Root                    |
| -------------------- | ----------------------- |
| `MPX_PROJECTS`       | Personal projects       |
| `MPX_WORK`           | Work repositories       |
| `MPX_CLONED`         | Cloned OSS repositories |
| `MPX_APPS`           | Local apps              |
| `MPX_ONEDRIVE`       | OneDrive root           |
| `MPX_AI_GENERATED`   | Skill-generated assets  |
| `MPX_OBSIDIAN_VAULT` | Obsidian vault          |

Set them once (PowerShell, user scope — survives reboots):

```powershell
[Environment]::SetEnvironmentVariable('MPX_PROJECTS', 'C:\your\projects', 'User')
```

Skills and agents reference these by name (`$MPX_WORK\...`). Markdown does **not** interpolate
environment variables, so a sub-agent resolves them at runtime with `env | grep '^MPX_'`. An unset
variable means "unavailable" — ask, do not guess.

## Workflow

```
/mp-grill                  ◄── Grill user on plan/design/requirements → update .mpx/ docs
        │
        ▼
/mp-to-prd                 ◄── CONTEXT.md → PRD as GitHub issue (with module design)
        │
        ▼
/mp-to-issues              ◄── PRD → vertical-slice sub-issues (HITL/AFK classified)
        │
        ▼
/mp-execute                ◄── Orchestrate TDD, checks, review, unresolved triage,
                            commit, push, PR, and CI-green auto-merge for issue-driven work
```

`/mp-commit-push-pr` and `/mp-pr` remain available as standalone Git workflows when implementation is already done and you only want to prepare or update a PR.

**For bugs:** `/mp-bug-report` investigates root cause, designs TDD fix plan, creates labeled issue.

**Cross-cutting:** `/mp-vocabulary` maintains canonical domain terms in `.mpx/CONTEXT.md` § Domain Language.

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
         │ 5) Verify-Fix Loop (one nested orchestrator sub-agent)         │
         │   mp-check-fixer: static checks + tests + 4 reviewers          │
         │   (--full-review: 7) + optional browser verify;                │
         │   fixes dispatched inside; returns bounded JSON only           │
         └─────────────────────────┬──────────────────────────────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 6) Unresolved Triage    │  issues only,
                        │    (conditional)        │  mp-unresolved-issue-tracker
                        └────────────┬────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 7) Commit + Push        │  mp-git-committer,
                        │                         │  refs/fixes #N
                        └────────────┬────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 8) PR + Mergeable       │  issues only, mp-pr-manager;
                        │                         │  conflict resolution delegated
                        └────────────┬────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 9) CI Green Gate        │  fix loop delegated to
                        │                         │  mp-ci-fixer
                        └────────────┬────────────┘
                                      │
                        ┌────────────▼────────────┐
                        │ 10) Finalize            │  report as PR comment,
                        │                         │  auto-merge (default)
                        └─────────────────────────┘
```

Pipeline summary:

1. Resolve input (`#issue`, milestone, or inline task/checklist)
2. Analyze issue context via `mp-issue-analyzer` (issues only)
3. Detect checks via `detect-check-scripts.sh` (supports `CHECK_ALL` fallback logic)
4. Execute TDD via `mp-tdd-executor` (unless `--no-tdd`)
5. Verify-fix loop in one nested orchestrator sub-agent (`mp-check-fixer`): static checks, tests, reviewers, optional browser verify — fixes applied inside
6. Triage unresolved items with `mp-unresolved-issue-tracker` (issues only)
7. Commit and push via `mp-git-committer`
8. Create/update PR via `mp-pr-manager`, then ensure mergeable (conflict resolution delegated)
9. CI green gate — failures fixed by the `mp-ci-fixer` sub-agent
10. Finalize: post the report as a PR comment, then auto-merge (default)

Since 2.0, the main agent is a pure orchestrator: the review-fix, test-fix, and CI-fix loops run inside nested sub-agents that return bounded JSON — main never reads raw findings, test failures, or CI logs.

**Flags:** `--no-tdd` skips TDD for trivial work, `--full-review` adds security/performance/error-handling reviewers (7 total), `--no-review` skips reviewer sub-agents, `--no-auto-merge` leaves the PR open instead of auto-merging after CI is green.

**TDD principles:** tests are still mandatory by default. `mp-execute` now delegates TDD execution to `mp-tdd-executor`, which enforces red-before-green and minimal implementation. See `skills/mp-execute/` for [test quality](skills/mp-execute/tests.md) and [mocking strategy](skills/mp-execute/mocking.md), and `skills/shared/` for [deep modules](skills/shared/deep-modules.md) and [interface design](skills/shared/interface-design.md).

## Planning System (Hybrid)

Planning uses GitHub Issues for tracking and local files for persistence:

**GitHub (tracking + execution):**

- **Milestones** = Epics
- **Issues** = Tasks (PRDs, sub-issues with blocking relationships)
- **Project Board** = Visual tracking

**Local `.mpx/` (persistent knowledge):**

```
.mpx/
├── CONTEXT.md           # Domain language, feature index, constraints (read-heavy)
└── DECISIONS.md         # Settled architectural decisions with rationale (write-heavy)
```

See `skills/shared/DOCUMENTATION_STRATEGY.md` for format details and skill responsibilities.

## Skills Reference

### Discoverability policy

A skill's `description` and `when_to_use` are the only parts of it that sit in **every**
session's context, in every repo. `disable-model-invocation: true` removes them entirely
while the skill stays invocable as `/name` — the documented behaviour is "description not
in context, full skill loads when you invoke".

Only these 13 skills stay model-invocable, because Claude benefits from reaching for them
unprompted:

`/mp-execute` · `/mp-review` · `/mp-check-fix` · `/mp-handoff` · `/mp-symlink` ·
`/mp-ship` · `/mp-skill-create` · `/mp-grill` · `/mp-issue-create` ·
`/mp-playwright-test` · `/mp-tutorial-create` · `/mp-podcast` · `/mp-video-to-image`

The other 36 are `/`-only and cost nothing. `/mp-ship` carries the trigger phrasing for
the whole git family, so `/mp-commit`, `/mp-commit-push`, `/mp-commit-push-pr`, `/mp-pr`
and `/mp-sync-base` stay available by name without each paying for a description.

Conventions for writing the two fields are in `skills/shared/AUTHORING.md`.

### Shared References (`skills/shared/`)

Cross-skill reference library — plain reference files, no SKILL.md, not runnable. Skills load them at run time via `${CLAUDE_SKILL_DIR}/../shared/<FILE>.md`:

| File                       | Purpose                                                                        |
| -------------------------- | ------------------------------------------------------------------------------ |
| `AUTHORING.md`             | Conventions shared by all skills and agents: naming, descriptions, size, versioning |
| `BOARD_CONVENTION.md`      | Obsidian board format, content→type map, four-lane pipeline                    |
| `deep-modules.md`          | Deep vs shallow module design (Ousterhout)                                     |
| `DOCUMENTATION_STRATEGY.md`| `.mpx/` CONTEXT.md + DECISIONS.md formats and skill responsibilities           |
| `EXECUTOR_CONTRACT.md`     | Shared contract for `mp-executor` + `mp-tdd-executor`: role boundary, parent inputs, output |
| `EXPLORATION.md`           | Canonical exploration policy: delegate to `Explore`, state breadth, `MPX_*` roots |
| `GIT_COMMIT_WORKFLOW.md`   | Phased commit/push/PR delegation shared by the git skills                      |
| `GITHUB_ISSUE_TEMPLATE.md` | Canonical issue body format, labels, HITL/AFK classification                   |
| `interface-design.md`      | Interface design rules for testability                                         |
| `PLAYWRIGHT_TESTING.md`    | Raw-Playwright reliability contract (sanity-gate, assert-don't-eyeball, auth)  |
| `REVIEWER_PROTOCOL.md`     | Verification discipline + report format for the 7 `mp-reviewer-*` agents       |
| `SUBAGENT_PROTOCOL.md`     | Verified rules for spawning sub-agents: model selection, tool grants, overrides |

### Planning Skills

| Skill              | Description                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `/mp-grill`        | Stress-test plan/design/requirements via relentless Q&A (auto-updates CONTEXT.md + DECISIONS.md)   |
| `/mp-to-prd`       | CONTEXT.md → PRD as GitHub issue (module design, implementation & testing decisions)               |
| `/mp-to-issues`    | Break PRD into vertical-slice sub-issues with HITL/AFK classification and blocking                 |
| `/mp-hitl`         | Resolve HITL issues into AFK-ready by grilling decisions (`lowest` or `most-blocking` order)       |
| `/mp-vocabulary`   | Create/update `.mpx/CONTEXT.md` § Domain Language — canonical domain terms, aliases, relationships |
| `/mp-issue-create` | Create well-structured GitHub issues (feature, chore, docs) with optional PRD linking              |
| `/mp-bug-report`   | Investigate root cause → TDD fix plan → GitHub issue (labeled bug). Accepts multiple bugs          |
| `/mp-prd-review`   | Comprehensive PRD-end review: code quality, architecture, cleanup, docs, unresolved items           |

### Execution Skills

| Skill         | Description                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/mp-execute` | Orchestrate issue execution: TDD via `mp-tdd-executor`, verify-fix loop, unresolved triage, commit, push, PR, CI green gate, auto-merge. `--no-tdd` to skip tests |

### Board Workflow (Obsidian)

Turn an Obsidian board (bug/task/feature notes with pasted screenshots) into GitHub issues and autonomous batch fixes. All three follow `skills/shared/BOARD_CONVENTION.md` (board format, content→type map, four-lane pipeline). The lane (`# To Process` → `# Ready to implement` → `# Manual testing` → `# Archive`) is the state machine; skills move items between lanes but never touch the checkbox, which is the user's own manual-verification flag.

| Skill                 | Description                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/mp-board-setup`     | One-time: create the vault board (four-lane skeleton) + `.mpx/BOARD.md` symlink and `.mpx/board-files` junction (both gitignored)                           |
| `/mp-board-to-issues` | Convert `# To Process` notes → labelled GitHub issues (merge, dedup, size, AFK/HITL), moving each item to `# Ready to implement` with `→ #N` appended       |
| `/mp-batch-execute`   | Autonomously implement a batch of AFK issues / the board's To Process items: sequential fix sub-agents on one branch, verify (checks + tests + code review via `/mp-review` + visual Playwright), one PR, then move items to `# Manual testing`. `--full-review` / `--no-review` |

### Testing Skills

| Skill                 | Description                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `/mp-playwright-test` | Reliable raw-Playwright visual verification over a scope (uncommitted / current PR / verbal area) — per-surface PASS/FAIL with measured values + screenshots |

`/mp-playwright-test` and `/mp-batch-execute`'s verify gate both follow `skills/shared/PLAYWRIGHT_TESTING.md` — the raw-Playwright reliability contract (stale-worktree sanity-gate, assert-don't-eyeball, programmatic auth, never `networkidle`). The MCP-based `mp-chrome-devtools-tester` agent is for exploratory testing only, and additionally covers performance traces and Lighthouse audits, which raw Playwright cannot do.

### Code Quality Skills

| Skill           | Description                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `/mp-check-fix` | Deterministically detect and run check scripts, then fix failures — `CHECK_ALL` first, else typecheck/lint/format/build ("check fix", "run checks and fix") |
| `/mp-review`    | Unified code review (scope: PR, branch, changes)                                                         |

### Periodic Maintenance Skills

Run after larger chunks of work (milestone end, PRD completion, or on a regular cadence). Sorted by human attention required — lowest first.

| Skill                     | Scope             | Attention | Notes                                                                  |
| ------------------------- | ----------------- | --------- | ---------------------------------------------------------------------- |
| `/mp-fallow-fix`          | Whole repo        | Low       | Auto-fixes dead code. Creates PR with findings.                        |
| `/mp-suppression-audit`   | Whole repo        | Low       | Audits eslint-disable, @ts-ignore, etc. Auto-fixes + creates PR.       |
| `/mp-consolidate-context` | `.mpx/CONTEXT.md` | Low       | Removes duplicates, tightens language. Fully automatic.                |
| `/mp-skill-audit`         | All skills        | Low       | Checks 15 consistency rules, auto-fixes drift. Creates report.         |
| `/mp-harvest-decisions`   | Last 30d sessions | Low       | Scans transcripts for decisions → CONTEXT.md + DECISIONS.md.           |
| `/mp-components-audit`    | Whole repo (UI)   | Medium    | Finds native elements / detached styles that should use design-system components, wrong variants, color-token bypass. Reports by default; `autofix` applies mechanical fixes. |
| `/mp-code-clean`          | Whole repo        | Medium    | Dead code removal, deduplication. Pass folder for focused scope.       |
| `/mp-decompose`           | Whole repo        | Medium    | Splits oversized files into modules. Pass file for focused scope.      |
| `/mp-architecture-review` | Whole repo        | High      | Interactive — grills about pain points, proposes deepening candidates. |

All maintenance skills (except architecture-review and components-audit) auto-fix findings and present a PR for review. `components-audit` reports by default and auto-fixes only when passed `autofix`.

### Design Skills

| Skill                | Description                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/mp-design-init`    | One-time per project — derives palette, font pairing, density, and motion from the app's domain into `designs/tokens.css` + `designs/DESIGN_SYSTEM.md` |
| `/mp-design-brief`   | Writes a component design brief (surrounding context, exhaustive states, component reuse map) and gates dependent issues with `Design needed` |
| `/mp-mockup`         | Generates N self-contained HTML variants from a brief — parallel `mp-ui-variant-generator` sub-agents when N > 1 |
| `/mp-design-refine`  | Applies refinements to a chosen variant → `refined.html` + `SUMMARY.md`, updates the brief, removes the design gate. `all` for batch mode |

Run in order: `init` (once) → `brief` → `mockup` → `refine`. Conventions shared by all four — the `designs/<component-name>/` layout, `DECISION.md`, project discovery, mockup HTML rules — live in `skills/shared/DESIGN_PIPELINE.md`.

### Git Skills

| Skill                | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| `/mp-commit`         | Stage and commit with conventional format                             |
| `/mp-commit-push`    | Commit and push (no PR)                                               |
| `/mp-pr`             | Create or update PR from existing commits (`draft` arg optional)      |
| `/mp-commit-push-pr` | Full workflow — commit, push, create/update PR (`draft` arg optional) |
| `/mp-sync-base`      | Merge target branch into current branch                               |
| `/mp-ship`           | Ship finished work: sync base, commit, push, PR, wait for CI green, merge |

`/mp-ship` delegates base sync to the `/mp-sync-base` skill and runs its CI-fix loop in a delegated `mp-ci-fixer` sub-agent — it watches CI green explicitly before merging (never `gh pr merge --auto` as the gate).

### Deprecated Skills

Retired skills, agents, hooks and scripts are archived (not deleted) under [`deprecated/`](deprecated/) — `deprecated/skills/`, `deprecated/agents/`, `deprecated/hooks/` and `deprecated/scripts/` — for history/reference. They are not installed and not runnable as-is. Highlights:

| Skill                          | Description                             |
| ------------------------------ | --------------------------------------- |
| `/mp-release`                  | Bump version, push tag, verify CI       |
| `/mp-grill-me`                 | Superseded by `/mp-grill`               |
| `/mp-grill-requirements`       | Superseded by `/mp-grill`               |
| `/mp-consolidate-requirements` | Superseded by `/mp-consolidate-context` |
| `/mp-design-ui-3`              | Superseded by the `/mp-design-brief` → `/mp-mockup` → `/mp-design-refine` pipeline |
| `/mp-gemini-fetch`             | Unused — fetched blocked sites via Gemini CLI |
| `/mp-publish-obsidian-plugin`  | Unused — published an Obsidian plugin to the community directory |
| `/mp-update-docs`              | Unused — doc-staleness review, now done inline per the same-change README rule |

See `deprecated/skills/` for the full list of retired skills and `deprecated/agents/` for retired agents.

`deprecated/scripts/` holds `status-line.sh` and `subagent-status-line.sh`, the bash renderers the
`.mts` ports replaced. They were kept in place only as the byte-parity reference the port was
validated against; once the renderers gained word-based states and declared-only effort checks, that
diff stopped being meaningful and the originals were archived. `status-line-mr-refresh.sh` is **not**
deprecated — it is still the detached child that refreshes MR/PR data.

### Setup Skills

| Skill                    | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `/mp-setup-sveltekit`    | Create SvelteKit project from template with GitHub setup     |
| `/mp-setup-react-native` | Create React Native monorepo from template with GitHub setup |
| `/mp-init-repo`          | Initialize git repo with .gitignore and .claude/ structure   |

### Utility Skills

| Skill                         | Description                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `/mp-handoff`                 | Create or update HANDOFF.md with session progress summary for continuity between sessions   |
| `/mp-tutorial-create`         | Generate interactive self-contained HTML tutorials (topic or code-showcase) from compact markdown source — quizzes, walkthroughs, theme-aware Mermaid diagrams, and an interactive CSS playground with Froggy-style challenges — compiled to `MPX_AI_GENERATED/_TUTORIALS/<category>/` with dashboard index |
| `/mp-podcast`                 | Turn a topic into a two-host educational podcast MP3 in its own `MPX_AI_GENERATED/_PODCASTS/<slug>/` folder alongside `script.txt` and `sources.md` — parallel topic research and a personalization sweep over own projects, Obsidian notes and cloned repos (work repos opt-in), a fact-dense brief plus customize prompt, NotebookLM generation with a Gemini multi-speaker TTS fallback, ffmpeg re-encode to 64 kbps mono |
| `/mp-video-to-image`          | Turn any YouTube video into a printable one-page sheet image — Gemini reads the video straight from its URL into `MPX_AI_GENERATED/_VIDEO_SHEETS/<slug>/` holding `<slug>.md` and `prompt.txt`, copies that prompt to the clipboard and opens ChatGPT for a zero-cost manual generation; `--mode exercise` extracts a workout into drawable start and end positions, `--mode generic` extracts any other video into illustrated points, and a `performer` description keeps the drawn figure looking like the presenter; yt-dlp subtitle + ffmpeg keyframe fallback when Gemini cannot see the video |
| `/mp-continue`                | Recover interrupted sub-agent / background work after a session-limit hit or crash, then continue |
| `/mp-skill-create`            | Create new skills with structured conventions (SKILL.md <200 lines, runs `/mp-skill-audit`) |
| `/mp-agent-create`            | Create new custom agents with structured conventions and review checklist                   |
| `/mp-script-discovery`        | Discover runnable scripts and dev servers (wraps `scripts/detect-project-scripts.sh`, single-sourced there) |
| `/mp-symlink`                 | Create & verify Windows symlinks/junctions the way that works in Claude Code (PowerShell `New-Item`, not `ln -s`/`mklink`) |
| `/mp-clean-pc`                | Full-disk cleanup sweep across 8 domains (caches, Docker/WSL, build output, apps, screenshots, duplicates, installers, system reclaim) — parallel scan sub-agents, ranked dashboard, per-group approval, Explorer thumbnail review for visual groups, quarantine instead of delete |
| `/mp-yoursafe-overview`       | (Personal) Regenerate the Yoursafe/Verotel onboarding HTML reference from live sources      |

### Vendored Skills

| Skill          | Description                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `/notebooklm`  | Third-party reference for the full `notebooklm-py` CLI surface, installed by that package and committed here so `/mp-podcast`'s link to it resolves in a fresh clone. Pinned to v0.7.3 — edits belong upstream, not here |

## Agents

| Agent                       | Model  | Effort | Description                                                                 |
| --------------------------- | ------ | ------ | --------------------------------------------------------------------------- |
| Explore                     | Sonnet | Low    | **Overrides the built-in `Explore`** — read-only codebase search            |
| mp-executor                 | Opus   | Low    | Applies pre-analyzed edits to a scoped task chunk                           |
| mp-check-fixer              | Opus   | High   | Pre-commit gate: checks, reviewers, tests, optional browser verify; dispatches fixes |
| mp-ci-fixer                 | Opus   | High   | Fixes a failing CI run on a PR branch, pushes, re-watches                   |
| mp-issue-analyzer           | Opus   | High   | Analyzes issues and codebase, creates execution plans                       |
| mp-issue-finder             | Sonnet | Low    | Finds issue matching a PR branch                                            |
| mp-tdd-executor             | Opus   | Medium | Executes strict TDD red-green-refactor loops for behaviors                  |
| mp-ui-variant-generator     | Opus   | Medium | Generates a single UI variant for one layout angle. Spawned in parallel by `/mp-mockup` |
| mp-chrome-devtools-tester   | Opus   | High   | Exploratory browser testing, perf traces and Lighthouse via chrome-devtools MCP |
| mp-checker                  | Haiku  | —      | Runs check commands and reports failures                                    |
| mp-context7-docs-fetcher    | Haiku  | —      | Fetches library docs via Context7 MCP                                       |
| mp-git-committer            | Haiku  | —      | Stages, commits, and optionally pushes with conventional commit format      |
| mp-pr-manager               | Sonnet | Low    | Creates or updates GitHub PRs with conventional title/body format           |
| mp-unresolved-issue-tracker | Sonnet | Low    | Routes unresolved implementation items to sibling issues or tracking issue  |
| mp-reviewer-best-practices  | Sonnet | Medium | Best practices and conventions reviewer (with language-specific references) |
| mp-reviewer-code-quality    | Sonnet | Medium | DRY, naming, maintainability reviewer                                       |
| mp-reviewer-error-handling  | Sonnet | Medium | Error handling and resilience reviewer                                      |
| mp-reviewer-performance     | Sonnet | Medium | Performance reviewer                                                        |
| mp-reviewer-security        | Sonnet | Medium | Security reviewer (OWASP-focused)                                          |
| mp-reviewer-spec-alignment  | Sonnet | Medium | Spec compliance and scope reviewer                                          |
| mp-reviewer-test-quality    | Sonnet | Medium | Test correctness, anti-patterns, redundancy, and mocking discipline reviewer|
| mp-scanner-architecture     | Sonnet | Medium | Lightweight architecture scanner for PRD-end review                         |

Agents are spawned automatically by Claude Code when task context matches their description.

`mp-check-fixer` and `mp-ci-fixer` are the only agents granted the `Agent` tool — both exist to keep
findings, test output and CI logs out of the caller's context, which requires spawning. That makes
them the repo's only exposure to the sub-agent nesting depth ceiling; re-verify both after a Claude
Code upgrade. See [`SUBAGENT_PROTOCOL.md`](skills/shared/SUBAGENT_PROTOCOL.md) § 5.

`effort:` is a frontmatter-only reasoning knob, independent of `Explore`'s breadth wording (`quick`/`medium`/`very thorough`) — see [`skills/shared/SUBAGENT_PROTOCOL.md`](skills/shared/SUBAGENT_PROTOCOL.md) § 10.

The table reflects a July 2026 benchmark (80 sub-agents) that settled three open questions in § 10.
The seven `mp-reviewer-*` agents are pinned to `effort: medium`: against a diff with ten seeded
defects, `medium` caught 10/10 where `low` caught 8/10, at the same cost as `high`, with zero false
positives at every level. `Explore`'s `effort: low` pin was confirmed on the real agent (it matches
`medium` for 27% less). Haiku stays on `mp-checker` and `mp-git-committer` — correct and cheaper —
but was 2.4× *more* expensive than sonnet on `mp-pr-manager`, which now runs sonnet.

Model choice by task category is § 11, cross-checked against
[DeepSWE v1.1](https://deepswe.datacurve.ai/) for implementation and
[Design Arena](https://www.designarena.ai/leaderboard) for design. Only `opus`, `sonnet`, `haiku`
are permitted — no `fable` — and `high` is the effort ceiling. Haiku supports no effort at all, so its
agents declare none.

Three findings drive the table. **Pick on horizon, not difficulty**: on bounded tasks cost scales
with tokens so the cheap model wins, but on long-horizon autonomous work it scales with wrong
turns, where Sonnet 5 runs $26.40/task against Opus 4.8's $13.22 while scoring *lower* (54% vs
59%) and Haiku scores ~0%. **Effort buys function, not looks**: a full low→medium→high sweep moves
aesthetic Elo by +15 and agentic Elo by +52, so design sits at `medium` — high enough to preserve
output detail, since effort throttles all output tokens and not just thinking. **The model gap
dwarfs the effort gap for design**: Opus 5 leads Sonnet 5 by ~130 Elo, roughly ten times what any
effort setting is worth.

One mechanic to keep in mind when authoring: **the `Agent` tool has no `effort` parameter.** Effort
is frontmatter-only, so `general-purpose`/`claude` spawns inherit the caller's effort and cannot
override it — writing `effort:` into a spawn instruction is a defect, not configuration.

[`scripts/usage-audit.mjs`](scripts/usage-audit.mjs) counts real skill and agent invocations across
the local session store, to tell live workflows from dead ones.

`mp-context7-docs-fetcher` is unbenchmarked: the context7 plugin had been installed against an
unrelated project path, so it registered no server in this repo despite being enabled. It is now
installed at user scope and connected, pending confirmation in a fresh session.

Each agent's `description` **and its `tools` list** are printed into the agent roster in
every session, so an enumerated MCP tool list is a standing context charge. Agents needing
MCP tools omit `tools` and use `disallowedTools` instead — see `skills/shared/AUTHORING.md`
§ Tool grants.

### Why `Explore` is overridden

Claude Code delegates to a built-in `Explore` agent on its own, without being asked, whenever a
question needs a broad codebase sweep. Since Claude Code v2.1.198 that built-in **inherits the
session model** (capped at Opus), so with `"model": "claude-opus-5[1m]"` in `settings.json` every
automatic exploration was running on Opus.

A user-level agent named `Explore` overrides the built-in and keeps its own `model`, so
[`agents/Explore.md`](agents/Explore.md) pins it to Sonnet. This is preferred over the
`CLAUDE_CODE_SUBAGENT_MODEL` env var, which is higher-priority but blunt — it would also force
`mp-issue-analyzer`, `mp-tdd-executor`, and `mp-ui-variant-generator` off Opus.

Call sites therefore **never pass `model` when spawning `Explore`** — see
[`skills/shared/EXPLORATION.md`](skills/shared/EXPLORATION.md).

Two gotchas, both verified against session transcripts:

- **`name` must be capitalised `Explore`.** A lowercase `explore` agent does not override the built-in.
- **`disallowedTools` subtracts from the full tool set**, not from the built-in's curated set — so an
  override must re-deny everything the built-in denied (`Agent`, `Artifact`, `ExitPlanMode`, `Edit`,
  `Write`, `NotebookEdit`) or it silently gains permissions the built-in withheld.

The override is confirmed working: bare `Explore` spawns resolve to `claude-sonnet-5` while the main
thread runs `claude-opus-5[1m]`, and every denied tool rejects on attempt with
`exists but is not enabled in this context`.

`scripts/analyze-subagent-models.py` parses `~/.claude/projects/**/*.jsonl` and reports which model
every spawned sub-agent actually ran on — the way to verify any of the above rather than assume it.
The measured rule: an explicit `model` parameter is obeyed 100% of the time, prose asking for a model
is obeyed 0% of the time. The full rule set lives in
[`skills/shared/SUBAGENT_PROTOCOL.md`](skills/shared/SUBAGENT_PROTOCOL.md), with every rule tagged
`TESTED`, `DOC`, or `UNVERIFIED`.

All 7 `mp-reviewer-*` agents read the shared `skills/shared/REVIEWER_PROTOCOL.md` (verification discipline + report format); role-specific judgment criteria stay in each agent file.

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
| `dangerous-command-guard.js` | PreToolUse (Bash)        | Blocks broad `rm -rf`, force-push to main/master, `git clean -fdx`, SQL DROP/TRUNCATE, fork bombs, and other irreversible commands |
| `fallow-gate.js`             | PreToolUse (Bash)        | Blocks `git commit`/`git push` when the fallow audit verdict is fail       |
| `format-lint-file.js`        | PostToolUse (Edit/Write) | Auto-formats and lints edited files (Vite Plus/Biome/Prettier/ESLint/Ruff) |
| `post-bash-context.js`       | PostToolUse (Bash)       | Enriches context after bash commands                                       |
| `notify-flash-beep.ps1`      | Stop                     | Flashes taskbar + plays notification sound (Windows)                       |
| `herdr-agent-state.ps1`      | SessionStart (*)         | Reports session state to the herdr integration (no-op unless `HERDR_ENV=1`) |

Hooks auto-detect the project toolchain (`vite-plus` | `biome` | `classic`) via `shared.js` and branch behavior accordingly. 4 of the 9 hook scripts have test suites in `hooks/__tests__/` (`dangerous-command-guard`, `enforce-pkg-mgr`, `post-bash-context`, `pre-commit-gate`); the rest do not.

`compact-context.js` was archived to `deprecated/hooks/` — it re-injected toolchain and convention reminders on `SessionStart (compact)`, but every line was already covered: the package-manager and `Grep`/`Read`/`Glob` reminders are enforced at point of use by `enforce-pkg-mgr.js`, the pre-commit check reminder by `pre-commit-gate.js`, and the git/PR conventions are re-read from `instructions/AGENTS.md` after compaction anyway. Steering what compaction *keeps* is now handled by the `## Compact instructions` block in `instructions/AGENTS.md`.

**Custom notification sound:** place a `.wav` file at `~/.claude/sounds/notify.wav` — falls back to a two-note console beep if missing.

## Template Repos

| Template                         | Stack                                                       | GitHub                                                                                                      |
| -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `template-sveltekit`             | SvelteKit + Vite Plus + Drizzle + Vitest + Playwright       | [MartinoPolo/template-sveltekit](https://github.com/MartinoPolo/template-sveltekit)                         |
| `template-react-native-monorepo` | React + RN + Expo + Hono + Gluestack + NativeWind + Drizzle | [MartinoPolo/template-react-native-monorepo](https://github.com/MartinoPolo/template-react-native-monorepo) |

Both include: Vite Plus toolchain (OxLint + Oxfmt + tsgolint), ESLint gap rules, Stylelint, knip, 80% coverage thresholds, `.claude/` with CLAUDE.md, `.mpx/` with CONTEXT.md + DECISIONS.md, GitHub Actions CI.

## Custom Status Line

![Status Line](assets/status-line.png)

Status bar showing:

- **Row 1**: Session name + short session id
- **Row 2**: Model · reasoning effort `<level>` · account (Personal/Work)
- **Row 3**: `📁 directory · IDE · 🔀 branch · MR/PR reference and its review state · CI state` — the directory name opens Explorer there, `IDE` opens VS Code there, the reference opens the MR/PR, the CI state opens its runs
- **Row 4**: Branch state — upstream relation · uncommitted counts · fetch age, e.g. `in sync · 2 staged · 28 modified · 9 untracked · 2h ago`
- **Row 5**: Context tokens `🔥 58k (6%)` — escalating color as context fills (yellow ≥100k, orange ≥140k, red ≥180k) — session cost (USD/CZK)
- **Row 6**: 5-hour & 7-day quota utilization with reset countdowns, e.g. `5h ████░░░░ 43% 1h 21m · 7d █████░░░ 61% 3d 0h`

A row with nothing to say is dropped rather than emitted blank — outside a repo the branch state has no content at all, so the rows below it move up.

**One separator, at every level.** `|` is gone: it drew a wall between fields that are merely adjacent, and once the git section spelled its states as words (`in sync 2 staged 28 modified`) something lighter was needed *inside* a section too. ` · ` (U+00B7, present in both Cascadia Mono and Consolas) now means "next field" everywhere, rather than two glyphs meaning two ranks of the same thing.

Branch state has **its own row** because those counts grow without bound during a working session and used to push the MR reference off the right edge of the location row.

**The directory name is the one white field.** It answers "where am I", the question asked most often and from the furthest away, so it gets the brightest foreground on the bar; every other field on that row stays grey. Emphasis by color alone means no glyph or box drawing has to carry it.

**Dim grey is for context, not signal.** Fetch age, MR cache age, quota reset countdowns, the quota cache age note and the session cost all render dim. They answer "how much do I trust the number beside me" or "what is the running total", neither of which asks anything of you; coloring them coral trains the eye to ignore coral everywhere else. The one exception is a quota cache old enough that the percentages themselves are wrong.

All values come straight from Claude Code's stdin JSON — model, session name/id, effort, context (`context_window.used_percentage` + `total_input_tokens`), cost, and quota (`rate_limits`). Lines added/removed (`cost.total_lines_*`) used to close the usage row as `+120 -34` and was dropped as noise — a session-wide edit total never changed a decision. `buildUsageLine` carries a comment saying how to restore it.

Quota reads from stdin `rate_limits` (no network call) with a cached last-known value, plus a background `/api/oauth/usage` fallback only for session cold-start — so the endpoint's aggressive rate limit is never hit during normal use. Cached readings older than 15m show a muted age note; older than 30m are flagged coral. Configured via `scripts/status-line.mts`.

### Clickable directory and IDE

The directory name and the `IDE` token beside it are OSC-8 hyperlinks. Clicking the name opens Explorer in the working directory; clicking `IDE` opens VS Code there.

Both are `file:` URLs, because Windows Terminal opens a hyperlink only when its scheme is `http`, `https` or `file` (`TerminalPage::_IsUriSupported`) — anything else raises an error dialog instead of reaching the registered handler, so `vscode://file/...` cannot be emitted directly. The workaround is a generated `$TMPDIR/claude-open-<key>.url` shortcut holding that `vscode:` URL: `.url` is bound to `InternetShortcut` on every Windows install, and opening one hands its URL back to the shell, which dispatches `vscode:` to `Code.exe --open-url`. The file is inert data — no script runs on click — and is rewritten every render, so a change of format cannot be shadowed by a stale file left in the temp directory.

A `.code-workspace` shim was tried first and silently opened whatever folder VS Code had open last: its ProgID is registered but no extension is bound to it, so the click had no handler at all.

The links terminate with `BEL` rather than the usual `ESC \`. Every line is emitted through `expandBackslashEscapes`, which would pair that trailing backslash with the first character of the label — a directory named `trace` would render as a tab followed by `race`, and one named `code` would truncate the whole line at `\c`.

### Branch signs and MR/PR block

```
📁 mpx-claude-code · IDE · 🔀 main
in sync · 2 staged · 28 modified · 9 untracked · 2h ago

📁 yoursafe-components · IDE · 🔀 martas/agentic-setup · !252 draft · ci run · 💬 3
↑3 · 2 staged · 16m ago
```

Upstream relation (one state, mutually exclusive): `local` no upstream · `in sync` · `↑3` ahead · `↓2` behind · `↑3↓2` diverged · `remote deleted` for an upstream that is configured but whose remote branch is gone. Then one segment per non-zero count — `n staged`, `n modified`, `n untracked`, `n conflicted` — and the age since the last fetch, hidden under 10m and always dim.

**Untracked files are counted.** `git status` runs with `--untracked-files=normal` rather than the index-only `=no`, which walks the working tree: measured at 98ms against 92ms on this repo, for the one class of uncommitted change the line could not otherwise show. `normal` (not `all`) collapses an untracked directory to a single entry, so the count matches what `git status` shows a human and a large unignored tree cannot inflate it.

MR/PR: `!N` (GitLab) or `#N` (GitHub), an OSC-8 hyperlink to the web URL, followed by one status token — `draft`, `conflicts`, `changes-req`, `approved`, `left/req approvals` outstanding, `mergeable`, or the raw merge status lowercased — then the pipeline state spelled out (`ci ok`, `ci fail`, `ci run`, `ci skip`) and colored, `💬 N` comments, and a dim `Nm ago` when the cached data is over 10m old.

**The status token binds to the reference, everything after it takes a separator.** `!252 draft` names one thing the way `📁 repo` does, so a space holds it together; CI, comments and the age note are separate facts about the branch and are fenced off by `·` like any other field.

**CI links to the provider's list of runs** — `<mr-url>/checks` on GitHub, `<mr-url>/pipelines` on GitLab. Both are paths under the MR/PR URL already in the cache, so the link costs no extra field and no extra API call. It targets the tab rather than the newest run: the tab is a valid destination while the run is still queued, and it shows the earlier attempts, which is what "why did this break" needs.

The render path is network-free: it reads a `$TMPDIR` cache and, when that cache is stale, spawns `scripts/status-line-mr-refresh.sh` detached to make one `glab api graphql` (GitLab) or `gh pr list` (GitHub) call. TTL 90s with a 30s floor between attempts. Measured: cache read ~0.5ms, the single `git status --porcelain=v2 --branch --untracked-files=normal` call ~98ms, the background API call ~0.7s. Rate limits are a non-issue — GitLab.com allows 2000 req/min and GitHub 5000 req/hour, against ~40 calls/hour/repo.

`in sync` is about *commits*, not files: it is porcelain-v2's `# branch.ab +0 -0`, meaning the branch's committed history matches its upstream tracking ref. Uncommitted work is reported separately by the counts beside it, so `in sync · 28 modified` is a normal, consistent reading.

Caveat: ahead/behind is measured against the *local* copy of the remote ref, so `in sync` stays true-looking until something fetches — which is exactly why the fetch age sits beside it.

## Sub-Agent Status Line

`scripts/subagent-status-line.mts` (settings key `subagentStatusLine`) renders one row per sub-agent in
the tasks panel — toggled with **Ctrl+T** — plus a session-wide tally. It answers "who is running
right now, on what model, at what effort, for how long", which the main status line cannot show.

```
● haiku                 0s 812 (0%)      haiku, inherited
● sonnet  ?high         0s 25.0k (12%)   sonnet, inherited
✓ sonnet  medium        0s 104.0k (52%)  sonnet, declared clean
● opus    !max          0s 152.0k (76%)  opus, declared max
    ^ effort above the high ceiling
● opus    120.0k        0s 40.0k (20%)   opus, numeric budget
× !fable  !max          0s 3.0k (1%)     fable, declared max
    ^ fable is never allowed;effort above the high ceiling
```

Columns: **status** (`●` running cyan, `✓` completed green, `×` failed/killed red) — **model** —
**effort** — **elapsed** — **context** — label. There is no marker column: a marker prefixes and
recolors the exact cell it accuses, which is why a `fable` row can carry two of them. Hanging a bare
`?` or `!` off the end put every mark as far from its value as the layout allowed, and reading it as
noise about the task label was the usual result; prefixing also hands those three columns back to
the description.

Colors: **model** — opus blue, sonnet yellow, haiku pink, fable orange. **Effort** — low green,
medium yellow, high orange, xhigh red, max purple, and cyan for a numeric token budget. **Context** —
escalates yellow ≥50%, orange ≥70%, red ≥90%, using each row's own `contextWindowSize` (the main
bar's absolute token cut-offs would mean different things on rows with different windows).

**Effort is the agent's own** — read from its frontmatter, via the per-task `effort` field added in
Claude Code **2.1.214**. An amber `?` prefix marks the one case where the value is not the agent's
own: the field is absent when the agent declared none and the session `effortLevel` was substituted,
so `?high` reads as "inherited". A numeric budget renders as `120.0k`. A blank effort cell means
haiku with no declared effort.

The **label** is the agent's live progress summary when it has one, falling back to `description` —
so the column tracks what the agent is doing now, not the static task title it was spawned with.

`tokenSamples` (a rolling history of `tokenCount`, one entry per refresh tick, capped at 16) is
**deliberately not rendered.** A sparkline of it has to be normalized against the row's own min/max,
because against a 1M context window every real sub-agent flatlines at the bottom — and that
normalization destroys scale, so `+200` tokens and `+200k` draw identically. Its real information
content is close to binary (moving vs. flat), which is not worth ten columns that the label uses
better.

Rows that violate a rule in `instructions/AGENTS.md` get a red `!` on the offending cell and a reason
line beneath: `!fable` on the model, `!max` on the effort for a level above the `high` ceiling or for
any effort declared on haiku. A numeric budget is exempt from both effort rules — it is a budget, not
a level.

**Finished agents.** Terminal rows stay in the payload for 30s (the bundle's eviction delay) and then
vanish. To outlive that, every task seen is accumulated into
`~/.claude/subagent-statusline-state/<session_id>.tsv`, and the `Σ` line reports the whole session:
agent count, breakdown by model tier and effort level, total tokens, and how many are still running.
A task's tokens and elapsed time freeze the first tick it is seen terminal, so a finished agent stops
accruing time. State files are pruned after 7 days, on the first tick of a new session. Because the
panel only renders rows for ids present in the current payload, the `Σ` line has nowhere of its own
to live and hangs off the last row — so it disappears with the last row, 30s after the final agent.

**No per-agent identity — a hard limit of the data, not a bug.** `.type` is always the literal string
`"local_agent"`, and `.name` is always `null` for Task-tool sub-agents (it is the `agentNameRegistry`
entry, which only teammates and named background agents get; it is rendered when present). Both
verified by capturing raw stdin payloads. The task object carries a real `agentType` internally — the
bundle filters on `agentType !== "main-session"` — but it is deliberately not copied into this
payload, and OTEL doesn't fill the gap either: its `gen_ai.turn.subagent_type` attribute is defined
but never populated ([anthropics/claude-code#14784](https://github.com/anthropics/claude-code/issues/14784)),
and OTEL is push-based batch export to an external collector regardless, unusable inside a
synchronous 5s tick. So *declared-vs-actual model drift* stays uncheckable here; only the tier/effort
rules that need no identity run.

To inspect the raw payload yourself, `touch ~/.claude/subagent-statusline-debug` — every tick is then
appended to `~/.claude/subagent-statusline-debug.jsonl`. Delete the marker file to stop. The gate is
a file rather than an env var because the panel runs the script from inside Claude Code, where there
is no shell in which to export one.

Output is JSONL, one `{"id","content"}` object per line, within a 5s timeout; ids left unemitted keep
the built-in `name · description · tokens` row. For history that survives the session entirely, use
`scripts/analyze-subagent-models.py`, which reads the same data from
`~/.claude/projects/**/*.jsonl` after the fact.

## Status Line Implementation

Both renderers are zero-dependency ESM TypeScript (`.mts`), run by Node's native type stripping — no
build step, no bundler, no `dist/`. `settings.json` invokes them as `node "$HOME/.claude/scripts/<name>.mts"`.
Requires Node ≥ 22.18; type stripping means **erasable syntax only** (no `enum`, no `namespace`, no
constructor parameter properties).

That `node` resolves per-directory under a version manager, so a repo whose `.nvmrc` pins a pre-22.18
version renders a blank status line: Node exits with `ERR_UNKNOWN_FILE_EXTENSION: Unknown file
extension ".mts"` and Claude Code sees empty stdout. Raise the project's pin.

They were bash until the process-spawn cost stopped being tolerable. Under Windows Git Bash every
`jq`, `awk`, `date`, `stat`, `git` and subshell is a full fork emulation, and both scripts run on
every render tick:

| Renderer | bash | TypeScript |
| --- | --- | --- |
| `status-line` | ~697 ms/render | ~198 ms/render |
| `subagent-status-line` | ~545 ms/render | ~144 ms/render |

The port also deleted a layer of workarounds that only existed to survive bash: packing 15 fields
through one `jq` call with an ASCII Unit Separator so `read` would not collapse empty ones, `awk` for
float formatting, `stat -c %Y` for cache mtimes, and manual `curl -i` header/body splitting. The
`0x1F` separator survives in the *on-disk cache formats* only, because existing caches use it.

`scripts/lib/statusline-ansi.mts` holds the small shared surface: the 256-color escape helper, stdin
reading, and the integer guard that reproduces bash's `[[ $x =~ ^[0-9]+$ ]]`. That predicate rejects
negatives, decimals, empty strings and `"null"` — it stays because nearly every numeric field is
gated on it, and a looser check would start rendering values the old line silently dropped.

Two bash behaviors are reproduced deliberately, because the on-disk cache formats and the numbers
users have grown used to both depend on them: `basename` under Git Bash treats a Windows `\` as a path
separator, and `printf '%.0f'` rounds half **to even**, so `0.5`→`0` and `2.5`→`2` where `toFixed`
would give `1` and `3`. (`printf '%b'` escape expansion is also reproduced, including `\c` truncating
the rest of the output — it is reachable from any branch or session name containing a backslash.)

### Glyph vocabulary

States are spelled as **words**, not dingbats, and every emoji is followed by a space. Two distinct
reasons, worth keeping apart:

**Correctness.** A character the terminal font lacks falls back to Segoe UI Emoji, which draws
double-width into the single cell the terminal reserved and smears over the text beside it. Measured
against Cascadia Mono — Windows Terminal's default when no `"face"` is set — exactly five of the
original glyphs were absent and had to go:

| Glyph | Was used for |
| --- | --- |
| `✎` U+270E | unstaged file count, MR draft |
| `⟳` U+27F3 | fetch age |
| `⊘` U+2298 | upstream deleted |
| `⇅` U+21C5 | branch diverged |
| `✗` U+2717 | changes requested; sub-agent `failed`/`killed` |

Real emoji (`📁 🔀 🔥 💬 ⚠`) come from the emoji font by design and are fine once spaced.

**Legibility.** `≡ ● ◐ ⬤ ⌂ ✓` do render in Cascadia Mono but were replaced anyway — none of them says
what it means, and the four CI states were the same `⬤` separated only by color, which a screenshot or
a colorblind reader loses entirely. Consolas is additionally missing `◐ ⬤ ✓`, so dropping them buys
portability against a face change. The sub-agent status column keeps `✓`/`×` because it is one cell
wide and has no room for words.

### Verifying a change

```bash
node scripts/verify-statusline.mts   # end-to-end: real executables, real stdin, installed symlink
npx vitest run scripts/__tests__     # 153 unit tests over the pure helpers
```

The harness began as a byte-parity golden diff against the bash originals, which is how the port was
validated. That contract ended deliberately once the renderers started spelling states as words and
gating effort drift on declared values — the originals moved to `deprecated/scripts/` and the diff
went with them. What remains is what unit tests structurally cannot reach: each fixture runs through
the real executable in a throwaway sandbox (`TMPDIR` + `CLAUDE_CONFIG_DIR`), asserting a clean exit,
valid JSONL with a row per task, no `undefined`/`NaN` leaking into a rendered line, and **no
fallback-prone glyph** — that last guard caught `✗` still sitting in the sub-agent status column.

It also smoke-tests the **installed** path, and that check earns its place: Claude Code invokes these
through `~/.claude/scripts`, a symlink to this repo. Node resolves `import.meta.url` to the link
target while leaving `process.argv[1]` as the link path, so an entry-point guard comparing the two
without `realpath` renders **nothing at all** — no error, no output, just a blank status line. Running
fixtures from the repo path cannot catch it.

### Sub-agent effort

The `effort` field in the `subagentStatusLine` payload is **present only when the agent's frontmatter
declares one**. The Agent tool has no per-spawn `effort` parameter (unlike `model`), so frontmatter is
the only source; an absent field means the agent inherits the session `effortLevel`, and the renderer
substitutes it and marks the value `?`.

Markers prefix and recolor the cell they accuse — there is no separate marker column, and a row can
carry one on each cell independently (`!fable` plus `?high` on the same row, which the old
single-slot design could not show because `!` outranked `?`).

| Marker | Cell | Meaning |
| --- | --- | --- |
| `!` red (fg 196) | model | `fable`, which is never allowed. Carries a `^ reason` line. |
| `!` red (fg 196) | effort | a *declared* value violates a rule — above the `high` ceiling, or declared on haiku. Carries a `^ reason` line. |
| `?` amber (fg 214) | effort | the value was substituted from the session `effortLevel` because the agent declared none. No reason line: inheriting is routine for `general-purpose`, `claude`, `Plan` and `fork`, and one per row would bury the real `!` rows. |
| unmarked | either | a declared value, no violation. |

Haiku with no declared effort renders a **blank** effort cell:
[the model-config table](https://code.claude.com/docs/en/model-config) lists effort levels per model
and states that models not listed do not support effort — no Haiku appears, so substituting one would
be fiction, and the blank is excluded from the session tally's effort grouping. Haiku that *declares*
an effort renders it as `!low`: blanking would hide the very thing being flagged, and it counts toward
the `Σ` tally like any other declared value.

Effort drift checks only ever judge *declared* values. Flagging a substituted one blames an agent for
a setting it never made, which is how every `general-purpose` row used to acquire a violation it had
no way to cause. The `fable` check is independent of effort and needs no declared value, since the
model is always reported.

## Settings

`settings.json` is the central configuration file. Contains environment variables, MCP plugins, hook definitions, and status line config. Installed to `~/.claude/settings.json`.

**Context budget:** `autoCompactWindow: 213000` caps the auto-compact window well below the 1M the model (`claude-opus-5[1m]`) actually carries. Auto-compaction fires at `window − 20,000 (output reserve) − 13,000 (fixed margin)` = **180,000 tokens used**; the hard block sits at `window − 3,000`.

Two constraints make 213000 the number rather than something smaller:

- An **explicitly configured** window below 200,000 makes Claude Code skip auto-compaction entirely (`if (window < 200000) return false` in the should-compact check) while still passing the settings schema's `min(1e5)` validation — a silent failure. 200,000 is a hard floor.
- Because of the fixed 33,000 of deductions, the lowest trigger reachable via the window alone is 167,000. Anything lower needs `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, which multiplies against the window (on a 1M model `"50"` means 500k, not 50k) — deliberately unset here.

**MCP plugins:** Context7 (library docs), TypeScript LSP. **Browser MCP:** chrome-devtools, registered at user scope (`claude mcp add`) and therefore loaded in every session; `mp-chrome-devtools-tester` uses that shared server. Scoping it to just that agent via inline `mcpServers:` frontmatter was measured to be inert on Claude Code 2.1.212 despite being documented — see `skills/shared/AUTHORING.md` § Tool grants. `ENABLE_TOOL_SEARCH: "auto:1"` keeps the cost to tool names only (~260 tokens), not full schemas. Reliable UI verification uses raw Playwright, not a browser MCP.

## Review System

`/mp-review` scopes to branch, uncommitted changes, or PR diff. Does not commit or post GitHub comments/reviews.

**Report file:** `REVIEW.md` (project root, actionable checklist). Only created when findings exist.

**7 review dimensions** (via parallel sub-agents, `full` coverage): code quality, best practices, spec alignment, test quality, security (OWASP), performance, error handling. `partial`/`half` coverage runs 4 (code quality, best practices, spec alignment, test quality). Each reviewer loads language-specific references when applicable.

**Confidence scoring** (0-100): >80 must fix, 66-80 should address, 40-65 worth reviewing, <40 minor/stylistic.

**Autofix:** When enabled, spawns `mp-executor` to fix findings, then re-runs reviewers — up to 3 iterations or until clean. Controlled via `autofix` param: explicit `autofix`/`autofix=true` → ON, `autofix=false` → OFF, omitted → auto (ON when <10 findings, OFF otherwise). Read-only when autofix is off.

## Testing

Hooks and scripts include test suites using Vitest (`package.json` + `vitest.config.ts`):

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

## Design System

A four-stage pipeline, adapted from the Grovekeeper/prejemesi project-local skills and generalized: `/mp-design-init` → `/mp-design-brief` → `/mp-mockup` → `/mp-design-refine`. Contract in `skills/shared/DESIGN_PIPELINE.md`.

The premise differs from the retired `/mp-design-ui-3`: the design system is fixed first by `init`, so variants explore **layout, density, hierarchy, and disclosure** within it rather than swapping whole aesthetics. That is why the old 18-style catalog was not carried over — it still sits in `deprecated/skills/mp-design-ui-3/style-catalog.md` for greenfield work.

Everything lands under `designs/<component-name>/` — the brief, `variants/variant-{a,b,c}.html`, `DECISION.md`, `refined.html`, `SUMMARY.md`. Briefs apply a `Design needed` label to dependent GitHub issues; `refine` removes it, unblocking implementation.

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
