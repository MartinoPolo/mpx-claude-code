# Epic Review Execution and Close-out

Read this file only after the Step 4 HITL gate. Check off or explicitly defer every accepted item, then report the epic close-out state.

## Step 5: Execution

Count actionable items (excluding "Already Tracked" and dropped items).

### If ≤ 20 items and user confirms execution:

Execute using `mp-executor` sub-agents. The orchestrator:

1. Analyzes each item and determines the concrete fix (exact file, line, change)
2. Groups items by parallelizability:
   - **Parallel group**: items touching different files or independent code paths
   - **Sequential group**: items where one fix affects another (e.g., extracting a shared utility before deduplicating callers)
3. Spawns `mp-executor` sub-agents with pre-analyzed fix instructions for each parallel group
4. After each group completes, update PHASE_END.md checkboxes (`- [x]`)
5. For unresolved items needing issues:

```bash
gh issue create --title "[title]" --label "task,AFK" --body "[body]"
```

or for HITL items:

```bash
gh issue create --title "[title]" --label "task,HITL" --body "[body with open questions]"
```

Link new issues as sub-issues of the epic using GraphQL `addSubIssue`.

6. After all fixes: run static checks and tests to verify nothing broke

```bash
node ${CLAUDE_PLUGIN_ROOT}/../mp/scripts/detect-check-scripts.mjs
```

Run all detected CHECK and TEST commands via `mp-checker`.

### If > 20 items or user defers:

Document is saved. User can return in a new session, read `.mpx/reviews/PHASE_END_EPIC_N.md`, and execute items manually or via `/mp:execute` for individual issues created from unresolved items.

## Step 6: Close-out

After all items are resolved (or explicitly deferred):

1. Update PHASE_END.md with final status
2. Check if all sub-issues of the epic are closed:

```bash
gh issue list --search "parent:<epic_number>" --state open --json number,title --limit 100
```

3. If all closed and all critical/important items resolved:

> All items resolved. Close Epic #N: "[title]"?

Wait for user confirmation before closing:

```bash
gh issue close <epic_number> --reason completed
```
