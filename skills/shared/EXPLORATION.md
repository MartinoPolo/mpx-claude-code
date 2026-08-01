# Exploration

Canonical policy for finding things. Skills reference this file instead of restating it.

## Delegate — never sweep in the main thread

Searching from the main thread pulls every hit into the conversation and burns the
context the orchestration itself needs. Spawn `Explore` and keep only its conclusion.

Applies to: locating files, tracing a symbol, discovering naming conventions,
mapping a subsystem. Reading two or three already-known files is not exploration —
just read them.

## Never pass `model` when spawning `Explore`

`agents/Explore.md` pins `model: sonnet` and overrides the built-in, so every
exploration — including the ones Claude delegates automatically, without anyone
asking — already runs on sonnet. Verified: bare `Explore` spawns resolve to
`claude-sonnet-5` while the main thread runs `claude-opus-5[1m]`.

Passing `model` at the call site re-states what the agent already declares and
drifts the moment the agent changes. Omit it — see
[SUBAGENT_PROTOCOL.md](SUBAGENT_PROTOCOL.md) § 1.

## `Explore` does not see CLAUDE.md — restate what matters in the prompt

`Explore` and `Plan` skip CLAUDE.md files and the parent session's git status entirely,
to keep research fast and cheap. Every other agent loads both. There is no setting to
change this, and it is tied to the **name** `Explore`, so the local override inherits
the behaviour.

Consequence: repo rules, naming conventions, and the `MPX_*` table in this file do not
reach an `Explore` sub-agent on their own. Any rule the search depends on goes into the
delegation prompt itself. The main thread — not the sub-agent — reconciles findings
against repo conventions.

`Explore` is also one-shot: it returns no agent ID and cannot be resumed with
`SendMessage`. Ask for everything you need in the first prompt.

## State the breadth

`Explore`'s body maps these words to concrete stopping criteria, so say which you want:

| Breadth         | Use for                                                        |
| --------------- | -------------------------------------------------------------- |
| `quick`         | One known concept, obvious location                            |
| `medium`        | Obvious locations plus one alternative naming convention       |
| `very thorough` | Exhaust conventions, sibling dirs, config, tests               |

Breadth is a search-scope instruction, not a reasoning-effort setting. It reaches the
agent as prompt text and the agent body acts on it. The `effort:` reasoning knob is
frontmatter only — see [SUBAGENT_PROTOCOL.md](SUBAGENT_PROTOCOL.md) § 7.

## Explore instead of asking

When a question about the codebase can be answered by looking, look. Reserve
questions for decisions only the user can make — product intent, priorities,
trade-offs, anything requiring taste or outside knowledge.

Used by `mp-grill`, `mp-hitl`, and any skill that interviews the user.

## Library documentation is not in this repo

For third-party library or framework behaviour, spawn `mp-context7-docs-fetcher`
(Context7 MCP: `resolve-library-id`, then `query-docs`). Do not infer an API from
local `node_modules` or from memory.

## Paths outside the working directory

Machine roots come from `MPX_*` environment variables, surfaced into every session
by the `machine-paths.js` SessionStart hook. Inside a sub-agent, resolve them at
runtime — `env | grep '^MPX_'` — rather than guessing.

| Variable             | Root                     |
| -------------------- | ------------------------ |
| `MPX_PROJECTS`       | Personal projects        |
| `MPX_WORK`           | Work repositories        |
| `MPX_CLONED`         | Cloned OSS repositories  |
| `MPX_APPS`           | Local apps               |
| `MPX_ONEDRIVE`       | OneDrive root            |
| `MPX_AI_GENERATED`   | AI-generated assets      |
| `MPX_OBSIDIAN_VAULT` | Obsidian vault           |

Every skill deliverable meant for the user — podcasts, tutorials, video sheets —
lands under `MPX_AI_GENERATED` in an all-caps, underscore-prefixed folder
(`_PODCASTS`, `_TUTORIALS`, `_VIDEO_SHEETS`), one sub-folder per run holding the
inputs, the prompt, and the finished asset together.

Values are per-machine and never committed — this repo is public. Treat an unset
variable as unavailable and say so; do not substitute a guessed path.

Markdown does not interpolate environment variables, so `$MPX_WORK` written in a
skill body is literal text. There are exactly three working channels for a machine
root to reach an agent: the `machine-paths.js` SessionStart hook (main thread only —
it does **not** propagate into sub-agent contexts), a runtime lookup inside the agent
(`env | grep '^MPX_'`), and `` !`command` `` preprocessing in a skill body.

## Related

- [SUBAGENT_PROTOCOL.md](SUBAGENT_PROTOCOL.md) — model selection and tool grants
- [AUTHORING.md](AUTHORING.md) — conventions shared by skills and agents
