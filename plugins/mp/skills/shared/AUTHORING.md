# Authoring Conventions

Rules shared by every skill and agent in this repo. `/mp:skill-create`, `/mp:agent-create`,
and `/mp:skill-audit` reference this file rather than each restating it.

For agent-facing writing structure, context pointers, semantic completion, disclosure,
and pruning, read [WRITING_FOR_AGENTS.md](WRITING_FOR_AGENTS.md). For spawning
sub-agents or choosing models, see [SUBAGENT_PROTOCOL.md](SUBAGENT_PROTOCOL.md).

## Where things live

| Artifact | Path | Frontmatter `name` |
| ------------- | -------------------------- | ---------------------------------- |
| Skill | `skills/<skill-name>/SKILL.md` | matches the directory name |
| Agent | `agents/<agent-name>.md` | matches the filename |
| Shared doc | `skills/shared/<NAME>.md` | none |

Custom agents are named `mp-<role>`. An agent that overrides a built-in instead matches
the built-in's name and capitalisation exactly — see SUBAGENT_PROTOCOL.md § 4.

The identities differ by harness. Claude plugin commands are keyed by plugin and skill
directory; Pi and Codex derive explicit invocation from frontmatter `name`. Claude invokes
a plugin skill as `/plugin:skill`, Pi as `/skill:name`, and Codex as `$name`. An agent's
`name` is its identity, while its filename can differ. Keep names and paths aligned so
discovery and explicit invocation remain predictable across harnesses.

## Descriptions and discoverability

A skill's `description` is its canonical portable context pointer. Pi and Codex route
only from it; Claude Code also appends optional `when_to_use`. Follow
[WRITING_FOR_AGENTS.md](WRITING_FOR_AGENTS.md) § Context pointers and invocation.

- **`description`** — 1–2 concise sentences, third person, stating what it does and every
  distinct trigger branch. It must route correctly by itself.
- **`when_to_use`** — optional Claude-only enrichment with no unique routing information.
  Prefer omission when the description already carries the triggers.
- Claude concatenates the fields and truncates them together at 1,536 characters.
- **Agents** — one line, max 250 chars, front-loading delegation branches.
- Describe observable purpose and triggers rather than internal implementation.

### Default to `disable-model-invocation: true`

| Frontmatter | You invoke | Claude invokes | Context cost |
| -------------------------------- | ---------- | -------------- | ------------------------------- |
| *(omitted)* | `/name` | yes | name + description + when_to_use |
| `disable-model-invocation: true` | `/name` | no | **nothing** |

A skill you always reach for by name gains nothing from being discoverable and costs
context in every session, including sessions in unrelated repos. Set the flag unless
Claude genuinely needs to reach for the skill unprompted.

For a skill whose file you cannot edit, the settings-side equivalent is
`skillOverrides: { "<name>": "user-invocable-only" }`. Plugin skills are unaffected by
`skillOverrides` — manage those through `/plugin`.

### Frontmatter portability

Claude Code supports `name`, `description`, `when_to_use`, `argument-hint`, `arguments`,
`disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`,
`model`, `effort`, `context`, `agent`, `background`, `hooks`, `paths`, and `shell`.
Pi and the Agent Skills standard also recognize `license`, `compatibility`, and `metadata`;
Codex routing depends on `name` and `description`. This repo uses `metadata` for
bookkeeping, not behavior. Treat every other harness-specific field as optional packaging:
the portable routing contract remains `name` plus `description`.

## Agent-facing prose

Use the positive targets, hierarchy, branch-based disclosure, semantic completion, and
pruning pass in [WRITING_FOR_AGENTS.md](WRITING_FOR_AGENTS.md). The local irreversible
guardrail remains: deprecating means moving to `deprecated/`, never deleting.

## Explicit references

Vagueness at a call site becomes a guess at runtime. Name things exactly:

- **Sub-agents** — the exact type: "Spawn `mp-issue-analyzer`". A skill that spawns
  anything lists `Agent` in `allowed-tools`.
- **Models** — a real `model` parameter, or nothing at all. Prose is a no-op, and the
  parameter is omitted for agents that declare their own model — SUBAGENT_PROTOCOL.md § 1.
- **GitHub** — the exact `gh` command: `gh issue create`, `gh pr list`.
- **Scripts and commands** — the exact path and invocation.
- **Searches** — delegate to `Explore`, with the breadth stated
  ([EXPLORATION.md](EXPLORATION.md)).

## Paths

This repo is symlinked as `~/.claude` and is **public on GitHub**. Personal absolute
paths never appear in a committed file. Machine roots come from the `MPX_*` environment
variables — see EXPLORATION.md § Paths outside the working directory.

Only `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}` are interpolated in skill
markdown (`skills.md:303`). Arbitrary environment variables are **not** interpolated in
any markdown — not SKILL.md, not agent files, not CLAUDE.md. A written `$MPX_WORK` is
literal text that the reading agent must resolve itself.

The rule covers example paths and sample content as much as real ones: a username in a
mockup's `file:///` link leaks exactly as much as one in an output path. The user's home
directory is no exception — a script derives it from `os.homedir()`, `$HOME` or
`$env:USERPROFILE`, never from a literal, and never from an `MPX_*` variable of its own.

A script that cannot resolve the root it needs **fails with a message naming the missing
variable**. Falling back to `process.cwd()` writes a personal asset into whichever repo
happened to be the working directory.

Skill deliverables meant for the user land under `MPX_AI_GENERATED`, in an all-caps
underscore-prefixed folder (`_PODCASTS`, `_TUTORIALS`, `_VIDEO_SHEETS`), one sub-folder
per run holding the sources, the prompt and the finished asset together. Intermediates
stay in the session scratchpad; only the files the user would open get promoted.

## Size and progressive disclosure

Use branch or sequence boundaries from
[WRITING_FOR_AGENTS.md](WRITING_FOR_AGENTS.md), not line count alone.

| File | Limit | On exceeding |
| ------------- | --------- | ------------------------------------------------ |
| `SKILL.md` | 200 lines | Split into `REFERENCE.md` / `EXAMPLES.md` |
| Agent body | 100 lines | Tighten — agents are single-purpose |

The upstream guidance is 500 lines for a SKILL.md. The 200-line cap here is a deliberate
local tightening, not an upstream requirement.

References stay one level deep: `SKILL.md` → `REFERENCE.md`, linked inline so they load
on demand.

A skill's content is read **once** and stays in context for the rest of the session — it
is not re-read on later turns. Write standing instructions that hold for the whole task
rather than one-time steps. Note also that `allowed-tools` grants are single-turn: they
clear on the user's next message even though the skill's content persists.

Prefer a script over prose when the operation is deterministic, repeatable, needs
explicit error handling, or would otherwise be more than ~10 lines of inline bash.

## Tool grants

`allowed-tools` (skills) and `tools` (agents) are allowlists — grant exactly what the
body actually uses, and no more. A grant with no corresponding usage in the body is dead
and gets removed. Tool-grant semantics for agents are in SUBAGENT_PROTOCOL.md § 3.

An agent that needs MCP tools lists none of them. Every name in `tools` is reprinted in
the agent roster in **every** session: the retired `mp-playwright-tester` once spent 794
characters there, seven of them naming Playwright tools that had since been renamed. Omit
`tools` and subtract instead — `disallowedTools: Write, Edit, NotebookEdit, Agent`. That
is what `Explore` does, it costs ~40 characters, and it cannot go stale when a server
renames a tool.

**Inline `mcpServers` in a sub-agent does not work on Claude Code 2.1.212 — do not design
around it.** The field is documented for sub-agents (sub-agents.md, "Supported frontmatter
fields") and promises that inline servers connect when the agent starts and disconnect when
it finishes. Measured here, it is inert: an agent declaring a server with `--headless
--isolated` got the session's headful, shared-profile browser instead, carrying page state
from the main conversation, with no error or warning anywhere. Retested after a restart with
a server name that collided with nothing — the declared tools never appeared under any
prefix. Other frontmatter in the same file (`model`, `disallowedTools`) applied normally, so
this is `mcpServers` specifically, not a parse failure.

The practical consequence: **a sub-agent gets the session's MCP servers, so an MCP server's
tool names are a whole-session cost.** Decide whether a server earns that on every session,
and register it at user scope (`claude mcp add`) or not at all. `ENABLE_TOOL_SEARCH` keeps
the bill to names only — measured at 1,041 characters (~260 tokens) for a 29-tool browser
server, rather than the ~15–25k that full schemas would cost.

Where the tools do come from still sets the prefix that `permissions.allow` must match: a
user- or project-scope server named `chrome-devtools` yields `mcp__chrome-devtools__*`,
while the same server reached through a *plugin* gets the longer
`mcp__plugin_<plugin>_<server>__*`. An allow rule written for one form does not match the
other, and under `defaultMode: "auto"` a dead rule goes unnoticed.

Re-test the inline field before relying on it in a future version; if it starts working, an
agent-scoped browser is worth revisiting.

`AskUserQuestion` is stripped from every sub-agent regardless of frontmatter, so granting
it to an agent is always dead.

## Versioning and docs

- Bump `metadata.version` in a skill's frontmatter on edit. Trivial changes — a
  one-line fix, wording tweaks across two or three lines — are exempt.
- Version format is **two-part** (`1.2`, `0.4`). A few skills carry three-part versions
  from earlier drift; leave them rather than renumbering.
- Update `README.md` in the same change as the edit that changes behaviour.
- Use conventional commits.
- **Deprecating means moving to `deprecated/`**, never deleting.
