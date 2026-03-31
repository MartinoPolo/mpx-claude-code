---
name: mp-glossary
description: 'Create or update GLOSSARY.md with canonical domain terms, aliases, relationships. Confirms with user before writing. Use when: "update glossary", "define terms", "domain language", "glossary"'
argument-hint: "[topic or context to focus term extraction on]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.1"
  category: planning
---

### Process

**Step 1: Gather terms**

- Scan the current conversation for domain-relevant nouns, verbs, and concepts
- If $ARGUMENTS specifies a topic, focus extraction on that area
- If GLOSSARY.md already exists in project root, read it (update mode)
- Also scan: REQUIREMENTS.md, PRD issues, README, key source files for domain terms

**Step 2: Identify problems**

- Flag ambiguities (same word used for different things)
- Flag synonyms (different words for the same concept)
- Flag vague terms (imprecise language that could cause confusion)

**Step 3: Propose glossary**

- Be opinionated -- when multiple words exist for the same concept, pick ONE canonical term
- For each term: canonical name, one-sentence definition, aliases to avoid
- Group terms into natural clusters (by subdomain, lifecycle, or actor)
- Show relationships between terms with cardinality (e.g., "A **User** has many **Sessions**")

**Step 4: Confirm with user**

Present the proposed changes to the user:

- New terms (with definitions)
- Updated definitions (show old -> new)
- Flagged ambiguities or conflicts
- Ask user to approve, edit, or reject

Only proceed to writing after user confirms.

**Step 5: Write GLOSSARY.md**

Format:

```markdown
# Glossary

> Canonical domain terms for this project. Use these terms consistently in PRDs, issues, code, and conversation.

## [Subdomain / Category]

| Term | Definition | Aliases to Avoid |
|------|-----------|-----------------|
| **CanonicalTerm** | One-sentence definition. | oldName, ambiguousTerm |

## Relationships

- A **User** has many **Sessions** (1:N)
- A **Session** belongs to one **Workspace** (N:1)

## Example Dialogue

> **Dev:** "When a user creates a new workspace..."
> **PM:** "You mean when the **Owner** provisions a **Workspace**? Because any **Member** can create **Projects** within it, but only the **Owner** creates the **Workspace** itself."
```

If updating: merge new terms into existing structure, update changed definitions, preserve terms that haven't changed.

**Step 6: Summary**

- Output inline: number of terms added, updated, and unchanged
- List any unresolved ambiguities for future discussion

### Rules

- Only include domain terms -- skip generic programming concepts (function, class, API, database)
- Keep definitions to ONE sentence maximum
- Flag conflicts explicitly -- never silently resolve ambiguity
- Show relationships with bold term names and cardinality
- When re-running: read existing file, incorporate new terms, update definitions, re-flag ambiguities, rewrite example dialogue to include new terms
