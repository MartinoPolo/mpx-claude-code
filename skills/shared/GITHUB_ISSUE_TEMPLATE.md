# GitHub Issue Template

Canonical issue body format for all task issues created by `mp-issue-create` and `mp-prd-to-issues`.

## Template

```markdown
> **Requires discussion:** [Why human input is needed]

## Description

[What needs to happen and why — imperative mood, durable domain language]

## Requirements

- REQ-1: [Imperative statement — mapped from PRD or standalone]
- REQ-2: ...

## Acceptance Criteria

- [ ] [Testable condition — maps to one or more requirements]
- [ ] ...

## Blocking Relationships

- Blocked by #N (reason)
- Blocks #M (reason)

## Notes

[Implementation hints, constraints, relevant patterns]
```

## Section Rules

### HITL Blockquote

- Present **only** on HITL-labeled issues. Omit entirely for AFK issues.
- Explains WHY human input is needed (architectural decision, API contract approval, ambiguous requirement).
- HITL/AFK classification lives on the label, never in the body.

### Description

- Imperative mood, domain language, no file paths or line numbers.
- Answers: what needs to happen and why.

### Requirements

- Each requirement is an imperative statement (e.g. "Support pagination with cursor-based navigation").
- When linked to a PRD: map requirements from the PRD body.
- When standalone: define requirements directly.
- Optional when the issue is simple enough that acceptance criteria alone suffice.

### Acceptance Criteria

- Checkbox list. Each criterion is independently testable.
- `mp-execute` maps each criterion to one or more test cases — write them accordingly.
- Use observable behavior, not implementation detail ("API returns 401 when token is expired", not "check token expiry in middleware").

### Blocking Relationships

- Reference sibling issue numbers with direction (blocked by / blocks).
- Omit section entirely if no dependencies exist.

### Notes

- Implementation hints, constraints, relevant architectural patterns.
- Optional — omit if the description and acceptance criteria are sufficient.

## Labels

Every task issue gets:

- `task` — always
- Exactly one of `HITL` or `AFK` — never both, never neither
- Area labels as appropriate (`area:api`, `area:ui`, `area:db`, etc.)

### HITL vs AFK Classification

- **HITL** — requires human interaction during implementation: architectural decisions, API contract approvals, UX decisions, ambiguous requirements needing clarification
- **AFK** — can be implemented autonomously: well-defined scope, clear acceptance criteria, no open design questions
- Default to HITL when uncertain

## Label Colors

```
task   — #0E8A16 (green)  — "Implementation task"
HITL   — #FBCA04 (yellow) — "Requires human interaction"
AFK    — #0E8A16 (green)  — "Can be implemented autonomously"
```

## Creation Command

```bash
gh issue create \
  --title "Short descriptive title" \
  --label "task,AFK,area:api" \
  --assignee @me \
  --body "$(cat <<'EOF'
[issue body using template above]
EOF
)"
```

Always assign to `@me`.
