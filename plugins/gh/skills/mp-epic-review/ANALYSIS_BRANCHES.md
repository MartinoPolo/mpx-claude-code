# Epic Review Specialized Analysis Branches

Read all four branches during Step 2 after dispatching reviewers 1–6. Require every branch to return each requested field, including an explicit no-findings result where applicable.

### Agent 7: Architecture Scanner (Standalone Agent)

Spawn `mp-scanner-architecture` sub-agent:

> Scan these files changed during Epic #N: "[title]".
> Focus on structural concerns introduced or worsened across the full epic scope.
>
> Changed files: [list with stats]
> Architectural decisions from discussions: [filtered comments]

The agent reads its own reference files (`deep-modules.md`, `interface-design.md`, `REFERENCE.md`).

### Agent 8: Dead Code / Cleanup Scanner (Inline)

Spawn `Explore` sub-agent (breadth: medium):

> Scan files changed during Epic #N for cleanup opportunities introduced across multiple PRs:
>
> - Unused exports, types, or functions added in one PR but never consumed
> - Stale imports left after refactoring across PRs
> - Duplicated logic across files that should be a shared utility
> - Redundant code where one PR's implementation superseded another's
> - Orphaned test helpers or fixtures no longer referenced
>
> Changed files: [list with stats]
> Diff: [full diff]
>
> Verify each finding: grep for usages before flagging as unused. Only report HIGH confidence.
>
> Output format per finding:
> `[Critical|Important|Minor] title — file:line`
> `What & Why` + `Suggested fix`

### Agent 9: Documentation Scanner (Inline)

Spawn `Explore` sub-agent (breadth: medium):

> Check if project documentation is stale relative to changes made in Epic #N: "[title]".
>
> For each file below, check only the ones that exist; treat missing files as out of scope.
>
> - `.mpx/CONTEXT.md` — are there new domain terms not in § Domain Language? Are features in § Core Features still marked as pending when implemented?
> - `.mpx/DECISIONS.md` — do structural changes warrant new decision entries?
> - `README.md` — are setup steps, features, or usage instructions outdated?
>
> Changed files: [list with stats]
> PR/issue context: [full comments — to understand what was built]
>
> Output format per finding:
> `[Important|Minor] title — file`
> `What needs updating` + `Specific content to add/change`

### Agent 10: Unresolved Items Scanner (Inline)

Spawn a `general-purpose` sub-agent with `model: "sonnet"`:

> Scan all PR bodies and comments + issue bodies and comments from Epic #N for deferred, unfinished, or incomplete work.
>
> Look for: "deferred", "TODO", "left for later", "unresolved", "out of scope", "follow-up", "nice to have", "future work", "skipped", "punted", "not implemented yet", "known issue", "hack", "workaround", "temporary".
>
> For each candidate found:
>
> 1. Read the relevant source files to check if it was actually implemented in a later PR within the epic
> 2. Search open GitHub issues to check if it's already tracked:
>    ```bash
>    gh issue list --state open --search "<keywords>" --json number,title --limit 5
>    ```
> 3. Classify:
>    - **Complete** — verified implemented in code → omit from findings
>    - **Tracked** — open issue exists → report with issue link, no action needed
>    - **Needs AFK issue** — clear scope, ready to implement → report with suggested issue title
>    - **Needs HITL issue** — uncertain scope, needs human decision → report with open questions
>
> PR bodies and comments: [full content]
> Issue bodies and comments: [full content]
> Changed files: [list for code verification]
>
> Output format per finding:
> `[Critical|Important|Minor] title`
> `Source: PR #N comment by @user` or `Issue #N body`
> `Status: Complete|Tracked (#N)|Needs AFK issue|Needs HITL issue`
> `Details` + [for HITL: `Open questions`]
