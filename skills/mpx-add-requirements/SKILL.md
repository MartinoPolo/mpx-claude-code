---
name: mpx-add-requirements
description: 'Add new requirements to project. Parses current spec, checklist, and roadmap. Updates all files and detects conflicts. Use when: "add requirement", "new feature to spec", "update spec"'
disable-model-invocation: false
allowed-tools: Read, Write, Bash, AskUserQuestion
args: "[requirements]"
metadata:
  author: MartinoPolo
  version: "0.1"
  category: project-management
---

# Add Requirements

Add new requirements to an existing project, updating all relevant files and detecting conflicts.

## Iron Law

**DOCUMENTATION ONLY.** This skill updates `.mpx/` files (SPEC.md, ROADMAP.md, CHECKLIST.md). It NEVER modifies source code, configs, tests, or any non-`.mpx/` file. No implementation. No code changes. No exceptions.

## Requirements Format

- Concise but complete — no filler words, no lost information
- State WHAT, not HOW (behavior, not implementation)
- Include constraints and edge cases inline
- One requirement = one clear deliverable
- Bad: "We should probably add some kind of dark mode support that lets users toggle between light and dark themes"
- Good: "Dark mode toggle. Persist preference. Respect system setting as default."

## Usage

```
/mpx-add-requirements "Add dark mode support"
/mpx-add-requirements "User authentication with OAuth"
/mpx-add-requirements   # Prompts for requirements
```

## Prerequisites

- `.mpx/SPEC.md` must exist
- `.mpx/ROADMAP.md` must exist

## Workflow

### Step 1: Parse New Requirements

If requirements provided as argument, use them.
If no argument, ask the user:

> "What new requirements would you like to add to the project?"

### Step 2: Read Current State

Read all relevant project files:

- `.mpx/SPEC.md` - Master requirements
- `.mpx/ROADMAP.md` - Phase overview + tracking
- `.claude/CLAUDE.md` - Project context (if exists)
- `.mpx/phases/*/CHECKLIST.md` - Phase specs, tasks, and state

### Step 3: Analyze for Conflicts

Check the new requirements against existing specifications:

**Tech Stack Conflicts:**

- Adding MongoDB when SPEC.md says "Database: PostgreSQL"
- Adding React when SPEC.md says "Framework: Vue"
- Adding Python when SPEC.md says "Language: TypeScript"

**Requirement Conflicts:**

- "Remove authentication" when existing tasks depend on auth
- "Add offline support" that contradicts "Real-time sync" requirement
- Contradicting business logic requirements

**Scope Conflicts:**

- Adding features explicitly marked as "Out of Scope"
- Requirements that dramatically change project complexity
- Features that depend on non-existent infrastructure

### Step 4: Report Conflicts (if any)

If conflicts detected, present them to the user:

```
Warning: Potential Conflicts Detected:

1. Tech Stack Conflict:
   - New: "Add MongoDB database"
   - Existing: "Database: PostgreSQL"
   - Impact: Would require database migration or dual-database setup

2. Requirement Conflict:
   - New: "Remove user authentication"
   - Existing: Tasks in Phase 2 depend on authentication
   - Impact: Would invalidate 8 existing tasks

Options:
1. Proceed anyway (will add notes about conflicts)
2. Modify requirements to resolve conflicts
3. Cancel and review manually
```

Use `AskUserQuestion` for conflict resolution.

### Step 5: Update Files

1. **Update SPEC.md:**
   - Add to features list
   - Note tech stack changes

2. **Determine placement:**
   - Can it fit in an existing phase? → Add to that phase's CHECKLIST.md
   - Needs new phase? → Create new phase folder with CHECKLIST.md
   - Spans multiple phases? → Distribute tasks appropriately

3. **Update ROADMAP.md:**
   - Update only affected incomplete/blocked phase summaries
   - Keep completed phases as one-line records only
   - Remove redundant references to completed phases from other sections unless needed to explain an unblock

4. **Update phase CHECKLIST.md files:**
   - Add new tasks with inline spec paragraphs to appropriate phase's CHECKLIST.md
   - Update Scope section if phase scope changes
   - Update Progress counter

### Step 6: Report Changes

```
Requirements Added Successfully!

New Requirements:
  - [Description]

Files Updated:
  - .mpx/SPEC.md - Added to Core Features
  - .mpx/ROADMAP.md - Updated Phase 3 task count
  - .mpx/phases/03-secondary/CHECKLIST.md - Added tasks + updated scope

New Tasks Generated:
  - [ ] [Task 1]
  - [ ] [Task 2]
  - [ ] [Task 3]

[If conflicts were noted:]
Warning: Conflicts Noted:
  - Database conflict noted in SPEC.md
  - Consider reviewing Phase 2 dependencies

Run `/mpx-show-project-status` to see updated progress.
Run `/mp-execute mpx` to start working on new tasks.
```

## Conflict Detection Rules

### Hard Conflicts (Block by default)

- Contradicting tech stack (different databases, frameworks, languages)
- Removing features that have dependent tasks
- Adding features marked as "Out of Scope"

### Soft Conflicts (Warn but allow)

- Adding features that increase complexity
- Adding features to completed phases
- Features that may need additional infrastructure

### No Conflict

- New features that fit naturally
- Enhancements to existing features
- Additional polish/testing tasks

## Task Generation Guidelines

When generating tasks for new requirements:

- Each task should be atomic
- Follow existing task style in the project
- Include setup tasks if needed
- Include testing tasks
- Consider dependencies on existing features

## Error Handling

- **No SPEC.md:** "No project found. Stop and suggest running `/mpx-setup` first."
- **Empty requirements:** "Please specify what requirements to add."
- **Unresolvable conflict:** "Cannot add requirements due to fundamental conflicts. Manual review required."

## Notes

- This skill modifies project files - changes can be reviewed with `git diff`
- Conflict detection is advisory - user has final say
- Tasks are generated based on the requirement description
- Complex requirements may need manual task refinement
- ROADMAP concision policy: completed phase = one line; details stay only for incomplete/blocked phases
