# Sub-Agents — Benchmarks & the `Explore` Override

Deep-dive behind the agent roster table in the [README](../README.md). The spawn rule set
itself lives in [`skills/shared/SUBAGENT_PROTOCOL.md`](../skills/shared/SUBAGENT_PROTOCOL.md),
with every rule tagged `TESTED`, `DOC`, or `UNVERIFIED`.

## Model/effort benchmark (July 2026)

An 80-sub-agent benchmark settled three open questions in `SUBAGENT_PROTOCOL.md` § 7:

- The seven `mp-reviewer-*` agents are pinned to `effort: medium`: against a diff with ten
  seeded defects, `medium` caught 10/10 where `low` caught 8/10, at the same cost as `high`,
  with zero false positives at every level.
- `Explore`'s `effort: low` pin was confirmed on the real agent — it matches `medium` for 27%
  less.
- Haiku stays on `mp-checker` and `mp-git-committer` — correct and cheaper — but was 2.4×
  *more* expensive than sonnet on `mp-pr-manager`, which now runs sonnet.

Model choice by task category is § 8, cross-checked against
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
(`quick`/`medium`/`very thorough`) — see `SUBAGENT_PROTOCOL.md` § 7.

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
  re-verify both after a Claude Code upgrade. See `SUBAGENT_PROTOCOL.md` § 2.
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

## Benchmark evidence (raw data)

The measurements behind the `TESTED` verdicts in
[`SUBAGENT_PROTOCOL.md`](../skills/shared/SUBAGENT_PROTOCOL.md). The protocol states the
rules; this section preserves the numbers.

### Model parameter obedience (§ 1)

532 spawns parsed from session transcripts:

| Signal | Obeyed | n |
| --- | --- | --- |
| `model` parameter on the Agent tool call | **100%** | 300/300 |
| Prompt or skill text saying "use a sonnet sub-agent" | **0%** | 0/5 |

Built-in agents that are not overridden carry their own defaults: `claude-code-guide`
resolved to haiku on 16 of 17 observed spawns.

### Bare inheritance (§ 1)

Bare `Explore` before the override existed (`[1m]` is the 1M-context variant):

| Parent main-thread model | Resolved to | n |
| --- | --- | --- |
| `claude-opus-4-8` | `claude-opus-4-8[1m]` | 15 |
| `claude-opus-5` | `claude-opus-5[1m]` | 4 |
| `claude-sonnet-5` | `claude-sonnet-5` | 1 |

### Nested spawns (§ 2)

16 `Explore` spawns issued *by other sub-agents* resolved to haiku (11) or opus-4-8 (5),
never sonnet, even when the spawning agent was sonnet. `UNVERIFIED` — whether the
`agents/Explore.md` override also corrects nested spawns.

### Effort × model on search (§ 7)

66 sub-agents, hard multi-hop tracing across a real SvelteKit repo (3 tasks, scored
against verified ground truth):

| Arm | Score | Tool calls | $/task |
| --- | --- | --- | --- |
| sonnet-5 `low` | 30/30 | 9 | $0.158 |
| sonnet-5 `medium` | 30/30 | 10 | $0.207 |
| sonnet-5 `high` | invalid | 13 | $0.276 |
| opus-5 `low` | 30/30 | 11 | $0.502 |
| opus-5 `medium` | 30/30 | 24 | $0.776 |
| opus-5 `high` | 29.5/30 | 23 | $0.893 |

Opus-5 at `low` costs 3.2× sonnet-5 at `low` for an identical score. Effort scales cost
steeply within a model (sonnet 1.7× from `low` to `high`) and bought no accuracy on
search-shaped work. Opus-5 at `high` was the only arm to hallucinate a detail.

Browser work is the exception: on one chrome-devtools task, sonnet scored 3/10 at `low`
against 9/10 at `high` — the one agent (`mp-chrome-devtools-tester`) where a low-effort
pin is known to be actively wrong.

Haiku 4.5 logs `effort={}` on every request; the field is inert there.

### Reviewer effort (§ 7)

Seven `mp-reviewer-*` agents against a real diff carrying ten deliberately seeded
defects, judged for recall *and* false positives:

| Effort | Seeded recall | False positives | Genuine unseeded | $ / full 7-agent review |
| --- | --- | --- | --- | --- |
| `low` | 8/10 | 0 | 4 | $1.04 |
| `medium` | 10/10 | 0 | 4 | $1.23 |
| `high` | 10/10 | 0 | 6 | $1.22 |

`medium` is the knee: full recall for the same cost as `high`. `low` saves 16% and misses
the two subtlest defects (an unsanitised path join, and `||` defaults overriding a
legitimate `0`). Precision never degraded — zero false positives at every effort, so
raising effort bought coverage, not noise. `UNVERIFIED` — `mp-scanner-architecture` and
`mp-issue-analyzer` were not benchmarked; architecture scanning and issue analysis are
different shapes, so this table does not transfer.

### `Explore.md` as the real agent (§ 7)

Four hard multi-hop tasks scored against ground truth verified from the repo:

| Arm | Score | $ / task | Tool calls |
| --- | --- | --- | --- |
| `Explore` `low` | 38/38 | $0.112 | 5.9 |
| `Explore` `medium` | 38/38 | $0.154 | 6.0 |
| thin-body sonnet `low` | 37/38 | $0.152 | 5.2 |
| thin-body sonnet `medium` | 38/38 | $0.169 | 4.6 |

`low` matches `medium` exactly for 27% less, so the `effort: low` pin holds for the real
agent. `Explore.md`'s 36-line body did not hurt: it tied for top score as the cheapest arm.

Two load-bearing caveats: the tasks **saturated** (three of four arms at 100%), so this
bounds cost and does not show `low` preserves quality on harder work; and all 32 agents
ran concurrently against a shared prompt prefix, so cache-read attribution is
order-dependent — treat the body-vs-thin cost gap as suggestive, not measured.

### Haiku on mechanical agents (§ 7)

Four agents × 3 reps, tasks mirroring each agent's real contract, against sonnet-5 at `low`:

| Agent | haiku $/task | sonnet $/task | haiku tools | sonnet tools | Correctness |
| --- | --- | --- | --- | --- | --- |
| `mp-checker` | $0.045 | $0.052 | 2 | 2 | 3/3 both |
| `mp-git-committer` | $0.061 | $0.065 | 7–10 | 3–4 | 3/3 both |
| `mp-issue-finder` | $0.064 | $0.052 | 5–7 | 4 | 3/3 both |
| `mp-pr-manager` | $0.107 | $0.044 | 10–11 | 3 | haiku 3/3, sonnet 2/3 |

"Haiku flails on search" does not generalise to all mechanical work — it tracks how much
exploration the task needs. Tightly scoped (`mp-checker`, 2 tool calls): haiku cheaper at
identical quality. Exploring a diff and composing (`mp-pr-manager`): haiku spends 3× the
tool calls and 2.4× the cost, non-overlapping ranges across all reps. Both models passed
`mp-git-committer`'s trap: no run staged the planted `.env.local`. `mp-issue-finder`'s
$0.012/task gap is within cache-attribution noise. Sonnet dropped the repo's `#N` title
prefix in 1 of 3 `mp-pr-manager` runs — the prefix belongs in the agent body regardless
of model.

### DeepSWE v1.1 (§ 8)

[DeepSWE v1.1](https://deepswe.datacurve.ai/) (Datacurve; 113 original contamination-free
long-horizon tasks, 91 repos, 5 languages; board read 2026-07-27). Measures autonomous
implementation only — it says nothing about review, exploration, or design:

| Model | pass@1 | $/task |
| --- | --- | --- |
| `claude-opus-5` | 74% ±4 | $11.84 |
| `claude-fable-5` | 70% ±4 | $21.63 |
| `claude-opus-4.8` | 59% ±2 | $13.22 |
| `claude-sonnet-5` | 54% ±4 | $26.40 |
| `claude-sonnet-4.6` | 30% ±4 | $5.52 |
| `claude-haiku-4.5` | ~0% (v1; absent from v1.1) | — |

### Design Arena (§ 8)

[Design Arena](https://www.designarena.ai/leaderboard), blind human pairwise preference on
single-file HTML; figures pulled from its API 2026-07-27, not from the SEO blogs that
misreport it:

| | Effect |
| --- | --- |
| GPT-5.1 low → medium → high, Website | 1197 → 1203 → 1212 (+15 Elo total) |
| GPT-5.1 low → medium → high, UI Component | 1189 → 1203 → 1194 (non-monotone, noise) |
| GPT-5.1 low → medium → high, Game Dev | 1207 → 1215 → 1235 (+28, monotone) |
| thinking on/off across 4 model pairs, Website | ≈ 0 Elo |
| thinking on/off across 4 model pairs, SVG | +20 Elo, positive in 4/4 |
| thinking on/off, agentic WebDev (Arena) | +8 to +55 Elo |

Same models, same voters — effort buys function, occasionally *negative* on looks (Opus
4.6 thinking scored 11 Elo below non-thinking on UI Component). The model gap dwarfs it:
UI Component Elo runs Opus 5 **1398** › Fable 5 1356 › Opus 4.6 1328 › Sonnet 4.6 1308 ›
Opus 4.8 1277 › Haiku 4.5 **1136**; Opus 5 over Sonnet 5 on agentic WebDev is 130 Elo
(~68% win rate).

`UNVERIFIED` — architecture-design effort: ArchBench (arXiv 2603.17833) and SAKE (arXiv
2606.29520) both exist and neither ablates reasoning effort. Nobody has published this;
treat any number claiming otherwise as invented.

### Verification channels (§ 5)

Models are observable from two independent channels:

- `toolUseResult.resolvedModel` — in the main session `.jsonl`, at spawn time
- `message.model` — on every assistant entry in `<session>/subagents/agent-<id>.jsonl`

Join via `toolUseResult.agentId` ↔ the sidechain filename. `resolvedModel` is recorded at
launch time only and is not a whole-run guarantee: 27 sidechains logged assistant turns
from more than one model under a single `resolvedModel` (cause undetermined).
