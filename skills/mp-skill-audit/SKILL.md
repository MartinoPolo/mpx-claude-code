---
name: mp-skill-audit
description: 'Audit all active skills for consistency, convention drift, and common issues. Auto-fixes where possible, reports remaining issues. Use when: "audit skills", "skill audit", "check skills", "lint skills"'
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Agent
metadata:
  author: MartinoPolo
  version: "0.4"
  category: utility
---

# Skill Audit

Scan all active skills for consistency and convention drift. Auto-fix mechanical issues, report findings.

When invoked from `mp-skill-create`, pass the single skill path as `$ARGUMENTS`.

## Step 1: Discover Skills

Glob for `skills/*/SKILL.md`.

If `$ARGUMENTS` is a skill name or path, audit only that skill.

## Step 2: Run Checks (per skill)

Spawn parallel Sonnet sub-agents, each auditing 3-5 skills. Each agent runs all 12 checks against each skill and returns findings. Check 12 runs once repo-wide, in the main session.

### Check 1: Positive Instructions

Scan for negative phrasing patterns: "do not", "don't", "never", "must not", "cannot", "avoid".

For each match, evaluate: is there a clear positive reframing? If yes → auto-fix. If the negative guards against an irreversible or genuinely surprising constraint → keep it and note as acceptable.

### Check 2: SKILL.md Line Count

Run `wc -l <skill>/SKILL.md`. Flag if over 200. Suggest content to move to REFERENCE.md.

### Check 3: Frontmatter Completeness

Required fields: `name`, `description`, `allowed-tools`, `metadata.author`, `metadata.version`, `metadata.category`.

Valid categories: `planning`, `execution`, `project-management`, `issue-management`, `git-workflow`, `code-quality`, `code-review`, `refactor`, `testing`, `design`, `setup`, `utility`, `obsidian`.

Flag missing or invalid fields. Auto-fix category casing.

### Check 4: Trigger Phrases

Description must contain `Use when:` followed by quoted trigger phrases.

Flag if missing. Suggest triggers based on the skill name and content.

### Check 5: Legacy Documentation References

Scan for: `REQUIREMENTS.md`, `VOCABULARY.md`, `ARCHITECTURE.md`, `legacy`, `(legacy)`, `fall back`.

Flag any references to the old documentation system. Auto-fix by replacing with CONTEXT.md/DECISIONS.md equivalents.

### Check 6: Explicit Tool References

If skill uses `Agent` in allowed-tools, verify the body names exact agent types.

If skill uses `Bash(gh *)`, verify exact `gh` commands are shown.

Flag implicit or missing tool references.

### Check 7: Vocabulary Confirmation Rule

Applies only to skills that write to `.mpx/CONTEXT.md` § Domain Language (currently: `mp-grill`, `mp-vocabulary`, `mp-harvest-decisions`).

Verify the skill requires user confirmation with full proposed text before writing terms. Flag if missing.

### Check 8: Description Matches Behavior

Compare the `description` field to the skill body. Flag if the description claims capabilities the body doesn't implement, or if the body does things the description doesn't mention.

### Check 9: Spawned Agent Types Exist

For skills with `Agent` in `allowed-tools`: grep the body for spawned agent type names (`grep -oE 'mp-[a-z0-9-]+' SKILL.md` plus explicitly named types like `general-purpose`). Each spawned type must match a file `agents/<type>.md` or a built-in: `general-purpose`, `Explore`, `Plan`. Flag unknown types.

### Check 10: allowed-tools Paths Exist

Extract path-like tokens from `allowed-tools` entries (containing `/` or ending in `.sh`, `.js`, `.ps1`, `.md`). Resolve `$HOME/.claude/` to the repo root, strip glob wildcards, Glob each remaining path. Flag entries whose file is missing on disk.

### Check 11: Dead allowed-tools Grants

For each `allowed-tools` entry, grep the skill body for its usage token: plain tool grants (`Write`, `AskUserQuestion`, `Agent`) → an instruction must actually use that tool; `Bash(<cmd> *)` grants → grep body for `<cmd>`. Flag entries with no matching usage.

### Check 12: README Table Sync

Runs once for the repo. Glob `skills/*/SKILL.md`, `agents/*.md`, `hooks/*` and diff each file list against the corresponding README.md table rows. Flag rows whose file is gone, files on disk with no row, and renamed entries (row and file differ by name only). Report only — README edits stay manual.

## Step 3: Auto-Fix

Apply fixes for mechanical issues:
- Reframe negative instructions to positive equivalents
- Add missing frontmatter fields with sensible defaults
- Replace legacy doc references with CONTEXT.md/DECISIONS.md
- Fix category casing

Bump `version` patch number for each skill that gets auto-fixed.

## Step 4: Report

Output a summary table:

```
Skill                  | Issues | Auto-fixed | Remaining
-----------------------|--------|------------|----------
mp-grill               |      2 |          2 |         0
mp-to-prd              |      1 |          0 |         1
...
```

Then list remaining issues that need human attention, grouped by skill:

```
mp-to-prd:
  - [Check 8] Description says "from passed requirements" but skill reads CONTEXT.md
```

## Rules

- Read each SKILL.md fully before checking — partial reads cause false positives
- Verify auto-fixes preserve the original intent
- Bump version only once per skill, even if multiple fixes applied
