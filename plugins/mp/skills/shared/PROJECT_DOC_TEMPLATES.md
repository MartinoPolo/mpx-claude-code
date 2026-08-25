# Project Documentation Scaffolds

Create both initial files with the exact headings and placeholders below whenever a setup skill scaffolds `.mpx/` project documentation. Replace `[Project Name]` when the name is known.

## `.mpx/CONTEXT.md`

```markdown
# [Project Name] Context

## What This Is
[Three-sentence project summary]

## Domain Language
[One-line definition-list entries; populated via `/mp:grill` or `/mp:vocabulary`]

## Relationships
[Entity cardinalities such as 1:N and N:1]

## Flagged Ambiguities
[Resolved term conflicts with rationale]

## Core Features
[Feature index: name, status, epic number, and design-file pointer]

## Key Constraints
[Settled facts about the system]
```

## `.mpx/DECISIONS.md`

```markdown
# Decisions

Settled architectural and design decisions. Updated via `/mp:grill` and `/mp:harvest-decisions`.

## [Domain]

### [Decision title]

Decided: YYYY-MM-DD
What: [One sentence describing the choice.]
Why: [One sentence explaining the rationale.]
Rejected: [Alternatives considered and why they lost.]
```

The roles, content boundaries, formatting rules, and later splitting policy remain canonical in [`DOCUMENTATION_STRATEGY.md`](DOCUMENTATION_STRATEGY.md).
