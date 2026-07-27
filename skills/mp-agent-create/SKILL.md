---
name: mp-agent-create
description: "Creates a new Claude Code sub-agent following this repo's conventions, with a review checklist."
argument-hint: "[agent name or description]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls *), Agent
metadata:
  author: MartinoPolo
  version: "0.4"
  category: utility
---

Create a new Claude Code custom agent following project conventions.

Read [`../shared/SUBAGENT_PROTOCOL.md`](../shared/SUBAGENT_PROTOCOL.md) and
[`../shared/AUTHORING.md`](../shared/AUTHORING.md) now — they carry the verified rules
for model selection, tool grants, and naming that this skill applies.

## Process

1. **Fetch guidelines** — spawn `claude-code-guide` agent to get latest agent/sub-agent authoring docs
2. **Gather requirements** — ask user about purpose, tools, model, scope
3. **Draft the agent** — create `.md` file in `agents/` directory
4. **Validate against guidelines** — compare draft to fetched guidelines, fix mismatches
5. **Review with user** — present draft, report any guideline-driven changes, iterate

### Step 1: Fetch Guidelines

Spawn a `claude-code-guide` agent (subagent_type: `claude-code-guide`) with the prompt:
> "What are the latest Claude Code guidelines for authoring custom agents (sub-agents)? Include frontmatter fields, file structure, tool allowlists, model selection, description rules, and any best practices."

Store the returned guidelines for use in Step 4.

### Step 2: Gather Requirements

Ask all of the following in a single numbered list (one round-trip):

1. **Purpose**: What task does this agent handle? What problem does it solve?
2. **Tools needed**: Which tools should it access? (Read, Write, Edit, Bash, Grep, Glob, Agent, AskUserQuestion, WebFetch, WebSearch, MCP tools)
3. **Model**: haiku (fast mechanical work), sonnet (exploring, reviewing, moderate implementation), or opus (complex reasoning)? Every agent in this repo names one — see Model Selection below for why `inherit` is not offered.
4. **Read-only or read-write?**: Does it modify files or only analyze?
5. **Color**: Status line color (red, green, yellow, blue, magenta, cyan, white)

If $ARGUMENTS provided, use as initial agent name/description and ask only the unanswered questions.

### Step 3: Draft the Agent

Create `agents/<agent-name>.md` with this structure:

````markdown
---
name: <agent-name>
description: <one-line what it does and when to use it>
tools: <comma-separated tool list>
model: <haiku|sonnet|opus>
color: <color>
---

# <Agent Title>

<One-line role summary.>

## Workflow

1. Step one
2. Step two
3. Report results

## Output

\```markdown
<structured output template>
\```
````

#### Frontmatter Fields

**Required:**

| Field         | Rules                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| `name`        | Lowercase, hyphens only, max 64 chars. Must match filename. Overriding a built-in is the one exception — match its capitalisation exactly. |
| `description` | One line, max 250 chars. Front-load key use cases.                     |
| `tools`       | Comma-separated allowlist. Only include tools the agent actually uses. Write `Agent`, not the deprecated `Task`. |
| `model`       | Name one explicitly — see Model Selection below.                       |
| `color`       | Status line color for visual identification.                           |

**Optional:** `disallowedTools`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`,
`hooks`, `memory`, `background`, `effort`, `isolation`, `initialPrompt`. Semantics in
[`../shared/SUBAGENT_PROTOCOL.md`](../shared/SUBAGENT_PROTOCOL.md) § 6.

#### Body Conventions

- Start with `# Agent Title` and one-line role summary
- `## Workflow` — numbered steps, clear and sequential
- `## Output` — structured template so parent can parse results
- Keep body under **100 lines** — agents should be focused

Naming, descriptions, positive phrasing, explicit references, paths, and versioning are
covered once in [`../shared/AUTHORING.md`](../shared/AUTHORING.md). Follow it rather
than restating it here.

An agent that overrides a built-in keeps its body **deliberately thin** — the override
replaces the built-in's tuned system prompt, so a verbose body trades cost for worse
behaviour. See [`../shared/SUBAGENT_PROTOCOL.md`](../shared/SUBAGENT_PROTOCOL.md) § 7.

#### Tool Selection Guidelines

| Agent Role                       | Typical Tools                                                         |
| -------------------------------- | --------------------------------------------------------------------- |
| Read-only reviewer               | `Read, Grep, Glob, Bash`                                              |
| Code executor                    | `Read, Write, Edit, Bash, Grep, Glob`                                 |
| Research/exploration             | `Read, Grep, Glob, WebFetch, WebSearch`                               |
| Orchestrator (spawns sub-agents) | `Read, Grep, Glob, Bash, Agent`                                       |
| Browser tester                   | `Read, Glob, Grep, Bash, AskUserQuestion` + chrome-devtools MCP tools |

`tools` is a strict allowlist: an unlisted tool is absent from the agent's schema
entirely. `Agent` is **not** granted by default — an agent without it cannot delegate,
and its parent must spawn on its behalf and pass results back in. Full tool-grant
semantics, including `disallowedTools`, are in
[`../shared/SUBAGENT_PROTOCOL.md`](../shared/SUBAGENT_PROTOCOL.md) § 6.

**An agent that needs MCP tools enumerates none of them.** Every name in `tools` is
reprinted in the agent roster in every session, so a long MCP list is a standing context
charge that also rots when the server renames a tool. Omit `tools` and subtract instead:

```yaml
disallowedTools: Write, Edit, NotebookEdit, Agent
```

`AskUserQuestion` is stripped from every sub-agent whatever the frontmatter says, so
granting it is always dead.

#### Model Selection

| Model    | Best for                                                             |
| -------- | -------------------------------------------------------------------- |
| `haiku`  | Fast mechanical work: running checks, committing, simple lookups     |
| `sonnet` | Exploring, reviewing, docs, moderate-complexity implementation       |
| `opus`   | Complex reasoning: architecture, analysis, multi-step implementation |

**Name a model in every agent this repo owns.** `inherit` is valid, and omitting
`model:` means exactly the same thing — both resolve to the main conversation's model,
which on this machine is `claude-opus-5[1m]`, the most expensive option. An agent left
on `inherit` gets silently expensive the moment the session model changes.

#### Explicit Tool References (mandatory)

- GitHub CLI: specify exact `gh` command (e.g., `gh pr list`)
- Bash commands: name exact command/script
- Sub-agent spawns: name the exact agent type, and pass `model` only when that type
  declares none — [`../shared/SUBAGENT_PROTOCOL.md`](../shared/SUBAGENT_PROTOCOL.md) § 3.
  `effort` is not a spawn parameter; pin it in the agent's frontmatter instead (§ 10)
- Describe a model in prose nowhere: only a real `model` parameter selects one (§ 1)

### Step 4: Validate Against Guidelines

Compare the drafted agent against the guidelines fetched in Step 1:

1. Check frontmatter fields — are all required fields present? Any deprecated or missing fields?
2. Check tool allowlists — any tools the guidelines recommend or discourage?
3. Check model selection — does it follow current recommendations?
4. Check description format — matches guideline conventions?
5. Check body structure — does it follow the recommended layout?

For each mismatch found:
- Fix it in the draft
- Record what was changed and why (guideline reference)

If the guidelines suggest improvements beyond what this skill's conventions cover, note them as optional suggestions for the user.

### Step 5: Review with User

Present the drafted agent and verify:

- **Guideline changes**: list any modifications made during validation (what changed, why, guideline reference)
- **Optional improvements**: suggestions from guidelines that go beyond current conventions
- Does the description accurately trigger delegation?
- Are tools minimal and sufficient?
- Is the model appropriate for the task complexity?
- Is the output format parseable by the parent?

Ask the user for feedback. Iterate until approved.

### Review Checklist

Before finalizing, verify:

- [ ] Name is lowercase with hyphens, matches filename (or matches a built-in's capitalisation exactly, if overriding one)
- [ ] Description front-loads use cases, under 250 chars
- [ ] Tools list matches what the body actually uses, and uses `Agent` rather than the deprecated `Task`
- [ ] `Agent` is granted if — and only if — the agent spawns sub-agents
- [ ] `model` names a specific model rather than relying on `inherit`
- [ ] Color is set
- [ ] Body is under 100 lines
- [ ] Workflow is numbered and sequential
- [ ] Output template is structured and parseable
- [ ] All tool references are explicit (exact agent names, `gh` commands, script paths)
- [ ] No model named in prose — only in a real `model` field
- [ ] Instructions are positive (say what to do, not what to avoid)
- [ ] Agent is focused on one responsibility (single-purpose)

When overriding a built-in, additionally verify against
[`../shared/SUBAGENT_PROTOCOL.md`](../shared/SUBAGENT_PROTOCOL.md) § 7:

- [ ] `description` copied verbatim from the built-in (it drives auto-delegation)
- [ ] `disallowedTools` re-denies every tool the built-in denied
- [ ] Permissions verified by making the agent **attempt** each call, never by asking it (§ 8)
