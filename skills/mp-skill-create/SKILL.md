---
name: mp-skill-create
description: "Creates a new Claude Code skill following this repo's conventions, then audits it."
when_to_use: "User asks to create, write, or add a new skill."
argument-hint: "[skill name or description]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls *), Agent
metadata:
  author: MartinoPolo
  version: "0.5"
  category: utility
---

Create a new Claude Code skill following project conventions.

Read [`../shared/AUTHORING.md`](../shared/AUTHORING.md) now — naming, descriptions,
positive phrasing, explicit references, paths, size limits, and versioning live there.
If the skill will spawn sub-agents, read
[`../shared/SUBAGENT_PROTOCOL.md`](../shared/SUBAGENT_PROTOCOL.md) too.

## Process

1. **Fetch guidelines** — spawn `claude-code-guide` agent to get latest skill authoring docs
2. **Gather requirements** — ask user about purpose, use cases, scripts, references
3. **Draft the skill** — create SKILL.md and supporting files
4. **Validate against guidelines** — compare draft to fetched guidelines, fix mismatches
5. **Audit** — run `/mp-skill-audit` on the new skill to catch convention drift
6. **Review with user** — present draft, report any guideline-driven changes, iterate

### Step 1: Fetch Guidelines

Spawn a `claude-code-guide` agent (subagent_type: `claude-code-guide`) with the prompt:

> "What are the latest Claude Code guidelines for authoring custom skills (slash commands)? Include frontmatter fields, file structure, description rules, tool allowlists, size limits, and any best practices."

Store the returned guidelines for use in Step 4.

### Step 2: Gather Requirements

Ask all of the following in a single numbered list (one round-trip):

1. **Task/domain**: What does this skill do? What problem does it solve?
2. **Use cases**: When would someone invoke this? What are the trigger phrases?
3. **Scripts needed**: Are there deterministic operations that should be shell scripts?
4. **Reference materials**: Are there large docs, API specs, or examples to bundle?

If $ARGUMENTS provided, use as initial skill name/description and ask only the unanswered questions.

### Step 3: Draft the Skill

Create the skill directory and files:

```
skills/<skill-name>/
├── SKILL.md           # Main instructions (required)
├── REFERENCE.md       # Detailed docs (if >200 lines or distinct domain)
├── EXAMPLES.md        # Usage examples (if needed)
└── scripts/           # Utility scripts (if needed)
    └── helper.js
```

#### SKILL.md Conventions

**Frontmatter:**

```yaml
---
name: <skill-name>
description: "<What it does, 1-2 sentences, third person>"
when_to_use: "<1-3 short trigger sentences>" # omit when not model-invocable
argument-hint: "[argument description]"
disable-model-invocation: true # omit only if Claude must reach for this unprompted
allowed-tools: <comma-separated tool list>
metadata:
  author: MartinoPolo
  version: "0.1"
  category: <planning|execution|project-management|issue-management|git-workflow|code-quality|code-review|refactor|testing|design|setup|utility|obsidian>
---
```

Other valid frontmatter fields, used only when needed: `arguments`, `user-invocable`,
`disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`, `hooks`,
`paths`, `shell`. `metadata` is this repo's own bookkeeping — the platform ignores it.

**Description rules** — full rationale in
[`../shared/AUTHORING.md`](../shared/AUTHORING.md) § Descriptions and discoverability:

- `description` is 1–2 sentences, third person, on what the skill does
- `when_to_use` carries the triggers, in 1–3 short sentences
- The two are concatenated and truncated together at 1,536 chars, so use case first
- Both sit in **every session's context**. A skill you always invoke by name sets
  `disable-model-invocation: true` and costs nothing.

**Body structure:**

- Start with process overview (numbered steps)
- Each step is a ### heading with clear instructions
- Include code blocks for commands that should be run
- End with output/report section

**Spawning sub-agents** — rules and evidence in
[`../shared/SUBAGENT_PROTOCOL.md`](../shared/SUBAGENT_PROTOCOL.md):

- `allowed-tools` includes `Agent` if the skill spawns anything
- Name the exact agent type: "Spawn `mp-issue-analyzer` sub-agent". A spawn instruction
  that names no type leaves tools and model to chance
- Pass `model` **only** for types that declare none — `general-purpose`, `claude`,
  `Plan`, `fork`. Omit it for every `mp-*` agent and for `Explore`
- `effort` is not an `Agent` tool parameter, so a call site cannot set it. A spawn that
  needs a specific effort must be a real `mp-*` agent with `effort:` in its frontmatter;
  otherwise nudge depth through the prompt text
- Never name a model in prose. "Spawn a Sonnet sub-agent" is measured at 0% obeyed —
  it reads like an instruction and does nothing
- Delegate codebase searches to `Explore` with the breadth stated
  ([`../shared/EXPLORATION.md`](../shared/EXPLORATION.md))

**Explicit tool references (mandatory):**

- GitHub CLI: specify exact `gh` command (e.g., `gh issue create`, `gh pr create`)
- Bash commands: name the exact command/script
- Use `gh` CLI for all GitHub operations

**Size rules:**

- SKILL.md must stay under **200 lines**
- If exceeding 200 lines, split into reference files
- Reference files are loaded on demand via markdown links: `[details](REFERENCE.md)`

#### When to Split Files

- SKILL.md exceeds 200 lines
- Content has distinct domains (e.g., main workflow vs API reference)
- Advanced features are rarely needed by most invocations

#### When to Add Scripts

- Operation is deterministic and repeatable
- Same code would be generated every time
- Error handling needs to be explicit
- Script saves >10 lines of inline bash in SKILL.md

### Step 4: Validate Against Guidelines

Compare the drafted skill against the guidelines fetched in Step 1:

1. Check frontmatter fields — are all required fields present? Any deprecated or missing fields?
2. Check file structure — does it follow the recommended layout?
3. Check description format — matches guideline conventions?
4. Check tool allowlists — any tools the guidelines recommend or discourage?
5. Check size limits — does the draft respect current limits?

For each mismatch found:

- Fix it in the draft
- Record what was changed and why (guideline reference)

If the guidelines suggest improvements beyond what this skill's conventions cover, note them as optional suggestions for the user.

### Step 5: Audit

Run `mp-skill-audit` against the newly created skill to catch convention drift:

> Spawn a `general-purpose` sub-agent with `model: "sonnet"` and the prompt:
> "Run `/mp-skill-audit skills/<skill-name>/SKILL.md`"

Apply any auto-fixes. Note remaining issues for user review in Step 6.

### Step 6: Review with User

Present the drafted skill and walk through:

- **Guideline changes**: list any modifications made during validation (what changed, why, guideline reference)
- **Optional improvements**: suggestions from guidelines that go beyond current conventions
- Does it cover the main use cases?
- Any missing edge cases or workflows?
- Is the detail level right (not too sparse, not bloated)?

Ask the user for feedback. Iterate until approved.

### Review Checklist

Before finalizing, verify:

- [ ] Description includes trigger phrases
- [ ] SKILL.md is under 200 lines
- [ ] Information is time-independent (use relative terms, not dates/versions)
- [ ] Consistent terminology throughout
- [ ] Concrete examples included
- [ ] References are one level deep (SKILL.md -> REFERENCE.md)
- [ ] allowed-tools list matches what the skill actually uses
- [ ] Category is set correctly in metadata
- [ ] All tool references are explicit (exact agent names, `gh` commands, script paths)
- [ ] Every spawn instruction names an agent type
- [ ] `model` passed to `general-purpose`, `claude`, `Plan`, `fork` — omitted elsewhere
- [ ] No `effort` parameter on any spawn — it is frontmatter-only
- [ ] No model named in prose anywhere in the body
- [ ] Codebase searches delegated to `Explore` rather than run in the main thread
- [ ] Shared rules linked, not restated
- [ ] Instructions are positive (say what to do, not what to avoid)
