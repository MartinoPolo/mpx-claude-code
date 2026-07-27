# Sub-Agent Protocol

Canonical rules for spawning and instructing sub-agents. Skills and agents reference
this file instead of restating it.

Every rule below is tagged with its evidence. `TESTED` means it was measured or probed
directly in this repo; `DOC` means it comes from the Claude Code documentation;
`UNVERIFIED` means it is a reasonable inference that no one has confirmed. Treat
`UNVERIFIED` rules as provisional and re-check before depending on them.

## 1. Only the `model` parameter selects a model — prose never does

`TESTED` — 532 spawns parsed from session transcripts:

| Signal | Obeyed | n |
| ------------------------------------------- | -------- | ------- |
| `model` parameter on the Agent tool call | **100%** | 300/300 |
| Prompt or skill text saying "use a sonnet sub-agent" | **0%** | 0/5 |

Writing "spawn a **Sonnet** sub-agent" in a skill body is a **no-op**. It reads as an
instruction and does nothing; the spawn silently runs on whatever the default resolves
to. Every such sentence is a cost bug.

When a call site needs a specific model, it passes a real `model` field. When it does
not need one, it says nothing about models at all.

## 2. Resolution order

`DOC` — `sub-agents.md:303-308`, highest priority first:

1. `CLAUDE_CODE_SUBAGENT_MODEL` environment variable
2. per-invocation `model` parameter
3. agent frontmatter `model:`
4. the main conversation's model

Valid `model:` values (`DOC` — `sub-agents.md:281`): the aliases `sonnet`, `opus`,
`haiku`, `fable`; a full model ID such as `claude-sonnet-5`; or `inherit`. Of these, only
`sonnet`, `opus`, `haiku` are permitted in this repo — § 11. **Omitting
`model:` is exactly equivalent to `inherit`** — both mean "use the main conversation's
model". There is no cheap default: silence selects the session model.

## 3. Pass `model` only when the agent declares none

Follows from §2.

| Agent type | Declares `model:`? | At the call site |
| ------------------------------------------- | ------------------ | ------------------------- |
| Every `mp-*` agent in `agents/`, and `Explore` | yes | **omit** `model` |
| `general-purpose`, `claude`, `Plan`, `fork` | no | **pass** `model` explicitly |

Passing `model` to an agent that declares its own duplicates the declaration and drifts
the moment the agent changes. Omitting `model` for an agent that declares none means it
inherits the main conversation's model — which for this machine is
`claude-opus-5[1m]`, the most expensive option.

Built-in agents that are not overridden carry their own defaults: `claude-code-guide`
resolved to haiku on 16 of 17 observed spawns (`TESTED`).

## 4. A bare sub-agent inherits the parent thread's model

`TESTED` — bare `Explore` before the override existed:

| Parent main-thread model | Resolved to | n |
| ------------------------ | -------------------- | -- |
| `claude-opus-4-8` | `claude-opus-4-8[1m]` | 15 |
| `claude-opus-5` | `claude-opus-5[1m]` | 4 |
| `claude-sonnet-5` | `claude-sonnet-5` | 1 |

The `[1m]` suffix is the 1M-context variant.

## 5. Nested spawns do not inherit reliably

`TESTED` — 16 `Explore` spawns issued *by other sub-agents* resolved to haiku (11) or
opus-4-8 (5), never sonnet, even when the spawning agent was sonnet. Nested model
resolution is a separate and less predictable path.

Orchestrate fan-out from the main thread wherever practical, rather than relying on a
sub-agent's sub-agents landing on the intended model.

**Nesting is version-dependent and is going away by default.** `DOC`: from v2.1.172
through v2.1.216 sub-agents could nest by default, up to five layers. Outside that
range, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` defaults to **0** — the `Agent` tool is
withheld from every sub-agent regardless of its `tools:` grant.

Exactly two agents grant `Agent`: `mp-check-fixer` and `mp-ci-fixer`. Both are
orchestrators whose whole purpose is to keep checks, reviewer findings, and CI logs out
of the caller's context, which is impossible without spawning. **They are the repo's
only upgrade exposure — re-verify both after any version change.** Every other agent
stays nesting-free: one that needs work done by another agent reports that need to its
parent and lets the parent spawn.

Granting `Agent` in frontmatter neither creates nor worsens the exposure. A
`general-purpose` orchestrator holds `*` and so inherits `Agent` implicitly; both forms
lose it identically when the depth ceiling is 0. Declaring it makes the dependency
greppable instead of invisible.

Other documented ceilings: 200 sub-agents per session
(`CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`) and 20 concurrent
(`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`).

`UNVERIFIED` — whether the `agents/Explore.md` override also corrects nested spawns.

## 6. Tool grants

`TESTED` by attempting the calls, not by asking:

- **`tools:` is a strict allowlist.** Unlisted tools are absent from the agent's schema
  entirely — there is no call to attempt and no error to catch. `Agent` is **not**
  granted by default; an agent without it cannot delegate, and its parent must do the
  spawning and pass results in.
- **`disallowedTools:` subtracts from the *full* tool set**, not from a built-in agent's
  curated set. Denied tools are present-but-rejected:
  `No such tool available: X. X exists but is not enabled in this context.`
- **Overriding a built-in silently widens permissions.** The override starts from the
  full tool set, so every tool the built-in denied must be re-denied explicitly.
- **Setting both is allowed.** `DOC` — `sub-agents.md:360`: `disallowedTools` is applied
  first, then `tools` is resolved against the remaining pool.
- **`Task` is the deprecated name for `Agent`.** `DOC` — `sub-agents.md:378`: the tool
  was renamed in version 2.1.63 and `Task(...)` still works as an alias. `TESTED`: an
  agent granted `tools: … Task` sees a tool named `Agent` and spawns successfully.
  Write `Agent`.
- **Some tools are stripped from every sub-agent regardless of frontmatter**, so denying
  them explicitly is harmless but redundant: `AskUserQuestion`, `EndConversation`,
  `EnterPlanMode`, `ExitPlanMode` (unless `permissionMode: plan`), `ScheduleWakeup`,
  `TaskOutput`, `WaitForMcpServers`, `Workflow`, and `Agent` when nesting is off.
- **Background sub-agents keep a narrower set still.** Background is the default since
  v2.1.198, so an agent's *effective* tools are usually smaller than its frontmatter
  suggests. Confirm by attempting the call rather than reading the frontmatter.

Agent frontmatter fields (`DOC` — `sub-agents.md:273-292`): `name`, `description`,
`tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`,
`mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `color`,
`initialPrompt`.

## 7. Overriding a built-in agent

`TESTED`, from overriding `Explore`:

- Overriding a built-in by name is supported. `DOC` — `sub-agents.md:45`: "A user or
  project subagent named `Explore` overrides the built-in."
- **Match the built-in's capitalisation exactly.** `TESTED`: `agents/Explore.md` with
  `name: Explore` overrides; `agents/explore.md` with `name: explore` does not. This
  contradicts `sub-agents.md:277`, which says `name` is "lowercase letters and
  hyphens" — the tested behaviour wins, and the rule applies only to overrides.
  Custom `mp-*` agents stay lowercase-hyphenated.
- **Copy the built-in's `description` verbatim.** Automatic delegation is triggered by
  description matching, so rewording changes *when* Claude delegates, not just how.
- **Keep the body thin.** Overriding replaces the built-in's tuned system prompt,
  including its breadth calibration. A verbose body trades cost for worse behaviour.
- **Agent definitions apply mid-session** — no restart needed. *Skills do not*: a newly
  created skill is not discovered until the next session. These two have different
  reload semantics; generalising from one to the other produces wrong diagnoses.

## 8. Verify by attempting, never by asking

`TESTED` — asked whether `Edit` was available, an agent answered "yes". It was wrong;
the actual call returned `No such tool available: Edit`.

- To test a **permission**, make the agent attempt the call and report the verbatim
  result.
- To test a **model**, read `resolvedModel` from the transcript. Asking an agent which
  model it is does not produce reliable evidence.

`resolvedModel` is recorded at launch time only and is not a guarantee for the whole
run: 27 sidechains logged assistant turns from more than one model under a single
`resolvedModel` (`TESTED`, cause undetermined).

## 9. Choosing a model

| Model | Best for |
| -------- | ----------------------------------------------------------- |
| `haiku` | Fast mechanical work: running checks, committing, simple lookups |
| `sonnet` | Exploring, reviewing, docs, moderate-complexity implementation |
| `opus` | Complex reasoning: architecture, analysis, multi-step implementation |

## 10. Effort is frontmatter — prose never sets it

`DOC` — agent frontmatter accepts `effort:` with values `low`, `medium`, `high`, `xhigh`,
`max` (see the field list in §6), of which this repo permits `low`, `medium`, `high` — § 11.
Resolution mirrors §2: environment variable, then
frontmatter `effort:`, then the session effort. **Omitting `effort:` inherits the session
effort** — silence is not a cheap default, exactly as with `model:`.

The `Agent` tool has no `effort` parameter. Frontmatter is the only per-agent lever;
`Workflow`'s `agent(prompt, {effort})` is the only per-call one.

`TESTED` — writing "very thorough" in a delegation prompt does not raise reasoning effort.
Breadth is search scope; the two are independent knobs.

`TESTED` — 66 sub-agents, hard multi-hop tracing across a real SvelteKit repo (3 tasks,
scored against verified ground truth):

| Arm | Score | Tool calls | $/task |
| ----------------- | --------- | ---------- | ------ |
| sonnet-5 `low` | 30/30 | 9 | $0.158 |
| sonnet-5 `medium` | 30/30 | 10 | $0.207 |
| sonnet-5 `high` | invalid | 13 | $0.276 |
| opus-5 `low` | 30/30 | 11 | $0.502 |
| opus-5 `medium` | 30/30 | 24 | $0.776 |
| opus-5 `high` | 29.5/30 | 23 | $0.893 |

Opus-5 at `low` costs 3.2x sonnet-5 at `low` for an identical score. Effort scales cost
steeply within a model (sonnet 1.7x from `low` to `high`) and bought no accuracy on
search-shaped work. Opus-5 at `high` was the only arm to hallucinate a detail.

`TESTED` — effort does change quality on browser work: on one chrome-devtools task,
sonnet scored 3/10 at `low` against 9/10 at `high`. `mp-chrome-devtools-tester` keeps
`effort: high` for that reason, and moved to opus under § 11's model policy — it is the
one agent where a low-effort pin is known to be actively wrong.

`TESTED` — haiku 4.5 logs `effort={}` on every request; the field is inert there. Leave
`effort:` unset on haiku agents.

`TESTED` — the right effort for **reviewing**. Seven `mp-reviewer-*` agents against a real
diff carrying ten deliberately seeded defects, judged for recall *and* false positives:

| Effort | Seeded recall | False positives | Genuine unseeded | $ / full 7-agent review |
| ------ | ------------- | --------------- | ---------------- | ----------------------- |
| `low` | 8/10 | 0 | 4 | $1.04 |
| `medium` | 10/10 | 0 | 4 | $1.23 |
| `high` | 10/10 | 0 | 6 | $1.22 |

`medium` is the knee: full recall for the same cost as `high`. `low` saves 16% and misses
real defects — specifically the two subtlest (an unsanitised path join, and `||` defaults
overriding a legitimate `0`). Precision never degraded: **zero** false positives at every
effort, so "a reviewer that reports more is not better" did not bite here — raising effort
bought coverage, not noise. Pin `mp-reviewer-*` to `effort: medium`.

`UNVERIFIED` — `mp-scanner-architecture` and `mp-issue-analyzer` were **not** benchmarked.
Only the seven reviewers were. Architecture scanning and issue analysis are different
shapes (and `mp-issue-analyzer` runs on opus), so the table above does not transfer.

`TESTED` — `agents/Explore.md` itself, spawned as the real agent, on four hard multi-hop
tasks scored against ground truth verified from the repo:

| Arm | Score | $ / task | Tool calls |
| ---------------------- | ----------- | -------- | ---------- |
| `Explore` `low` | 38/38 | $0.112 | 5.9 |
| `Explore` `medium` | 38/38 | $0.154 | 6.0 |
| thin-body sonnet `low` | 37/38 | $0.152 | 5.2 |
| thin-body sonnet `medium` | 38/38 | $0.169 | 4.6 |

`low` matches `medium` exactly for 27% less, so the `effort: low` pin holds for the real
agent — no longer an extrapolation. `Explore.md`'s 36-line body did not hurt: it tied for
top score and was the cheapest arm, so §7's "keep the body thin" is not a reason to trim it.

Two caveats on that table, both load-bearing. The tasks **saturated** — three of four arms
scored 100%, so this bounds cost and does not show that `low` preserves quality on harder
work. And all 32 agents ran concurrently against a shared prompt prefix, so cache-read
attribution is order-dependent: treat the body-vs-thin cost gap as suggestive, not measured.

`TESTED` — haiku 4.5 on the mechanical agents. Four agents × 3 reps, tasks mirroring each
agent's real contract, against sonnet-5 at `low`:

| Agent | haiku $/task | sonnet $/task | haiku tools | sonnet tools | Correctness |
| ------------------ | ------------ | ------------- | ----------- | ------------ | ----------------------- |
| `mp-checker` | $0.045 | $0.052 | 2 | 2 | 3/3 both |
| `mp-git-committer` | $0.061 | $0.065 | 7–10 | 3–4 | 3/3 both |
| `mp-issue-finder` | $0.064 | $0.052 | 5–7 | 4 | 3/3 both |
| `mp-pr-manager` | $0.107 | $0.044 | 10–11 | 3 | haiku 3/3, sonnet 2/3 |

The earlier "haiku flails on search" result does **not** generalise to all mechanical work —
it tracks how much exploration the task needs. Where the task is tightly scoped (`mp-checker`,
2 tool calls) haiku is cheaper at identical quality. Where the agent must explore a diff and
compose from it (`mp-pr-manager`) haiku spends 3× the tool calls and **2.4× the cost** with
non-overlapping ranges across all reps. Both models passed `mp-git-committer`'s trap: no run
staged the planted `.env.local`, and all six returned the full seven-key JSON.

Keep `haiku` on `mp-checker` and `mp-git-committer`. `mp-issue-finder`'s gap ($0.012/task) is
within cache-attribution noise — no change. `mp-pr-manager`'s gap is real and worth acting on,
but sonnet dropped the repo's `#N` title prefix in 1 of 3 runs, and 2/3-vs-3/3 at n=3 is not a
quality finding — the prefix belongs in the agent body regardless of model.

`UNVERIFIED` — `mp-context7-docs-fetcher` could not be benchmarked. The context7 plugin was
installed with `scope: project` pinned to an unrelated repo, so despite being enabled in
`settings.json` it registered no server here. Reinstalled at user scope (`claude mcp add`
equivalent: `claude plugin install context7@claude-plugins-official --scope user`) and now
`✔ Connected`, but a session's tool registry is built at startup, so verification needs a
fresh session.

`DOC` — that outage was silent in a way worth guarding against. The agent's `tools:` allowlist
is `Read` plus the two MCP tools, with no `WebSearch`/`WebFetch`, so an unavailable MCP server
makes it fail rather than degrade. `agents/Explore.md` likewise instructs every exploration to
use Context7 for library questions. Before trusting either, confirm the tools exist with
`ToolSearch` — an agent claiming Context7 is available is not evidence that it is.

## 11. Model selection by task category

`EXTERNAL` — [DeepSWE v1.1](https://deepswe.datacurve.ai/) (Datacurve; 113 original
contamination-free long-horizon tasks, 91 repos, 5 languages; board read 2026-07-27):

| Model | pass@1 | $/task |
| ------------------- | ------ | ------ |
| `claude-opus-5` | 74% ±4 | $11.84 |
| `claude-fable-5` | 70% ±4 | $21.63 |
| `claude-opus-4.8` | 59% ±2 | $13.22 |
| `claude-sonnet-5` | 54% ±4 | $26.40 |
| `claude-sonnet-4.6` | 30% ±4 | $5.52 |
| `claude-haiku-4.5` | ~0% (v1; absent from v1.1) | — |

Two numbers drive everything below. Sonnet 5 costs **2.2× opus 4.8 per task** while scoring
lower — cheaper per token, far more tokens, because on a long task the spend is dominated by
wrong turns, not by output length. And haiku does not merely score worse on full-horizon
work, it scores zero.

That reconciles with § 10's local results rather than contradicting them, and the rule that
falls out is **horizon, not difficulty**:

- **Bounded** — one deliverable, verifiable output, exploration already done by the caller.
  Cost scales with tokens, so the cheap model wins. This is the regime § 10 measured, where
  haiku beat sonnet on `mp-checker` and sonnet at `low` matched `high` on review.
- **Open-ended** — the agent must explore, decide, and self-correct. Cost scales with the
  number of wrong turns, so the capable model is usually *also* the cheaper one.

The same curve is visible locally in miniature: on `mp-pr-manager`, the least-bounded of the
four haiku agents, haiku spent 3× the tool calls and 2.4× the cost. DeepSWE is that curve
extrapolated to a 100-step horizon.

### The policy

Three models, no others. **`fable` is banned** — cost without a matching gain for this repo's
work. `high` is the effort ceiling. **Never pair `sonnet` with `high`**: § 10 measured `high`
scoring identically to `medium` at identical cost on review, so on sonnet it buys nothing.

| Task shape | Model | Effort | Agents |
| ------------------------------------- | ------ | ------ | ------------------------------------------------ |
| Orchestration (multi-phase loop) | opus | high | the session; nested orchestrators |
| Issue/codebase analysis → fix plan | opus | high | `mp-issue-analyzer` |
| Design, architecture, interface | opus | medium | `mp-ui-variant-generator` |
| Implementation — iterating to green | opus | medium | `mp-tdd-executor` |
| Implementation — pre-analysed chunk | opus | low | `mp-executor` |
| Exploratory loop against live feedback | opus | high | `mp-chrome-devtools-tester` |
| Review | sonnet | medium | 7 × `mp-reviewer-*`, `mp-scanner-architecture` |
| Exploration / codebase search | sonnet | low | `Explore` |
| Bounded, some judgment | sonnet | low | `mp-pr-manager`, `mp-issue-finder`, `mp-unresolved-issue-tracker` |
| Bounded, no judgment | haiku | — | `mp-checker`, `mp-git-committer`, `mp-context7-docs-fetcher` |

**Pin `effort:` explicitly on every non-haiku agent.** An omitted `effort:` does not mean
"default" — it inherits the *caller's* effort (§ 10), so an agent intended to run cheaply runs
at `high` whenever the orchestrator does. Effort is inert on haiku, so haiku agents may omit it.

`general-purpose` and `claude` are the gap this cannot close. They declare neither model nor
effort, and **the `Agent` tool has no `effort` parameter** (§ 10) — so `model:` is load-bearing
at every such call site, while effort is simply not settable and inherits the caller's. Writing
`effort:` into a spawn instruction is a defect, not a fix: it reads as configuration and does
nothing. Where a specific effort actually matters, the work belongs in a real `mp-*` agent with
the effort pinned in frontmatter; short of that, shape the behaviour through prompt content
("keep this a scan, not a review"), which does take effect.

Two entries are contract-dependent rather than intrinsic. `mp-executor` is `low` only because
its callers pre-analyse and hand it concrete instructions for a small scope, converting an
open-ended task into a bounded one; a vague prompt puts it back in the DeepSWE regime, where
`low` is wrong — see [EXECUTOR_CONTRACT.md](EXECUTOR_CONTRACT.md). `mp-tdd-executor` gets
`medium` instead because red-green-refactor iterates until green, and that horizon is exactly
where DeepSWE shows spend concentrating in wrong turns.

`EXTERNAL` — design work never drops below opus, and effort does **not** buy aesthetics.
[Design Arena](https://www.designarena.ai/leaderboard) (blind human pairwise preference on
single-file HTML; figures pulled from its API 2026-07-27, not from the SEO blogs that
misreport it) separates the two cleanly:

| | Effect |
| --------------------------------------------- | ---------------------------------------- |
| GPT-5.1 low → medium → high, Website | 1197 → 1203 → 1212 (+15 Elo total) |
| GPT-5.1 low → medium → high, UI Component | 1189 → 1203 → 1194 (non-monotone, noise) |
| GPT-5.1 low → medium → high, Game Dev | 1207 → 1215 → 1235 (+28, monotone) |
| thinking on/off across 4 model pairs, Website | ≈ 0 Elo |
| thinking on/off across 4 model pairs, SVG | +20 Elo, positive in 4/4 |
| thinking on/off, agentic WebDev (Arena) | +8 to +55 Elo |

Same models, same voters — the only variable is whether the artifact is judged on how it
looks or on whether it works. Effort buys function. It is occasionally *negative* on looks:
Opus 4.6 thinking scored 11 Elo below non-thinking on UI Component.

The model gap dwarfs it. Design Arena UI Component: Opus 5 **1398** › Fable 5 1356 ›
Opus 4.6 1328 › Sonnet 4.6 1308 › Opus 4.8 1277 › Haiku 4.5 **1136**. Opus 5 over Sonnet 5 on
agentic WebDev is 130 Elo (~68% win rate) — worth roughly ten times any effort setting.

`mp-ui-variant-generator` therefore sits at `medium`, not `high`, and not `low` either: effort
throttles **all** output tokens on Claude, not just thinking ([Anthropic effort
docs](https://platform.claude.com/docs/en/build-with-claude/effort)), so a low-effort agent
emits terser markup and CSS, and a variant's perceived quality partly tracks how much detail
it bothered to write. `medium` is the floor that preserves output volume.

`UNVERIFIED` — architecture-design effort. ArchBench (arXiv 2603.17833) and SAKE (arXiv
2606.29520) both exist and neither ablates reasoning effort. Nobody has published this;
treat any number claiming otherwise as invented.

DeepSWE measures autonomous implementation only. It says nothing about review, exploration,
design, or structured extraction — for those, § 10's local results and stated experience are
the authority.

## How to verify any of this

Models are observable from two independent channels:

- `toolUseResult.resolvedModel` — in the main session `.jsonl`, at spawn time
- `message.model` — on every assistant entry in `<session>/subagents/agent-<id>.jsonl`

Join via `toolUseResult.agentId` ↔ the sidechain filename.

```bash
python3 scripts/analyze-subagent-models.py
```

Defaults to `~/.claude/projects`; pass a different root as `argv[1]`.

## Related

- [EXPLORATION.md](EXPLORATION.md) — when and how to delegate searches
- [AUTHORING.md](AUTHORING.md) — conventions shared by skills and agents
