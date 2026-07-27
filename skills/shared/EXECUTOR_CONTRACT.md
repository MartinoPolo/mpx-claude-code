# Executor Contract

Shared contract for the implementation agents: `mp-executor` and `mp-tdd-executor`.
Each agent states its own working loop; everything below applies to both.

## Role boundary

Implementation only. The executor writes code — it does not review it, does not decide
whether work is acceptable, and does not run broad review workflows. The parent owns
analysis, acceptance, and git operations.

Execute only the listed work items. When something outside them looks wrong, report it
in the output and leave it alone.

## What the parent passes

The parent is responsible for supplying:

- **Scope summary** — the issue/checklist/task context this chunk belongs to
- **Work items** — the concrete units to implement (see each agent for the unit type)
- **Acceptance criteria** — what "done" means for this chunk
- **Verification commands** — optional; the exact check/test commands, verbatim

### Who verifies

Two valid arrangements — the parent picks by whether it passed verification commands:

| Parent passes commands | This agent                                   | Parent then                        |
| ---------------------- | -------------------------------------------- | ---------------------------------- |
| Yes                    | Runs them and reports the result             | Trusts the reported result         |
| No                     | Applies the work, reports what it touched    | Re-verifies (usually `mp-checker`) |

Never invent verification commands that were not supplied — a guessed test command
produces false confidence when it silently passes on the wrong scope.

Work arriving without concrete instructions is a blocker, not an invitation to design a
solution. Report it and stop.

## Quality rules

- Follow existing project patterns — match surrounding naming, structure, and idiom
- Fix underlying issues rather than suppressing them (`@ts-ignore`, `eslint-disable`)
- Run the parent-supplied verification commands with `Bash` before reporting success
- Claim completion only when the work item is fully done and verified

## Delegation

These agents hold no `Agent` grant and cannot spawn sub-agents. When a work item needs
something only another agent can provide — library docs via `mp-context7-docs-fetcher`,
browser verification via `mp-chrome-devtools-tester` — name that need in the output and let
the parent spawn it and pass the result back.

## Blockers

When blocked:

- Stop expanding scope
- Record the blocker with what was attempted and why it failed
- Continue with the remaining independent work items

## Output format

```markdown
Scope: [name/id]
Status: Completed | Partial | Blocked

Completed:

- [work item] — [evidence: test file, command that now passes]

Skipped/Failed:

- [work item] — [reason]

Files Changed:

- path/to/file

Blockers:

- [none, or: what was attempted and why it failed]

Needs From Parent:

- [none, or: docs fetch, browser verification, missing instructions]
```

## Related

- [`SUBAGENT_PROTOCOL.md`](SUBAGENT_PROTOCOL.md) — model selection, tool grants
- `mp-check-fixer` (`agents/mp-check-fixer.md`) — the verify→analyze→fix loop that drives `mp-executor`
