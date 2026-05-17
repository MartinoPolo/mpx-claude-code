---
name: mp-vocabulary
description: 'Create or update domain language in CONTEXT.md (or legacy VOCABULARY.md). Confirms with user before writing. Use when: "update vocabulary", "define terms", "domain language", "vocabulary"'
argument-hint: "[topic or context to focus term extraction on]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "1.0"
  category: planning
---

### Process

**Step 1: Gather terms**

- Scan the current conversation for domain-relevant nouns, verbs, and concepts
- If $ARGUMENTS specifies a topic, focus extraction on that area
- Check for `.mpx/CONTEXT.md` first (new format). If missing, fall back to `.mpx/VOCABULARY.md` (legacy)
- Also scan: PRD issues, README, key source files for domain terms

**Step 2: Identify problems**

- Flag ambiguities (same word used for different things)
- Flag synonyms (different words for the same concept)
- Flag vague terms (imprecise language that could cause confusion)

**Step 3: Propose vocabulary**

- Be opinionated — when multiple words exist for the same concept, pick ONE canonical term
- For each term: canonical name, one-sentence definition
- Group terms into natural clusters (by subdomain, lifecycle, or actor)
- Show relationships between terms with cardinality (e.g., "A **User** has many **Sessions**")

**Step 4: Confirm with user**

Present the proposed changes to the user:

- New terms (with definitions)
- Updated definitions (show old → new)
- Flagged ambiguities or conflicts
- Ask user to approve, edit, or reject

Only proceed to writing after user confirms.

**Step 5: Write**

**New format (CONTEXT.md)** — Update the `## Domain Language` section using definition-list format:

```markdown
## Domain Language

**Workspace** — Top-level container: one GitHub repo + one project folder + one window.
**Issue** — Atomic work unit. One GitHub issue, one worktree, one branch, one color.

_Avoid_: "task" for Issue, "project" for Workspace.

## Relationships

- A **Workspace** has many **Issues** (1:N)
- An **Issue** has many **Sessions** (1:N)

## Flagged Ambiguities

- "workspace" was previously used for both the app container and VS Code workspace — resolved: **Workspace** is the Grovekeeper container only.
```

If updating: merge new terms into existing structure, update changed definitions, preserve terms that haven't changed.

**Step 6: Summary**

- Output inline: number of terms added, updated, and unchanged
- List any unresolved ambiguities for future discussion

### Rules

- Only include domain terms — skip generic programming concepts (function, class, API, database)
- Keep definitions to ONE sentence maximum
- Flag conflicts explicitly — never silently resolve ambiguity
- Show relationships with bold term names and cardinality
- When re-running: read existing file, incorporate new terms, update definitions, re-flag ambiguities
