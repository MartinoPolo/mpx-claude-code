# User-Level Instructions

## Communication Style

- **Concise** - Be extremely concise. Sacrifice grammar for the sake of concision.

## Code Standards

- **Dead Code**: Remove unused code, exports, commented code, unreachable paths
- **DRY**: Extract reusable logic. Share types. Don't extract single-use code
- **Verbose Naming**: Full descriptive names. No abbreviations. Clear intent
- **Docs**: Update when functionality changes. Keep comments minimal

## Iron Laws

Claim completion only when the task is fully done.
First find and understand root cause, then fix.

## MCP Tools

Use `ToolSearch` to load deferred tools only when needed.

## Self-Improvement Protocol

When encountering errors, unexpected behavior, or workflow friction:

1. **Analyze** - root cause, why instructions didn't prevent it
2. **Fix** - resolve immediate issue
3. **Update instructions** - modify AGENTS.md or relevant files
4. **Document** - note what changed and why

**Trigger examples**: silent command failures, missing workflow steps, ambiguous instructions, unreliable tools

## Plan Mode

- Concise plans. Sacrifice grammar for the sake of concision.

## Session Activity Tracking

At end of each response where agents were spawned or skills invoked, append:

**Session Activity:**

- `agent-name` (model) — brief purpose [× count if >1]
- `/skill-name` — brief purpose

Rules:

- Omit if no agents/skills used
- Include model (opus/sonnet/haiku) for agents
- Show parallel runs as × count
