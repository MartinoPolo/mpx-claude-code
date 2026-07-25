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
`haiku`, `fable`; a full model ID such as `claude-sonnet-5`; or `inherit`. **Omitting
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

No agent in this repo grants `Agent`, so nothing here breaks on an upgrade past
2.1.216. Keep it that way: an agent that needs work done by another agent reports that
need to its parent and lets the parent spawn. Nesting only appears where a skill spawns
a `general-purpose` orchestrator that then spawns others
([`VERIFY_FIX_ORCHESTRATOR.md`](VERIFY_FIX_ORCHESTRATOR.md),
[`CI_FIX_AGENT.md`](CI_FIX_AGENT.md)) — re-verify those after any upgrade.

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
