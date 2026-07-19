---
name: mp-playwright-test
description: 'Visually verifies UI changes with raw Playwright over a defined scope, reporting a per-surface PASS/FAIL table with screenshots. Use when: "playwright test", "visually verify"'
argument-hint: "[uncommitted | pr | <area of the app>]"
allowed-tools: Read, Grep, Glob, Agent, Bash(git *), Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: testing
---

# mp-playwright-test

Run reliable browser verification over a defined scope. This skill owns **scope → surfaces** and orchestration. Read `${CLAUDE_SKILL_DIR}/../shared/PLAYWRIGHT_TESTING.md` now — the reliability rules (sanity-gate, assert-don't-eyeball, programmatic auth, never `networkidle`) live there and are followed verbatim. $ARGUMENTS

## Rules

- **Raw Playwright only** — the project's installed `playwright` dep, run as a Node script. Never a browser MCP (that is the exploratory `mp-playwright-tester` agent's job, not the reliability path).
- **Verify only** — assert and screenshot; never edit source.
- This skill encodes **policy**; the runner command, dev-server port, auth endpoint, and seed users come from the project's `AGENTS.md` / memory, not from here.

## Step 1: Resolve scope

Parse `$ARGUMENTS`:

- `uncommitted` (or empty) → **working-tree mode**: `git diff --name-only HEAD` (+ untracked).
- `pr` → **PR mode**: `gh pr view --json number,headRefName` then `gh pr diff --name-only` for the current branch's open PR.
- anything else → **verbal mode**: treat the text as a description of the app area to test.

## Step 2: Map scope → surfaces

- **working-tree / PR mode** — from the changed file list, keep UI-affecting files (routes, components, styles, layouts). Resolve each to the route(s) that render it. Drop pure backend/logic changes: they have **no visual surface** and are out of scope for this skill.
- **verbal mode** — translate the described area into the concrete route(s) and interactions to exercise (run a quick `Explore` if the routes are not obvious).

If mapping yields zero UI surfaces, stop and report that there is nothing to visually verify.

## Step 3: Discover project specifics

Per `${CLAUDE_SKILL_DIR}/../shared/PLAYWRIGHT_TESTING.md` § *Discover project specifics*, read the project's `AGENTS.md` / `CLAUDE.md` / memory for: the Playwright runner/helper (e.g. `scripts/shot.mjs`), the dev-server start command and **exact port**, the sign-in API + seed users, and where credentials live (`.local/`, `.env.local`). If no runner script exists, the verifier writes a minimal one from the shared skeleton.

## Step 4: Verify in a sub-agent

Spawn a read-only `claude` sub-agent (Sonnet) to run the verification. Give it: the surface list (with the route + what changed for each), the discovered runner/port/auth details, and the instruction to Read `${CLAUDE_SKILL_DIR}/../shared/PLAYWRIGHT_TESTING.md` and follow it exactly — **stale-worktree sanity-gate FIRST**, then programmatic auth, explicit waits (never `networkidle`), one measured assertion per surface, a screenshot per surface under `test-results/`. It verifies every surface even if one fails, and returns the PASS/FAIL table — it does not fix anything.

The sanity-gate is load-bearing: if the running dev server does not reflect the code under test, the sub-agent must kill the stale server and start one bound to this checkout before verifying (see [`mp-continue`](../mp-continue/SKILL.md) for the port-zombie kill/restart pattern).

## Step 5: Report

Relay the sub-agent's per-surface table: surface, `PASS`/`FAIL`/`BLOCKED`, measured value vs expected, and the screenshot path. Call out any surface where the sanity-gate had to restart the server. Failures are reported, not fixed — hand them back to the caller (or to `/mp-execute`) to resolve.
