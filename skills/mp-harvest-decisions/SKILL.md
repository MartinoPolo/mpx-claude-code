---
name: harvest-decisions
description: "Scans recent Claude Code sessions for design discussions, folds the decisions into CONTEXT.md and DECISIONS.md, and flags redundant memory files."
argument-hint: "[days back to scan, default 30]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Agent, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "1.5"
  category: planning
---

# Harvest Decisions

Scan Claude Code session transcripts for grilling and design-refinement discussions. Extract decisions, categorize them, and update `.mpx/CONTEXT.md` and `.mpx/DECISIONS.md`.

## Step 1: Locate Sessions

1. Determine the Claude Code projects directory: `~/.claude/projects/`
2. Identify the current project's session directory by matching the working directory path
3. Also identify all worktree session directories (pattern: `*worktrees*` in the project name)
4. Parse `$ARGUMENTS` as days-back (default 30). Filter to session files modified within that window.

## Step 2: Find Grill Sessions

Spawn an `Explore` sub-agent (breadth: medium, no `model` param) to search session JSONL files for actual skill invocations — not just mentions in available-skills lists.

**Primary signal** (high confidence): `"name":"Skill"` paired with a grill / hitl / architecture-review skill in the same file. Match either the current form (`grill`, `hitl`, `architecture-review`, or the `/mp:grill` plugin form) or the historical `mp-`-prefixed form (`mp-grill`, `mp-hitl`, `mp-architecture-review`), so transcripts recorded before the plugin rename still match.

**Secondary signal** (check if primary yields <5 results): Look for `AskUserQuestion` tool calls with option arrays containing design/architecture decisions.

Have the agent record and return the file path and size for each matching session.

## Step 3: Extract Decisions (Parallel)

Spawn `general-purpose` sub-agents with `model: "sonnet"` to read session files in parallel. Group ~3-4 sessions per agent.

Each agent's prompt:

> Read these JSONL session files. Each line is a JSON object with `role` and `content` fields.
> Find all grill/design discussion segments by locating `AskUserQuestion` tool calls and the user's responses.
>
> For each decision found, extract:
> - **Topic**: What was being decided (e.g., "issue card color identity", "session chat layout")
> - **Question**: The question that was asked
> - **Answer**: The user's chosen answer
> - **Rationale**: Why this was chosen (if stated)
> - **Category**: One of: Platform, UI-Design, Data-State, Session-Providers, Workflow, Domain-Language
>
> Skip: tool call details, code output, implementation work. Only extract decision Q&A pairs.
>
> Output as a markdown list, one entry per decision.

## Step 4: Read Existing Docs

Read `.mpx/CONTEXT.md` and `.mpx/DECISIONS.md` to understand what's already documented. If either doesn't exist, create it using the templates from `skills/shared/DOCUMENTATION_STRATEGY.md`.

Also read any existing memory files in `~/.claude/projects/*/memory/project_*.md` for previously summarized decisions.

## Step 5: Merge & Deduplicate

With all raw extractions in hand:

1. **Categorize** by module/domain (Platform, UI, Data, Session, Workflow, Domain Language)
2. **Deduplicate** — same decision found across multiple sessions keeps the most detailed version
3. **Identify conflicts** — if two sessions decided differently on the same topic
4. **Cross-reference** — mark decisions already captured in CONTEXT.md or DECISIONS.md
5. **Flag gaps** — decisions in sessions not yet in any doc

## Step 6: Resolve Conflicts

If conflicts exist, present each one to the user via `AskUserQuestion`:

> **Conflict**: [topic]
> Session A (date): chose X because Y
> Session B (date): chose Z because W
> Which decision stands?

## Step 7: Update Docs

Present a summary of proposed changes before writing:

**CONTEXT.md updates:**
- New domain terms for § Domain Language — show each candidate entry (`**Term** — Definition.`) individually and ask the user whether to add it. Write only confirmed terms.
- New or updated feature entries for § Core Features
- New constraints for § Key Constraints

**DECISIONS.md updates:**
- New decision entries grouped by domain
- Format: `### Title` + `Decided: date` + `What:` + `Why:` + `Rejected:`

Ask user to confirm before writing. Apply edits to existing files, preserving their current content.

## Step 8: Clean Up Memory

If decisions were previously stored in memory files (`project_epic*_decisions.md`, `project_*_grilling.md`), suggest which memory files are now redundant since their content has been captured in the project docs.

## Report

Summarize:
- Sessions scanned / sessions with decisions
- Decisions extracted / new / already documented / conflicts resolved
- Docs updated (CONTEXT.md, DECISIONS.md)
- Memory files suggested for cleanup
