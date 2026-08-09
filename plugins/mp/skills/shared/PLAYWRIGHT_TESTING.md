# Playwright Testing — Reliability Contract

Single source of truth for **reliable** browser verification of UI changes. Referenced by [`/mp:playwright-test`](../mp-playwright-test/SKILL.md) (scope-driven, on demand) and the mp-gh plugin's [`/mp-gh:batch-execute`](../../../gh/skills/mp-batch-execute/SKILL.md) (verify gate). Edit conventions here; the skills only add their own orchestration.

## Approach: raw Playwright, not a browser MCP

Drive the browser with **raw Playwright** — the project's own installed `playwright` dependency, run as a short Node script (e.g. `node scripts/shot.mjs`). A raw script is deterministic, reproducible, assertable, and works in headless / scheduled / remote runs where a browser MCP is unreliable or absent.

**Boundary vs the MCP agent.** The `mp-chrome-devtools-tester` agent (chrome-devtools MCP, spawned by `/mp:execute` step 6c) is for **interactive exploratory** testing only — a human-style click-through when e2e specs don't cover an interaction, plus performance traces and Lighthouse audits, which raw Playwright has no equivalent for. It is *not* the reliability path. Any check that must be trustworthy, repeatable, or run unattended uses raw Playwright per this file.

## Discover project specifics first

This file fixes the **principles**; the concrete commands are project-specific. Before testing, discover them from the project's `AGENTS.md`, `CLAUDE.md`, and memory:

- **Runner** — the Playwright helper/script and how to invoke it (e.g. `scripts/shot.mjs`, a `test:e2e` command).
- **Dev server** — start command and the exact port the app is served on.
- **Auth** — the sign-in API endpoint and seed/test users (credentials live in `.local/`, `.env.local`, `.env` — never hardcode or echo them).
- **Targets** — the routes/components under test and what visually changed.

If a helper script does not exist, write a minimal one under the project's scripts dir (see skeleton below) rather than inlining browser calls ad hoc.

## The five principles

1. **Stale-worktree sanity-gate FIRST.** Before trusting any screenshot or assertion, prove the running dev server reflects *the code under test*: assert a computed style or DOM fact that this change just introduced. If it does not match, the server is serving a different checkout/worktree/old build — kill the stale PID, start a dev server bound to this checkout, confirm the port, and only then verify. This is the single most important safeguard: without it, checks silently pass against old code. (See [`/mp:continue`](../mp-continue/SKILL.md) for the port-zombie kill/restart pattern.)
2. **Assert, don't just eyeball.** Prefer computed-style / geometry assertions (`getComputedStyle`, `boundingBox()`) over screenshot inspection alone, so a PASS is *measured*, not guessed. Keep screenshots as evidence, not as the assertion.
3. **Authenticate programmatically.** Sign in via the project's auth API (`context.request.post('/api/auth/...')`) rather than driving the login UI — faster and far less flaky. Reuse the storage state across checks.
4. **Wait explicitly; never `networkidle`.** Use `page.goto(url, { waitUntil: 'load' })` plus explicit `waitForSelector` / short settle timeouts. **Never** `networkidle` — SSE / long-poll / websocket surfaces never go idle and it hangs.
5. **One check per changed surface**, in a defined order; report a per-surface `PASS`/`FAIL` table with the **measured value**, plus a screenshot path as evidence.

## Scope: only what changed

Only surfaces whose **UI actually changed** need a visual check. Pure backend/logic changes skip straight past this — their gate is static checks + unit/e2e tests. Map each changed file/route to at most one surface; do not re-verify untouched pages.

## Minimal runner skeleton

Adapt to the project's stack; the shape is what matters (sanity-gate → auth → per-surface assert → screenshot):

```js
// node scripts/shot.mjs  (raw Playwright, no MCP)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const browser = await chromium.launch();
const context = await browser.newContext();

// 1. Sanity-gate: assert a fact this change introduced, else the server is stale.
const gate = await context.newPage();
await gate.goto(BASE, { waitUntil: 'load' });
// e.g. assert a new selector/computed style exists; throw if not → server is stale.

// 3. Programmatic auth (skip if public).
// await context.request.post(`${BASE}/api/auth/login`, { data: { ... } });

for (const surface of SURFACES) {
  const page = await context.newPage();
  await page.goto(BASE + surface.path, { waitUntil: 'load' });
  await page.waitForSelector(surface.ready);            // explicit wait, never networkidle
  const measured = await page.evaluate(surface.assert); // computed style / geometry
  await page.screenshot({ path: `test-results/${surface.name}.png` });
  console.log(surface.name, measured);                  // PASS/FAIL decided from measured value
}

await browser.close();
```

## Report shape

Per surface: `PASS` / `FAIL` / `BLOCKED`, the measured value vs expected, and the screenshot path. Failures never stop the run — verify every surface, then report the full table.
