---
name: mpx-parse-spec
description: Parse SPEC.md into phased implementation. Creates phase folders + ROADMAP.md.
disable-model-invocation: false
allowed-tools: Read, Write, Bash
metadata:
  author: MartinoPolo
  version: "0.1"
  category: project-management
---

# Parse Specification

Convert SPEC.md into a phased implementation plan with tracking files.

## Iron Law

**DOCUMENTATION ONLY.** Creates/updates `.mpx/` files only. Never modifies source code.

## Prerequisites

- `.mpx/SPEC.md` must exist

## Workflow

### Step 1: Read and Analyze SPEC.md

Read `.mpx/SPEC.md` and extract:

- Project name
- Tech stack
- Core features
- Technical requirements

### Step 2: Create Phase Structure

Create the following:

- `.mpx/ROADMAP.md` (phase overview + tracking + decisions + blockers)
- `.mpx/phases/` directory with **phase folders**

Smaller projects may have just 1-2 phases; larger projects may have more.

### Step 3: Create Files

**ROADMAP.md** (phase overview + tracking + decisions + blockers):

```markdown
# Implementation Roadmap

Project: [Name]
Generated: [Date]
Total Phases: N

## Overview

[Brief summary of the full implementation approach]

## Phases

- [ ] **Phase 1: Foundation** — N tasks | Dependencies: None
- [ ] **Phase 2: [Feature]** — N tasks | Dependencies: Phase 1
- [ ] **Phase 3: [Feature]** — N tasks | Dependencies: Phase 2
- [ ] **Phase 4: Polish** — N tasks | Dependencies: Phase 3

## Dependency Graph

Phase 1 (Foundation) → Phase 2 (Core) → Phase 3 (Secondary) → Phase 4 (Polish)

## Phase Details

### Phase 1: Foundation

**Goal:** Set up project infrastructure
**Deliverables:** Working dev environment, basic project structure

### Phase 2: [Feature Name]

**Goal:** Implement core functionality
**Deliverables:** [Specific outputs]

[Continue for all phases...]

## Decisions

[Project-level decisions with reasoning]

## Blockers

None
```

**Phase Folders** (`.mpx/phases/01-foundation/`):

Each phase gets its own folder with a single CHECKLIST.md file — the single source of truth for phase specs, tasks, and state.

**CHECKLIST.md** (specs + tasks + state):

```markdown
# Phase 1: Foundation

**Status:** Not Started
**Dependencies:** None

## Objective

Set up the project infrastructure and development environment.

## Scope

- Initialize project, build tools, dev environment

## Out of Scope

- Feature implementation, production deployment

---

## Tasks

### Setup

- [ ] Initialize project and install dependencies
      Create project config, add runtime/dev dependencies per tech stack.

- [ ] Configure TypeScript/linting
      Set up tsconfig.json strict mode, ESLint, Prettier.

### Project Structure

- [ ] Create directory structure and entry point
      Set up src/, tests/, config/. Create main entry point.

### Completion Criteria

- [ ] Project builds without errors
- [ ] Dev server runs successfully

---

Progress: 0/N tasks complete

## Decisions

[Phase-specific decisions]

## Blockers

None
```

### Step 4: Update CLAUDE.md

If `.claude/CLAUDE.md` exists and has template content, update it with actual project information from SPEC.md.

### Step 5: Summary

Report what was created:

> "Created phased implementation plan:
>
> - `.mpx/ROADMAP.md` - Phase overview, dependencies, tracking, decisions, and blockers
> - `.mpx/phases/` - Phase folders with CHECKLIST.md each
>
> **Phases Created:**
>
> 1. Foundation (N tasks)
> 2. [Feature] (N tasks)
>    ...
>
> Run `/mp-execute mpx` to start with the first task."

## Task Breakdown Guidelines

When breaking features into tasks, ensure:

- Each task is atomic and completable in one sitting
- Tasks have clear completion criteria
- Dependencies between tasks are noted
- Setup tasks come before feature tasks
- Testing tasks are included for each feature
- Polish/cleanup tasks come at the end

## Phase Folder Structure Summary

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

## Notes

- All files are created in `.mpx/` directory
- Never create duplicate files in project root
- If files already exist, ask before overwriting
- Phase folders should be numbered (01-, 02-, etc.) for ordering
- Each phase folder contains only CHECKLIST.md (single source of truth)
- ROADMAP.md tracks phase completion (check phase checkbox when phases complete)
- ROADMAP concision policy: once a phase is complete, keep only a one-line record for that phase
- Remove completed-phase detail blocks and extra mentions unless needed to explain why an incomplete/blocked phase was unblocked
