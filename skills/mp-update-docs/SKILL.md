---
name: mp-update-docs
description: 'Documentation updater for README and instruction docs. Use when: "update docs", "refresh README", "update instructions", "sync docs"'
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.2"
  category: utility
---

# Update Documentation

Unified doc maintenance for instruction files and README updates.

## Usage

```
/mp-update-docs                # Review and update docs
```

## Workflow

### Step 1: Detect Doc Inventory

Glob for all documentation files — no hardcoded paths:

```
# Instruction files
~/.claude/CLAUDE.md
~/.claude/AGENTS.md
.claude/CLAUDE.md
.claude/AGENTS.md
./CLAUDE.md
./AGENTS.md

# README
./README.md

# Other docs
*.md in project root (excluding node_modules, .git)
```

Build inventory of found files with their last-modified timestamps.

### Step 2: Gather Context

Read existing docs from inventory, plus:

- `package.json` (if exists) — name, description, scripts, dependencies
- Project structure — `ls` top-level dirs, glob for src/lib/app patterns
- `git log --oneline -20` — recent changes
- `git diff HEAD~10..HEAD --stat` — files changed recently

For instruction docs, also read recent conversation history:

- Find project folder in `~/.claude/projects/` (path with slashes→dashes)
- Read 5-10 most recent `.jsonl` files (last few days)
- Extract user corrections, repeated patterns, workflow friction

### Step 3: Analyze Gaps

Per category, identify what needs updating:

**Instructions (CLAUDE.md / AGENTS.md):**

- Violated rules (from conversation history)
- Missing patterns (repeated corrections, undocumented conventions)
- Outdated content (deprecated tools, old workflows)
- Placement: global (`~/.claude/`) vs project (`.claude/`)

**README:**

- Description/features mismatch with actual codebase
- Scripts listed vs scripts in package.json
- Install instructions accuracy
- Missing or outdated sections

**Other Docs:**

- Stale API signatures or examples
- Missing workflow documentation

### Step 4: Present or Apply Updates

Show analysis summary organized by file:

```
## Documentation Analysis

### AGENTS.md (3 updates)
1. Add missing spawn rule for [tool]
2. Remove outdated [section]
3. Reinforce [violated instruction]

### README.md (2 updates)
1. Update scripts section (3 new scripts)
2. Fix install instructions (uses pnpm, not npm)
```

Then ask user:

```
question: "Which documentation updates should I apply?"
options:
  - Apply all updates
  - Review each file individually
  - Show detailed analysis first
  - Cancel
```

### Step 5: Apply Changes

Edit files directly using Edit tool. Preserve:

- Existing structure and formatting
- Badges, license sections, custom content
- `<!-- CUSTOM -->` marked sections
- YAML frontmatter

For each file changed, track: file path, what changed, why.

### Step 6: Commit

If any files were modified:

```bash
git add [changed doc files only]
git commit -m "docs: update documentation after [context]"
```

Context examples: "phase 3 completion", "instruction review", "README sync".

Do NOT create empty commits if nothing changed.

### Step 7: Report

```
Documentation Update Summary

Files Updated:
- [file]: [changes made]
- [file]: [changes made]

Files Skipped:
- [file]: No updates needed
- [file]: [reason skipped]

Commit: [hash] docs: update documentation after [context]
(or "No changes needed — all docs are current")
```

## Error Handling

- No docs found for scope → report "No [scope] files found in project"
- Git commit fails → report error, don't retry
- File read fails → skip file, note in report

## Notes

- Only modify documentation files
- Preserve existing doc structure — update sections in place
- Keep updates minimal and high-signal
- Conversation history analysis is best-effort — skip if files are too large or missing
