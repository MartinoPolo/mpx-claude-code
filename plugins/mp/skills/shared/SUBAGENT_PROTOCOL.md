# Sub-Agent Protocol

Canonical rules for spawning and instructing sub-agents. Skills and agents reference
this file instead of restating it.

Every rule is tagged: `TESTED` (measured in this repo), `DOC` (Claude Code docs),
`EXTERNAL` (published benchmark), `UNVERIFIED` (provisional inference — re-check before
depending on it). The raw benchmark tables behind every `TESTED` verdict live in
[docs/SUBAGENTS.md](../../docs/SUBAGENTS.md) § Benchmark evidence.

## 1. Model selection — only the `model` parameter works

- `TESTED` — an explicit `model` parameter on the Agent call is obeyed **100%**
  (300/300 spawns); prose like "spawn a Sonnet sub-agent" is obeyed **0%** (0/5). A model
  name in skill text is a silent cost bug, not an instruction.
- `DOC` — resolution order, highest first: `CLAUDE_CODE_SUBAGENT_MODEL` env var →
  per-invocation `model` parameter → agent frontmatter `model:` → the main conversation's
  model. Valid `model:` values: `sonnet`, `opus`, `haiku`, `fable`, a full model ID, or
  `inherit`.
- **Omitting `model:` is exactly `inherit`** — silence selects the session model, which on
  this machine is `claude-opus-5[1m]`, the most expensive option (`TESTED` on bare
  `Explore` spawns before the override existed). There is no cheap default.
- Pass `model` at the call site **only when the agent declares none**:

| Agent type | Declares `model:`? | At the call site |
| --- | --- | --- |
| Every `mp-*` agent in `agents/`, and `Explore` | yes | **omit** `model` |
| `general-purpose`, `claude`, `Plan`, `fork` | no | **pass** `model` explicitly |

Passing `model` to a declaring agent duplicates the declaration and drifts the moment the
agent changes; omitting it for a non-declaring agent lands on the session model.

## 2. Nesting is off by default — orchestrate from the main thread

- `TESTED` — nested spawns do not inherit reliably: 16 `Explore` spawns issued *by other
  sub-agents* resolved to haiku or opus, never sonnet, even from a sonnet parent. Fan out
  from the main thread. `UNVERIFIED` — whether the `agents/Explore.md` override corrects
  nested spawns.
- `DOC` — `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` defaults to **0**: the `Agent` tool is
  withheld from every sub-agent regardless of its `tools:` grant. (Nesting was on by
  default only in v2.1.172–v2.1.216.)
- Exactly two agents grant `Agent`: `mp-check-fixer` and `mp-ci-fixer` — orchestrators
  that exist to keep checks, reviewer findings, and CI logs out of the caller's context.
  They are the repo's only upgrade exposure; **re-verify both after any version change.**
  Every other agent reports the need to its parent and lets the parent spawn.
- `DOC` — other ceilings: 200 sub-agents per session, 20 concurrent.

## 3. Tool grants

`TESTED` by attempting the calls, not by asking:

- **`tools:` is a strict allowlist.** Unlisted tools are absent from the agent's schema
  entirely. `Agent` is not granted by default.
- **`disallowedTools:` subtracts from the *full* tool set**, not from a built-in's curated
  set — so overriding a built-in silently widens permissions unless every tool the
  built-in denied is re-denied. When both are set, `disallowedTools` applies first (`DOC`).
- **Write `Agent`, not `Task`** — `Task` is the deprecated pre-2.1.63 alias.
- Some tools are stripped from every sub-agent regardless of frontmatter
  (`AskUserQuestion`, `EnterPlanMode`/`ExitPlanMode`, `ScheduleWakeup`, `TaskOutput`,
  `Workflow`, …), and background sub-agents — the default since v2.1.198 — keep a
  narrower set still. **Effective tools ≠ frontmatter; confirm by attempting the call.**
- An MCP-dependent agent with a tight allowlist and no `WebSearch`/`WebFetch` fallback
  **fails rather than degrades** when its server is unregistered — confirm MCP tools exist
  with `ToolSearch` before trusting them (`TESTED` via a silent Context7 outage).
- `DOC` — frontmatter fields: `name`, `description`, `tools`, `disallowedTools`, `model`,
  `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`,
  `effort`, `isolation`, `color`, `initialPrompt`.

## 4. Overriding a built-in agent

`TESTED` on `Explore`:

- **Match the built-in's capitalisation exactly.** `name: Explore` overrides;
  `name: explore` does not — tested behaviour beats the docs' lowercase-hyphen rule.
  Custom `mp-*` agents stay lowercase-hyphenated.
- **Copy the built-in's `description` verbatim.** It drives auto-delegation; rewording
  changes *when* Claude delegates.
- **Keep the body thin.** The override replaces the built-in's tuned system prompt.
- Agent definitions apply mid-session; a new skill needs a new session. The two reload
  semantics differ — generalising from one to the other produces wrong diagnoses.

## 5. Verify by attempting, never by asking

`TESTED` — asked whether `Edit` was available, an agent answered yes; the actual call
returned `No such tool available: Edit`.

- **Permissions**: make the agent attempt the call and report the verbatim result.
- **Models**: read `toolUseResult.resolvedModel` from the session `.jsonl` — recorded at
  spawn time only, and not a whole-run guarantee. Asking an agent which model it is
  produces no reliable evidence.
- `python3 scripts/analyze-subagent-models.py` joins spawns to sidechain transcripts and
  reports what actually ran (defaults to `~/.claude/projects`).

## 6. Model classes

Skills describe work with a **model class**; harness resolvers pick the concrete model.
Prose model names configure nothing (§ 1), and shared skills must stay portable across
harnesses.

| Model class | Claude Code | Pi | Best for |
| --- | --- | --- | --- |
| `mechanical` | `haiku`, no effort | Luna, `low` thinking | Bounded, no-judgment work: checks, commits, lookups |
| `standard` | `sonnet`, `low` or `medium` | Terra, `low` or `medium` | Exploration, review, docs, bounded judgment |
| `advanced` | `opus`, task-matched effort | Sol, task-matched | Implementation, design, architecture, deep analysis |
| `frontier` | `fable`, `high` effort | Sol, `high` | Deliberate manual escalation for large-task orchestration |

`frontier` is never a standing sub-agent class — no generated frontier agents exist.
`high` is the automatic-agent effort ceiling; Pi's `xhigh`/`max` are prohibited.
Frontmatter and tool calls still use harness-native `model:` values — classes are policy
terms, not valid `model:` values.

## 7. Effort

- `DOC` — `effort:` (`low`/`medium`/`high` permitted here) is **frontmatter-only**; the
  `Agent` tool has no `effort` parameter. `TESTED` — prose never sets it, and `Explore`
  breadth wording ("very thorough") is search scope, not reasoning effort.
- **Omitting `effort:` inherits the caller's effort** — pin it explicitly on every
  non-haiku agent, or an agent meant to run cheaply runs at `high` whenever the
  orchestrator does. Effort is inert on haiku (`TESTED`) — leave it unset there.
- `TESTED` verdicts (raw tables in docs/SUBAGENTS.md):
  - **Search**: sonnet at `low` matches `medium` and matches opus on multi-hop tracing, at
    a third of opus's cost. `Explore` keeps `effort: low`.
  - **Review**: `medium` is the knee — full seeded-defect recall (10/10 vs `low`'s 8/10)
    at the same cost as `high`, zero false positives at every level. `mp-reviewer-*` pin
    `effort: medium`. `UNVERIFIED` for `mp-scanner-architecture` and `mp-issue-analyzer` —
    different task shapes, not benchmarked.
  - **Browser work is the exception**: sonnet scored 3/10 at `low` vs 9/10 at `high`, so
    `mp-chrome-devtools-tester` keeps `effort: high`.
  - **Haiku wins only tightly scoped contracts** (`mp-checker`, `mp-git-committer`); where
    the agent must explore and compose (`mp-pr-manager`) haiku cost 2.4× sonnet.

## 8. Model by task shape — horizon, not difficulty

`EXTERNAL` — DeepSWE v1.1: on long-horizon autonomous work, Sonnet 5 costs 2.2× Opus 4.8
per task while scoring *lower*, and haiku scores ~0. Long-task spend is dominated by wrong
turns, not token price. The rule that falls out:

- **Bounded** (one deliverable, exploration done by the caller): cost scales with tokens —
  the cheap model wins.
- **Open-ended** (the agent explores, decides, self-corrects): cost scales with wrong
  turns — the capable model is usually also the cheaper one.

| Task shape | Model class | Claude effort | Agents |
| --- | --- | --- | --- |
| Orchestration (multi-phase loop) | frontier or advanced | high | the session; nested orchestrators |
| Issue/codebase analysis → fix plan | advanced | high | `mp-issue-analyzer` |
| Design, architecture, interface | advanced | medium | `mp-ui-variant-generator` |
| Implementation — iterating to green | advanced | medium | `mp-tdd-executor` |
| Implementation — pre-analysed chunk | advanced | low | `mp-executor` |
| Exploratory loop against live feedback | advanced | high | `mp-chrome-devtools-tester` |
| Review | standard | medium | 7 × `mp-reviewer-*`, `mp-scanner-architecture` |
| Exploration / codebase search | standard | low | `Explore` |
| Bounded, some judgment | standard | low | `mp-pr-manager`, `mp-issue-finder`, `mp-unresolved-issue-tracker` |
| Bounded, no judgment | mechanical | — | `mp-checker`, `mp-git-committer`, `mp-context7-docs-fetcher` |

- `general-purpose` and `claude` declare neither model nor effort: `model:` is
  load-bearing at every such call site, and effort is simply not settable — it inherits
  the caller's. Writing `effort:` into a spawn instruction is a defect, not configuration.
  Where a specific effort matters, use a real `mp-*` agent with it pinned; otherwise shape
  behaviour through prompt content ("keep this a scan, not a review"), which does work.
- Two pins are contract-dependent: `mp-executor` is `low` only because callers pre-analyse
  and hand it a bounded scope — see [EXECUTOR_CONTRACT.md](EXECUTOR_CONTRACT.md); a vague
  prompt puts it back in the open-ended regime where `low` is wrong. `mp-tdd-executor`
  gets `medium` because iterating to green is exactly the wrong-turn regime.
- `EXTERNAL` — Design Arena: **effort buys function, not looks** (a full low→high sweep
  moves aesthetic Elo ≈ +15; the Opus-over-Sonnet model gap is ~130 Elo, worth ten times
  any effort setting). Design work never drops below opus. `mp-ui-variant-generator` sits
  at `medium` because effort throttles *all* output tokens, not just thinking — a
  low-effort variant writes visibly less markup and CSS.

## Related

- [docs/SUBAGENTS.md](../../docs/SUBAGENTS.md) — raw benchmark evidence behind every `TESTED` verdict
- [EXPLORATION.md](EXPLORATION.md) — when and how to delegate searches
- [AUTHORING.md](AUTHORING.md) — conventions shared by skills and agents
