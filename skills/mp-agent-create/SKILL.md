---
name: mp-agent-create
description: 'Create new Claude Code custom agents with structured conventions and review checklist. Use when: "create agent", "new agent", "write an agent", "agent create"'
argument-hint: "[agent name or description]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls *), AskUserQuestion, Agent
metadata:
  author: MartinoPolo
  version: "0.1"
  category: utility
---

Create a new Claude Code custom agent following project conventions.

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

Ask the user about:

- **Purpose**: What task does this agent handle? What problem does it solve?
- **Tools needed**: Which tools should it access? (Read, Write, Edit, Bash, Grep, Glob, Agent, AskUserQuestion, WebFetch, WebSearch, MCP tools)
- **Model**: haiku (fast/cheap), sonnet (balanced), opus (complex reasoning), or inherit (parent's model)?
- **Read-only or read-write?**: Does it modify files or only analyze?
- **Color**: Status line color (red, green, yellow, blue, magenta, cyan, white)

If $ARGUMENTS provided, use as initial agent name/description and ask remaining questions.

### Step 3: Draft the Agent

Create `agents/<agent-name>.md` with this structure:

````markdown
---
name: <agent-name>
description: <one-line what it does and when to use it>
tools: <comma-separated tool list>
model: <haiku|sonnet|opus|inherit>
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
| `name`        | Lowercase, hyphens only, max 64 chars. Must match filename.            |
| `description` | One line, max 250 chars. Front-load key use cases.                     |
| `tools`       | Comma-separated allowlist. Only include tools the agent actually uses. |
| `model`       | Pick based on task complexity. Default `inherit` unless specific need. |
| `color`       | Status line color for visual identification.                           |

**Optional (use only when needed):**

| Field            | Purpose                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `maxTurns`       | Cap agentic turns before stopping                                |
| `skills`         | Skill names to preload into agent context                        |
| `mcpServers`     | MCP servers scoped to this agent                                 |
| `memory`         | Persistent memory scope: `user`, `project`, or `local`           |
| `background`     | `true` to always run as background task                          |
| `isolation`      | `worktree` to run in isolated git worktree                       |
| `permissionMode` | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan` |

#### Body Conventions

- Start with `# Agent Title` and one-line role summary
- `## Workflow` — numbered steps, clear and sequential
- `## Output` — structured template so parent can parse results
- Keep body under **100 lines** — agents should be focused
- Use positive instructions (say what to do, not what to avoid)

#### Tool Selection Guidelines

| Agent Role                       | Typical Tools                                                         |
| -------------------------------- | --------------------------------------------------------------------- |
| Read-only reviewer               | `Read, Grep, Glob, Bash`                                              |
| Code executor                    | `Read, Write, Edit, Bash, Grep, Glob`                                 |
| Research/exploration             | `Read, Grep, Glob, WebFetch, WebSearch`                               |
| Orchestrator (spawns sub-agents) | `Read, Grep, Glob, Bash, Agent`                                       |
| Browser tester                   | `Read, Glob, Grep, Bash, AskUserQuestion` + chrome-devtools MCP tools |

#### Model Selection Guidelines

| Model     | Best For                                                    |
| --------- | ----------------------------------------------------------- |
| `haiku`   | Fast read-only tasks: checking, exploring, simple analysis  |
| `sonnet`  | Balanced: reviewing, docs updates, moderate complexity      |
| `opus`    | Complex reasoning: implementation, architecture, multi-step |
| `inherit` | When parent should control model choice                     |

#### Explicit Tool References (mandatory)

- GitHub CLI: specify exact `gh` command (e.g., `gh pr list`)
- Bash commands: name exact command/script
- Omit `model` in spawning instructions when sub-agent defines its own
- Prefer `gh` CLI over GitHub MCP tools — MCP is backup only

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

- [ ] Name is lowercase with hyphens, matches filename
- [ ] Description front-loads use cases, under 250 chars
- [ ] Tools list matches what the body actually uses
- [ ] Model matches task complexity
- [ ] Color is set
- [ ] Body is under 100 lines
- [ ] Workflow is numbered and sequential
- [ ] Output template is structured and parseable
- [ ] All tool references are explicit (exact agent names, `gh` commands, script paths)
- [ ] Instructions are positive (say what to do, not what to avoid)
- [ ] Agent is focused on one responsibility (single-purpose)
