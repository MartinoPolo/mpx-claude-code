# Documentation Strategy: CONTEXT.md + DECISIONS.md

Two-document system for project documentation consumed by AI agent skills.

## File Roles

### `.mpx/CONTEXT.md` — What This Project Is

Read-heavy. Every skill that needs project understanding reads this file. Target: **250–300 lines**.

Contains:

- **What This Is** — 3-sentence project summary
- **Domain Language** — One-line definitions using definition-list format (not tables)
- **Relationships** — Entity cardinalities (1:N, N:1)
- **Flagged Ambiguities** — Resolved term conflicts with rationale
- **Core Features** — Index only: feature name + status + epic# + design file pointer. Detail lives in epic issues
- **Key Constraints** — Settled facts about the system (SPA mode, single_instance, etc.)

Does NOT contain: implementation details, module maps, mermaid diagrams, tech stack minutiae, pixel specs.

### `.mpx/DECISIONS.md` — Why We Chose What We Chose

Write-heavy. Updated after grill sessions. Target: **200–300 lines**.

Contains settled architectural and design decisions with rationale. Each entry:

```markdown
### Decision title

Decided: YYYY-MM-DD
What: One sentence describing the choice.
Why: One sentence explaining the rationale.
Rejected: Brief list of alternatives considered and why they lost.
```

Does NOT contain: requirements, vocabulary, implementation specs, or anything that changes frequently.

## Domain Language Format

Use definition-list style, not tables:

```markdown
## Domain Language

**Workspace** — Top-level container: one GitHub repo + one project folder + one window.
**Issue** — Atomic work unit. One GitHub issue, one worktree, one branch, one color.
**Session** — One AI agent execution tied to an issue. Has transcript, cost, state.

_Avoid_: "task" for Issue, "project" for Workspace, "run" for Session.
```

Rules:

- One sentence max per definition
- Bold the term, em-dash, definition
- Group `_Avoid_` lines after each cluster of related terms
- No table headers, no columns, no "Aliases to Avoid" column

## Decision Entry Format

```markdown
## Section (e.g., Platform, UI, Data)

### Single process, multi-window via single_instance

Decided: 2026-04-28
What: One Tauri process, WebviewWindow per workspace.
Why: Shared SQLite, IPC between windows, simpler auth.
Rejected: Electron multi-process (too heavy), separate processes (IPC complexity).
```

Rules:

- Group by domain: Platform & Infrastructure, UI & Design, Data & State, Session & Providers
- 3–5 lines per entry (what/why/rejected)
- Date is when the decision was made, not when it was written down
- No "Status: Accepted" bureaucracy — everything in this file is accepted
- If a decision is reversed, delete the old entry and add the new one with a note

## Skill Responsibilities

| Skill                    | Reads                        | Updates                           |
| ------------------------ | ---------------------------- | --------------------------------- |
| `mp-grill`               | CONTEXT.md, DECISIONS.md     | Both (after user confirmation)    |
| `mp-vocabulary`          | CONTEXT.md                   | CONTEXT.md § Domain Language      |
| `mp-to-epic`             | CONTEXT.md, DECISIONS.md     | —                                 |
| `mp-epic-review`         | CONTEXT.md, DECISIONS.md     | CONTEXT.md (status updates)       |
| `mp-consolidate-context` | CONTEXT.md                   | CONTEXT.md (cleanup)              |
| `mp-harvest-decisions`   | Session JSONL files          | CONTEXT.md, DECISIONS.md          |
| `mp-init-repo`           | —                            | Creates CONTEXT.md + DECISIONS.md |
| `mp-setup-sveltekit`     | —                            | Creates CONTEXT.md + DECISIONS.md |
| `mp-setup-react-native`  | —                            | Creates CONTEXT.md + DECISIONS.md |
| `mp-handoff`             | CONTEXT.md, DECISIONS.md     | writes HANDOFF.md                 |
| `mp-bug-report`          | CONTEXT.md § Domain Language | —                                 |
| `mp-to-issues`           | CONTEXT.md § Domain Language | —                                 |

## Legacy Files

Older projects may still have `.mpx/REQUIREMENTS.md`, `.mpx/VOCABULARY.md`, or `.mpx/ARCHITECTURE.md`. Skills should **not** create, update, or fall back to these files. If encountered in an existing project, treat them as read-only historical context — the canonical sources are CONTEXT.md and DECISIONS.md.

When initializing a new project, only scaffold CONTEXT.md and DECISIONS.md.

## When to Split DECISIONS.md

If the file exceeds ~500 lines, split by domain into a `decisions/` directory:

- `decisions/platform.md`
- `decisions/ui-design.md`
- `decisions/data-state.md`
- `decisions/session-providers.md`

Until then, keep it as one file. Grovekeeper currently has ~50 decisions — well under the threshold.
