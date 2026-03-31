Be extremely concise (especially for plans). Sacrifice grammar for the sake of concision.

DRY: Extract reusable logic, components, types
Verbose Naming: Full descriptive names. No abbreviations. Clear intent
Update docs when functionality changes. Keep comments minimal
Claim completion only when the task is fully done.
First find and understand root cause, then fix.

Use `ToolSearch` to load deferred tools only when needed.

## When Stuck or Producing Mediocre Solutions

If an approach is getting messy or you've been patching the same area repeatedly: stop, reassess from scratch. Ask yourself "Knowing everything now, what's the elegant solution?" and implement that instead. Don't polish a bad approach — replace it.

## Self-Improvement Protocol

When encountering errors, unexpected behavior, or workflow friction, Analyze root cause, why instructions didn't prevent it. Resolve immediate issue. Add rule in AGENTS.md or memory. Document what changed and why.

**Trigger examples**: silent command failures, missing workflow steps, ambiguous instructions, unreliable tools

## Session Activity Tracking

At end of each response where agents were spawned or skills invoked, append session activity includeing reference files skill used:

**Session Activity:**

- `agent-name` (model) — brief purpose
- `/skill-name` — brief purpose
  REFERENCE_1.md - reason for invocation
