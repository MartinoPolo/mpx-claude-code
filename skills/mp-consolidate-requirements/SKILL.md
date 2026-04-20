---
name: mp-consolidate-requirements
description: 'Consolidate a REQUIREMENTS.md file: remove duplicates, outdated items, and non-requirement content; convert negatives to imperative positive framing; merge superseded sections; fix inconsistencies. Use when: "consolidate requirements", "clean up requirements", "simplify requirements".'
argument-hint: "[path to REQUIREMENTS.md]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep
metadata:
  author: MartinoPolo
  version: "0.2"
  category: utility
---

Consolidate a REQUIREMENTS.md file into a concise, future-proof reference. Preserve all important technical detail while removing noise.

## Input Resolution

1. If `$ARGUMENTS` is a file path, use that file.
2. Otherwise, search for `.mpx/REQUIREMENTS.md` first, then `REQUIREMENTS.md` in the project root.
3. If no file found, ask the user for the path.

## Process

### Step 1: Read & Analyze

Read the full requirements file. Scan for each issue type and build a findings list:

| Issue Type | What to Look For |
|---|---|
| **Duplicates** | Requirements covering the same behavior (keep the most current/complete version) |
| **Superseded** | Requirements explicitly marked as superseded, replaced, or overridden by newer ones |
| **Negative framing** | "must not", "cannot", "never", "no X allowed" — convert to positive imperative |
| **Non-requirement content** | Implementation notes, deviation notes, historical provenance, cross-phase contracts, issue-tracking meta, "Plan vN" / date labels |
| **Outdated** | Struck-through items, removed parameters still referenced, resolved issue references |
| **Inconsistencies** | Conflicting values (e.g., range says 25-400 in one place, 25-200 in another) |

### Step 2: Rewrite

Apply all changes directly — do not ask for confirmation. Produce the consolidated file:

**Structural rules:**
- Group requirements by functional area with clear `##` section headings
- Use `###` subsections within each area
- Keep requirement IDs stable (preserve original IDs for traceability)

**Language rules:**
- Use imperative mood: "Render each tree as..." not "Each tree should be rendered as..."
- Use positive framing: "Keep branches on their originating side" not "Branches must not cross"
- State what the system does, not what it avoids
- Only use negative framing for genuinely surprising constraints

**Content rules:**
- Remove temporal labels ("Plan v4", "Engine v2", "new — 2026-04-15")
- Remove provenance lines ("Extracted from grilling sessions...")
- Remove supersession headers ("X supersedes Y where they conflict")
- Remove implementation/deviation notes (move to PR descriptions or commit messages)
- Remove cross-phase contracts and issue-tracking meta
- Remove struck-through / explicitly removed items and their reference notes
- Fix inconsistent values (use the most recent/authoritative source)
- Merge sections that were split by version history into unified topics

**Preservation rules:**
- Keep full technical detail: formulas, ranges, defaults, code snippets
- Keep tables (parameter definitions, per-shape defaults, color values)
- Keep all behavioral specifications even if verbose — clarity over brevity
- When in doubt, keep the requirement rather than risk losing information

### Step 3: Write Result

Write the consolidated file to the original path (overwrite). Git history preserves the original.

## Report

After writing, summarize:
- Line count: original vs. consolidated (and lines saved)
- Requirements removed (count + IDs)
- Requirements merged (which IDs combined)
- Negative-to-positive rewrites (count)
- Sections restructured
- Inconsistencies fixed
- Final requirement count vs. original
