# Sub-Agents — Benchmarks & the `Explore` Override

Deep-dive behind the agent roster table in the [README](../README.md). The spawn rule set
itself lives in [`skills/shared/SUBAGENT_PROTOCOL.md`](../skills/shared/SUBAGENT_PROTOCOL.md),
with every rule tagged `TESTED`, `DOC`, or `UNVERIFIED`.

## Model/effort benchmark (July 2026)

An 80-sub-agent benchmark settled three open questions in `SUBAGENT_PROTOCOL.md` § 10:

- The seven `mp-reviewer-*` agents are pinned to `effort: medium`: against a diff with ten
  seeded defects, `medium` caught 10/10 where `low` caught 8/10, at the same cost as `high`,
  with zero false positives at every level.
- `Explore`'s `effort: low` pin was confirmed on the real agent — it matches `medium` for 27%
  less.
- Haiku stays on `mp-checker` and `mp-git-committer` — correct and cheaper — but was 2.4×
  *more* expensive than sonnet on `mp-pr-manager`, which now runs sonnet.

Model choice by task category is § 11, cross-checked against
[DeepSWE v1.1](https://deepswe.datacurve.ai/) for implementation and
[Design Arena](https://www.designarena.ai/leaderboard) for design. The shared model-class policy
allows Fable only as a deliberate frontier escalation for manual large-task orchestration; the
standing roster remains advanced, standard, or mechanical. `high` is the effort ceiling. Haiku
supports no effort at all, so its agents declare none.

Three findings drive the roster table:

- **Pick on horizon, not difficulty**: on bounded tasks cost scales with tokens so the cheap
  model wins, but on long-horizon autonomous work it scales with wrong turns, where Sonnet 5
  runs $26.40/task against Opus 4.8's $13.22 while scoring *lower* (54% vs 59%) and Haiku
  scores ~0%.
- **Effort buys function, not looks**: a full low→medium→high sweep moves aesthetic Elo by +15
  and agentic Elo by +52, so design sits at `medium` — high enough to preserve output detail,
  since effort throttles all output tokens and not just thinking.
- **The model gap dwarfs the effort gap for design**: Opus 5 leads Sonnet 5 by ~130 Elo,
  roughly ten times what any effort setting is worth.

One mechanic to keep in mind when authoring: **the `Agent` tool has no `effort` parameter.**
Effort is frontmatter-only, so `general-purpose`/`claude` spawns inherit the caller's effort and
cannot override it — writing `effort:` into a spawn instruction is a defect, not configuration.

`effort:` is a frontmatter-only reasoning knob, independent of `Explore`'s breadth wording
(`quick`/`medium`/`very thorough`) — see `SUBAGENT_PROTOCOL.md` § 10.

[`scripts/usage-audit.mjs`](../scripts/usage-audit.mjs) counts real skill and agent invocations
across the local session store, to tell live workflows from dead ones.
[`scripts/analyze-subagent-models.py`](../scripts/analyze-subagent-models.py) parses
`~/.claude/projects/**/*.jsonl` and reports which model every spawned sub-agent actually ran
on — the way to verify any of the above rather than assume it. The measured rule: an explicit
`model` parameter is obeyed 100% of the time, prose asking for a model is obeyed 0% of the time.

## Why `Explore` is overridden

Claude Code delegates to a built-in `Explore` agent on its own, without being asked, whenever a
question needs a broad codebase sweep. Since Claude Code v2.1.198 that built-in **inherits the
session model** (capped at Opus), so with `"model": "claude-opus-5[1m]"` in `settings.json`
every automatic exploration was running on Opus.

A user-level agent named `Explore` overrides the built-in and keeps its own `model`, so
[`agents/Explore.md`](../agents/Explore.md) pins it to Sonnet. This is preferred over the
`CLAUDE_CODE_SUBAGENT_MODEL` env var, which is higher-priority but blunt — it would also force
`mp-issue-analyzer`, `mp-tdd-executor`, and `mp-ui-variant-generator` off Opus.

Call sites therefore **never pass `model` when spawning `Explore`** — see
[`skills/shared/EXPLORATION.md`](../skills/shared/EXPLORATION.md).

Two gotchas, both verified against session transcripts:

- **`name` must be capitalised `Explore`.** A lowercase `explore` agent does not override the
  built-in.
- **`disallowedTools` subtracts from the full tool set**, not from the built-in's curated set —
  so an override must re-deny everything the built-in denied (`Agent`, `Artifact`,
  `ExitPlanMode`, `Edit`, `Write`, `NotebookEdit`) or it silently gains permissions the
  built-in withheld.

The override is confirmed working: bare `Explore` spawns resolve to `claude-sonnet-5` while the
main thread runs `claude-opus-5[1m]`, and every denied tool rejects on attempt with
`exists but is not enabled in this context`.

## Roster notes

- `mp-check-fixer` and `mp-ci-fixer` are the only agents granted the `Agent` tool — both exist
  to keep findings, test output and CI logs out of the caller's context, which requires
  spawning. That makes them the repo's only exposure to the sub-agent nesting depth ceiling;
  re-verify both after a Claude Code upgrade. See `SUBAGENT_PROTOCOL.md` § 5.
- Each agent's `description` **and its `tools` list** are printed into the agent roster in
  every session, so an enumerated MCP tool list is a standing context charge. Agents needing
  MCP tools omit `tools` and use `disallowedTools` instead — see
  [`skills/shared/AUTHORING.md`](../skills/shared/AUTHORING.md) § Tool grants.
- All 7 `mp-reviewer-*` agents read the shared
  [`skills/shared/REVIEWER_PROTOCOL.md`](../skills/shared/REVIEWER_PROTOCOL.md) (verification
  discipline + report format); role-specific judgment criteria stay in each agent file.
- `mp-context7-docs-fetcher` is unbenchmarked: the context7 plugin had been installed against an
  unrelated project path, so it registered no server in this repo despite being enabled. It is
  now installed at user scope and connected, pending confirmation in a fresh session.
