# GitHub Issue Template

Canonical issue body format for all task issues created by `/mp:issue-create` and `/mp:to-issues`.

## Template

```markdown
> **Unanswered questions:**
> - [Specific question that needs answering before/during implementation]

## Description

[What needs to happen and why — imperative mood, durable domain language]

## Requirements

- REQ-1: [Imperative statement — mapped from epic or standalone]
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
- Lists the specific unanswered questions that need resolving before or during implementation.
- HITL is exclusively for uncertain decisions resolved by asking the user — not for visual inspection, manual testing, or code review.
- HITL/AFK classification lives on the label, never in the body.

### Description

- Imperative mood, domain language, no file paths or line numbers.
- Answers: what needs to happen and why.

### Requirements

- Each requirement is an imperative statement (e.g. "Support pagination with cursor-based navigation").
- When linked to an epic: map requirements from the epic body.
- When standalone: define requirements directly.
- Optional when the issue is simple enough that acceptance criteria alone suffice.

### Acceptance Criteria

- Checkbox list. Each criterion is independently testable.
- `/mp:execute` maps each criterion to one or more test cases — write them accordingly.
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
- `design needed` — when the issue requires a design brief and/or mockup before implementation can begin. Apply when: new UI components, significant visual changes, complex layout work, or user-facing workflows that need design exploration. Do NOT apply for purely backend work, bug fixes, or minor UI tweaks to existing components.

### HITL vs AFK Classification

- **HITL** — has unanswered questions or uncertain decisions that require asking the user. Examples: unclear API contract, ambiguous business rule, multiple valid approaches needing a decision. NOT for: visual inspection, manual testing, code review, QA verification
- **AFK** — can be implemented autonomously: well-defined scope, clear acceptance criteria, no open design questions
- When all questions have been resolved upfront, the issue should be AFK

## Label Colors

```
task            — #0E8A16 (green)  — "Implementation task"
HITL            — #FBCA04 (yellow) — "Requires human interaction"
AFK             — #0E8A16 (green)  — "Can be implemented autonomously"
design needed   — #5319E7 (purple) — "Requires design (mockup + refine) before/with implementation"
```

## Label Creation Commands

Check existing labels, then create missing ones:

```bash
gh label list --limit 100
gh label create "task" --description "Implementation task" --color "0E8A16" --force
gh label create "HITL" --description "Requires human interaction" --color "FBCA04" --force
gh label create "AFK" --description "Can be implemented autonomously" --color "0E8A16" --force
gh label create "design needed" --description "Requires design (mockup + refine) before/with implementation" --color "5319E7" --force
```

Create area labels as needed (`area:api`, `area:ui`, `area:db`, etc.).

## Creation Command

```bash
ISSUE_URL=$(gh issue create \
  --title "Short descriptive title" \
  --label "task,AFK,area:api" \
  --assignee @me \
  --body "$(cat <<'EOF'
[issue body using template above]
EOF
)")
```

Always assign to `@me`. Add `--milestone "Name"` when a linked epic has a milestone.

## Linking as Epic Sub-Issue

Get owner/repo and the epic's GraphQL node ID:

```bash
OWNER_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
EPIC_NODE_ID=$(gh api graphql -f query="{ repository(owner: \"${OWNER_REPO%/*}\", name: \"${OWNER_REPO#*/}\") { issue(number: $EPIC_NUMBER) { id } } }" --jq '.data.repository.issue.id')
```

Link a created issue (using `ISSUE_URL` captured above) as a native sub-issue of the epic:

```bash
gh api graphql -f query="
  mutation {
    addSubIssue(input: {
      issueId: \"$EPIC_NODE_ID\",
      subIssueUrl: \"$ISSUE_URL\"
    }) {
      issue { number }
      subIssue { number }
    }
  }
"
```

If blocking relationships reference issues not yet created (forward references), update issue bodies after all issues exist.
