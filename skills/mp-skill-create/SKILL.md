---
name: mp-skill-create
description: 'Create new Claude Code skills with structured conventions, progressive disclosure, and review checklist. Use when: "create skill", "new skill", "write a skill", "skill create"'
argument-hint: "[skill name or description]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls *), AskUserQuestion, Agent
metadata:
  author: MartinoPolo
  version: "0.1"
  category: utility
---

Create a new Claude Code skill following project conventions.

## Process

1. **Fetch guidelines** — spawn `claude-code-guide` agent to get latest skill authoring docs
2. **Gather requirements** — ask user about purpose, use cases, scripts, references
3. **Draft the skill** — create SKILL.md and supporting files
4. **Validate against guidelines** — compare draft to fetched guidelines, fix mismatches
5. **Review with user** — present draft, report any guideline-driven changes, iterate

### Step 1: Fetch Guidelines

Spawn a `claude-code-guide` agent (subagent_type: `claude-code-guide`) with the prompt:

> "What are the latest Claude Code guidelines for authoring custom skills (slash commands)? Include frontmatter fields, file structure, description rules, tool allowlists, size limits, and any best practices."

Store the returned guidelines for use in Step 4.

### Step 2: Gather Requirements

Ask the user about:

- **Task/domain**: What does this skill do? What problem does it solve?
- **Use cases**: When would someone invoke this? What are the trigger phrases?
- **Scripts needed**: Are there deterministic operations that should be shell scripts?
- **Reference materials**: Are there large docs, API specs, or examples to bundle?

If $ARGUMENTS provided, use as initial skill name/description and ask remaining questions.

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
description: '<What it does in third person>. Use when: "<trigger phrases>"'
argument-hint: "[argument description]"
allowed-tools: <comma-separated tool list>
metadata:
  author: MartinoPolo
  version: "0.1"
  category: <planning|execution|git-workflow|utility|setup>
---
```

**Description rules:**

- Max 1024 characters
- Write in third person
- First sentence (optional): what it does
- Second sentence: `Use when: "trigger1", "trigger2", "trigger3"`

**Body structure:**

- Start with process overview (numbered steps)
- Each step is a ### heading with clear instructions
- Include code blocks for commands that should be run
- End with output/report section

**Instruction style — prefer positive:**

- Tell the agent what TO do, not what NOT to do
- If a positive instruction is clear, the negative counterpart is noise
- Only use negatives for genuinely surprising constraints (e.g., "Do NOT ask user to review before creating")

**Explicit tool references (mandatory):**

- `allowed-tools` must include `Agent` if the skill spawns sub-agents
- Agent spawning: name the exact type (e.g., "Spawn `mp-issue-analyzer` sub-agent")
- GitHub CLI: specify exact `gh` command (e.g., `gh issue create`, `gh pr create --draft`)
- Bash commands: name the exact command/script
- Omit `model` when spawning agents that define their own model in frontmatter
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

### Step 5: Review with User

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
- [ ] Instructions are positive (say what to do, not what to avoid)
