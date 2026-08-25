# Epic Review Phase-End Template

Use this template during synthesis. Include every finding exactly once under its severity and category, give every actionable item a checkbox, and reconcile all counts with the summary.

```markdown
# Epic Review: Epic #<N> — [Title]

Generated: [date] | Sub-issues: #1, #2, #3 | PRs: #4, #5, #6

## Summary

[2-3 sentences on overall epic health, total findings count by severity]

## Critical

### [Category] — [Title]

- [ ] **File:** path/to/file.ts:42
- **Finding:** [what's wrong]
- **Action:** [what to do]

## Important

### [Category] — [Title]

- [ ] **File:** path/to/file.ts:99
- **Finding:** [what's wrong]
- **Action:** [what to do]

## Minor

### [Category] — [Title]

- [ ] **File:** path/to/file.ts:10
- **Finding:** [what's wrong]
- **Action:** [what to do]

## Unresolved Items

### Needs AFK Issue

- [ ] [Title] — [details, suggested issue title]

### Needs HITL Issue

- [ ] [Title] — [details, open questions]

### Already Tracked

- #N — [title] (no action needed)

## Documentation Updates

- [ ] [file] — [specific update needed]

## Architecture Promotion Candidates

- [Title] — [brief description, recommended for `/mp:architecture-review`]
```
