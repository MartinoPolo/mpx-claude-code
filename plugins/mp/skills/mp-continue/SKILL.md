---
name: continue
description: "Recovers interrupted sub-agent and background work after a session-limit hit, crash, or manual interrupt, then resumes it."
argument-hint: "[optional focus or task to resume first]"
disable-model-invocation: true
allowed-tools: Agent, SendMessage, TaskList, Bash, PowerShell, Read, Grep, Glob
metadata:
  author: MartinoPolo
  version: "0.4"
  category: utility
---

# Continue & Recover

On resume after an interruption, first restore any interrupted sub-agent and background work, then continue. If nothing was interrupted, just continue the last task normally.

An account session-limit hit terminates the session process, which kills **every** running background sub-agent (their final result becomes only the limit message) and orphans background shells (dev servers, watchers). One limit can wipe all parallel agents across all worktrees at the same instant. This skill restores that work.

## Workflow

### Step 1: Detect whether recovery is needed (self-gate)

Look for real interruption signals:

- A background agent whose last result is only a limit/error string — `"hit your session limit"`, `"usage limit"`, `"rate limit"`, `"overloaded"`, an API error, or `[Request interrupted]`.
- `TaskList` shows agents/tasks stuck `in_progress`, or a nonzero pending background-agent count with no matching completion notification.

If none are present, no recovery is needed: continue the most recent task normally and stop here. Skip Steps 2–6.

If an argument (focus/task) was passed, recover that agent or task first, then the rest.

### Step 2: Assess actual state before redoing anything

A killed agent may have finished most of its task — verify what already landed before recreating work.

```bash
git status
git diff --stat
```

- List durable artifacts the interrupted agents produced: screenshots/scripts under `test-results/`, generated files, `HANDOFF.md`, memory notes.
- Run the project's quick check (typecheck/lint) to gauge current state.

For each interrupted agent, note: original brief, what already exists on disk, what remains.

### Step 3: Recover each interrupted agent

For each interrupted `agentId`, in order:

1. `SendMessage` to the agent's original ID asking it to resume its task.
   - Success (`"resumed from transcript..."`) — it continues with full context. Move on.
   - Failure (`"No transcript found for agent ID"`) — the transcript did not survive. Go to the fallback.
2. Fallback: spawn a fresh `Agent` scoped to **only the remaining work** from Step 2, pointed at the surviving artifacts. Instruct it to inventory what exists first and fill gaps, not restart from zero.

Match the fresh agent's type to the original task (e.g. `mp-executor`, `mp-chrome-devtools-tester`). Omit `model` for agents that define their own; pass it explicitly when resuming as `general-purpose` or `claude`, which do not — match the original task's shape (`opus` for edits and orchestration, `sonnet` for search and review, `haiku` for a poll or a single command).

### Step 4: Recover orphaned background tasks

Background shells die or zombie with the session, not just agents.

- If a dev server / watcher the resumed work depends on is down, restart it.
- A zombie process can keep a port BOUND but unresponsive, so a fresh start silently lands on the next port and breaks scripts that hardcode the original. Kill the zombie first, then restart:

```powershell
Get-NetTCPConnection -LocalPort <port> -State Listen   # find PID holding the port
Stop-Process -Id <pid> -Force                          # kill zombie, then restart the task
```

### Step 5: Delegate the busy-work, not the main thread

Recovery verification belongs in sub-agents (matching the original delegation intent), with the main thread orchestrating.

- Re-running tests, inventorying artifacts, re-testing flows → spawn or resume sub-agents.
- The main thread coordinates and reports; it does not absorb the busy-work itself.

### Step 6: Report

Summarize:

- Agents resumed **with context** (SendMessage succeeded).
- Agents **respawned fresh** (transcript lost) and what remaining scope each got.
- Interrupted work with **nothing recoverable**.
- Background tasks restarted.
- What still remains to finish.

## Notes

- **Disk artifacts are the only reliable recovery substrate.** For future long runs, have agents write numbered evidence files as they go and keep `HANDOFF.md` current — a report that exists only in the conversation dies with the session.
- `SendMessage` resume works only if the agent's transcript file survived, which frequently it does not — always be ready for the fresh-agent fallback.
- Recovery behavior is easy to get inconsistent (resume vs respawn vs abandon). This skill fixes the order: assess state, try resume, fall back to a scoped fresh agent, delegate the busy-work.
