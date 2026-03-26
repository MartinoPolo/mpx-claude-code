---
name: mpx-report-issue-or-bug
description: 'Track bugs/issues in .mpx/ phase system. Parses reports, finds related phases, adds fix tasks or creates bugfix phases. Use when: "track this bug", "add issue to project", "log this bug", "add bug to checklist"'
disable-model-invocation: false
allowed-tools: Read, Write, Bash, AskUserQuestion, Glob, Grep
args: "[issue description]"
metadata:
  author: MartinoPolo
  version: "0.1"
  category: project-management
---

# Report Issue or Bug

Track bugs and issues within the `.mpx/` phase system. Parses bug reports, finds related phases, adds fix tasks to existing checklists or creates new bugfix phases.

## Iron Law

**DOCUMENTATION ONLY.** This skill updates `.mpx/` files (SPEC.md, ROADMAP.md, CHECKLIST.md). It NEVER modifies source code, configs, tests, or any non-`.mpx/` file. No implementation. No code changes. No exceptions.

## Usage

```
/mpx-report-issue-or-bug "Login form crashes when email contains + character"
/mpx-report-issue-or-bug "API returns 500 on empty payload"
/mpx-report-issue-or-bug   # Prompts for issue description
```

## Prerequisites

- `.mpx/SPEC.md` must exist
- `.mpx/ROADMAP.md` must exist

## Workflow

### Step 1: Parse Issue

If issue provided as `$ARGUMENTS`, use it.
If no argument, ask the user:

> "Describe the bug or issue you want to track."

Extract from the description:

- **Summary** — one-line description
- **Severity** — critical / high / medium / low (default: medium)
- **Affected area** — component, feature, or module
- **Reproduction steps** — if provided

### Step 2: Read MXP State

Read all relevant project files:

- `.mpx/SPEC.md` — Master requirements
- `.mpx/ROADMAP.md` — Phase overview + tracking
- `.mpx/phases/*/CHECKLIST.md` — Phase specs, tasks, and state

Note each phase's status (complete/incomplete), section headings, and scope.

### Step 3: Find Related Sections

Keyword match the affected area against:

- Section headings in CHECKLIST.md files
- Task descriptions
- Scope items in each phase

Rank matches:

- **Strong** — direct keyword match in section heading or scope
- **Weak** — partial match in task descriptions
- **None** — no relevant match found

### Step 4: Decide Placement

| Match  | Phase Status | Action                                             |
| ------ | ------------ | -------------------------------------------------- |
| Strong | Incomplete   | Add fix tasks to that phase's CHECKLIST.md         |
| Strong | Complete     | Create new bugfix phase (never reopen completed)   |
| Weak   | Any          | Ask user: add to matched phase or new bugfix phase |
| None   | —            | Create new bugfix phase                            |

Use `AskUserQuestion` for weak-match decisions.

### Step 5: Update Files

1. **Update CHECKLIST.md** (existing or new phase):
   - Add `Fix:` + `Verify:` task pair
   - Include severity tag in inline spec: `[severity: high]`
   - `Fix:` prefix distinguishes bug tasks from feature tasks

   Example tasks:

   ```
   - [ ] Fix: Login form crashes on emails with + character [severity: medium]
     > Email addresses containing + are valid per RFC 5321. The form validation regex rejects them incorrectly.
   - [ ] Verify: Login accepts emails with special characters (+, dots, hyphens)
   ```

2. **Update ROADMAP.md**:

- Update task counts/status for affected incomplete/blocked phase
- Keep completed phases as one-line records only
- Remove redundant completed-phase references unless required to explain an unblock dependency
- Add new bugfix phase entry when created

3. **Update SPEC.md** (critical/high severity only):
   - Add to `## Known Issues` section (create section if missing)

4. **New bugfix phase** (when needed):
   - Naming: `NN-bugfix-[area]` (e.g., `04-bugfix-auth`)
   - Create folder + CHECKLIST.md with standard structure
   - Add phase entry to ROADMAP.md

### Step 6: Report

```
Issue Tracked Successfully!

Summary: [one-line description]
Severity: [severity]
Placement: [phase name] (new/existing)

Files Updated:
  - .mpx/phases/NN-name/CHECKLIST.md — Added fix + verify tasks
  - .mpx/ROADMAP.md — Updated task count
  - .mpx/SPEC.md — Added to Known Issues (if critical/high)

New Tasks:
  - [ ] Fix: [description]
  - [ ] Verify: [description]

Next: Run `/mp-execute mpx` to implement the fix.
```

## Task Generation Rules

- Always generate a **Fix + Verify** task pair
- `Fix:` prefix marks bug-related tasks (vs feature tasks)
- Verify task confirms the fix works and doesn't regress
- Follow existing task style in the project
- Include severity tag inline: `[severity: level]`

## Error Handling

- **No SPEC.md:** "No project found. Run `/mpx-setup` first."
- **Empty description:** "Please describe the bug or issue to track."
- **Ambiguous area:** Use `AskUserQuestion` to clarify affected component

## Notes

- This skill modifies project files — changes can be reviewed with `git diff`
- Bug tasks use `Fix:` prefix to distinguish from feature tasks
- Critical/high issues are surfaced in SPEC.md Known Issues for visibility
- Completed phases are never reopened — new bugfix phase created instead
- ROADMAP concision policy: completed phase = one line; detailed status belongs to incomplete/blocked phases
