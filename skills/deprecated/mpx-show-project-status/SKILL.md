---
name: mpx-show-project-status
description: 'Show current project progress. Displays phase status and next steps. Use when: "show status", "project progress", "what''s done"'
disable-model-invocation: true
allowed-tools: Read, Bash
metadata:
  author: MartinoPolo
  version: "0.1"
  category: project-management
---

# Project Status

Display current project progress, completed tasks, and next steps.

## Usage

```
/mpx-show-project-status
```

## Workflow

### Step 1: Gather Progress Data

1. Read `.mpx/ROADMAP.md` for overall status, phase overview, decisions, and blockers
2. For each phase, read phase folder's CHECKLIST.md for task progress and status
3. Compile overall statistics

### Step 2: Generate Status Display

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Project Status: [Project Name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current Phase: Phase 2 - Core Feature
Overall Progress: ████░░░░░░░░░░░░░░░░ 20%

Phase Breakdown:
  ✅ Phase 1: Foundation      (8/8 tasks)
  🔄 Phase 2: Core Feature    (3/12 tasks) ◄ Active
  ⬜ Phase 3: Secondary       (0/8 tasks)
  ⬜ Phase 4: Polish          (0/6 tasks)

Current Phase Progress:
  ████████░░░░░░░░░░░░ 25% (3/12 tasks)

  Completed:
    ✓ Set up API routes
    ✓ Create data models
    ✓ Implement basic CRUD

  Next:
    □ Add authentication middleware

Blockers:
  None

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commands:
  /mp-execute mpx            Continue with next task
  /mpx-parse-spec            Regenerate plan
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 3: Show Contextual Commands

Based on project state, suggest relevant next commands:

- If no tasks done: "Start with `/mp-execute mpx` to execute the first task"
- If phase incomplete: "Continue with `/mp-execute mpx`"
- If phase complete: "Ready for next phase with `/mp-execute mpx`"
- If blockers exist: "Resolve blockers before continuing"
- If all phases done: "Project complete! Consider final review"

## Progress Bar Generation

Generate ASCII progress bars based on completion percentage:

```
0%:   ░░░░░░░░░░░░░░░░░░░░
25%:  █████░░░░░░░░░░░░░░░
50%:  ██████████░░░░░░░░░░
75%:  ███████████████░░░░░
100%: ████████████████████
```

Use 20 characters for the bar.

## Status Icons

- ✅ Completed section/phase
- 🔄 In progress (has some completed tasks)
- ⬜ Not started
- 🚫 Blocked
- ◄ Current/Active indicator

## Error Cases

- **No ROADMAP.md or phases/:** "No project tracking found. Run `/mpx-setup` or `/mpx-parse-spec` first."
- **Empty phase checklist:** "Phase checklist has no tasks. Check phase's `CHECKLIST.md`"
- **Corrupted ROADMAP.md:** "Could not parse ROADMAP.md. Consider regenerating with `/mpx-parse-spec`"

## Notes

- This is a read-only operation - it never modifies files
- Works from any directory within the project
- Can be run at any time to check progress
- Useful for session handoff - shows where to continue
