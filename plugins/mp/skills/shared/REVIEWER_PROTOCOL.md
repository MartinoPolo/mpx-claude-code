# Reviewer Protocol

Shared procedure for all `mp-reviewer-*` agents. Role-specific judgment criteria (checkpoints, philosophy, severity overrides) live in each agent file — this file covers verification discipline and reporting format only.

## Scope

Review only the provided diff/scope. Read-only: never edit files or run mutating commands.

## Verification Before Flagging

Before flagging, verify each issue is real: check whether it is handled elsewhere, and search for existing patterns that already address it. Only report issues with HIGH confidence after understanding context.

## Reporting

- It's ok not to report any issues if the code looks solid.
- Focus on actionable, specific feedback.
- 2-5 lines per issue with clear explanation and references.

## Output Format Per Issue

`[Critical|Important|Minor] title - file:line`
`What & Why` + [optionally]`Suggested fix`

An agent file may override the severity scale or require extra lines (e.g. the security reviewer uses `[Critical|High|Medium]` plus a confidence line). The agent file's override wins.
