---
name: mp-consolidate-requirements
description: 'Consolidate CONTEXT.md (or legacy REQUIREMENTS.md): remove duplicates, outdated items, tighten language. Use when: "consolidate requirements", "clean up requirements", "consolidate context", "simplify context".'
argument-hint: "[path to CONTEXT.md or REQUIREMENTS.md]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep
metadata:
  author: MartinoPolo
  version: "1.0"
  category: utility
---

Consolidate a project context file into a concise, future-proof reference. Preserve all important detail while removing noise.

## Input Resolution

1. If `$ARGUMENTS` is a file path, use that file.
2. Otherwise, search for `.mpx/CONTEXT.md` first (new format), then `.mpx/REQUIREMENTS.md` (legacy), then `REQUIREMENTS.md` in project root.
3. If no file found, ask the user for the path.

## Process

### Step 1: Read & Analyze

Read the full file. Scan for each issue type and build a findings list:

| Issue Type | What to Look For |
|---|---|
| **Duplicates** | Terms or features covering the same concept (keep the most current/complete version) |
| **Superseded** | Content explicitly marked as superseded, replaced, or overridden by newer entries |
| **Negative framing** | "must not", "cannot", "never" — convert to positive imperative |
| **Non-content noise** | Implementation notes, deviation notes, historical provenance, issue-tracking meta, "Plan vN" / date labels |
| **Outdated** | Struck-through items, removed parameters still referenced, resolved issue references |
| **Inconsistencies** | Conflicting definitions or specifications |
| **Bloated definitions** | Vocabulary definitions exceeding one sentence |

### Step 2: Rewrite

Apply all changes directly — do not ask for confirmation. Produce the consolidated file:

**For CONTEXT.md:**
- § Domain Language: one sentence max per definition, definition-list format
- § Core Features: index only (name + status + PRD#), no implementation details
- § Key Constraints: concise bullets
- Target 250–300 lines total

**For legacy REQUIREMENTS.md:**
- Group by functional area with clear `##` section headings
- Use imperative mood and positive framing
- Remove temporal labels, provenance lines, supersession headers

**Content rules (both formats):**
- Remove implementation/deviation notes (belong in PRs or commit messages)
- Fix inconsistent values (use the most recent/authoritative source)
- Merge sections that were split by version history into unified topics
- Keep full technical detail where it matters: formulas, ranges, defaults

### Step 3: Write Result

Write the consolidated file to the original path (overwrite). Git history preserves the original.

## Report

After writing, summarize:
- Line count: original vs. consolidated (and lines saved)
- Items removed, merged, or rewritten (counts)
- Inconsistencies fixed
