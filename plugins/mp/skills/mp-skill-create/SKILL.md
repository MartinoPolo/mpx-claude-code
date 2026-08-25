---
name: skill-create
description: "Creates or restructures a skill for Claude, Pi, and Codex when a user asks to add skill behavior, invocation branches, procedures, or reference material, then audits the result."
argument-hint: "[skill name or description]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Agent
metadata:
  author: MartinoPolo
  version: "0.8"
  category: utility
---

# Skill Create

Create a portable skill that follows this repository's conventions.

Read [`../shared/AUTHORING.md`](../shared/AUTHORING.md) and
[`../shared/WRITING_FOR_AGENTS.md`](../shared/WRITING_FOR_AGENTS.md). If the skill
spawns agents, also read
[`../shared/SUBAGENT_PROTOCOL.md`](../shared/SUBAGENT_PROTOCOL.md). These are the
single sources for writing, invocation, naming, paths, grants, and versioning.

## Workflow

1. **Fetch current platform mechanics.** Spawn `claude-code-guide` with the prompt:
   “Return current Claude Code skill frontmatter, packaging, invocation, and tool-grant
   mechanics; separate platform requirements from writing advice.” Classify fetched
   claims as platform mechanics and omit writing advice from the draft.

2. **Gather requirements.** In one numbered request, ask for purpose; explicit and
   implicit invocation policy per target harness; distinct trigger branches; inputs and
   outputs; ordered actions; points where premature or false completion is plausible;
   procedural, reference, or mixed structure; branch-specific references and examples;
   deterministic script candidates; and target packaging, including Codex
   `agents/openai.yaml` policy when applicable. Use `$ARGUMENTS` to fill known items and
   have every remaining item answered or marked not applicable.

3. **Design the hierarchy.** Map every requirement to exactly one authoritative location:
   shared actions in `SKILL.md`, branch-only facts in linked references, and deterministic
   repeated operations in scripts. Reach each reference through a precise pointer no more
   than one level deep. Split by branch or sequence when that changes what a run must load;
   use 200 lines as a guardrail, not the sole split reason.

4. **Draft the files.** Create `skills/<skill-name>/SKILL.md` plus only needed
   `REFERENCE.md`, `EXAMPLES.md`, `scripts/`, and packaging files. Use this minimal
   frontmatter shape and add optional fields only when behavior requires them:

   ```yaml
   ---
   name: <skill-name>
   description: "<portable purpose plus every distinct trigger branch>"
   argument-hint: "[arguments]"
   disable-model-invocation: true # omit for autonomous Claude/Pi discovery
   allowed-tools: <tools actually used>
   metadata:
     author: MartinoPolo
     version: "0.1"
     category: <valid AUTHORING.md category>
   ---
   ```

   Prefer no `when_to_use`; if retained for Claude enrichment, ensure it contains no
   unique trigger. For Codex explicit-only packaging set
   `policy.allow_implicit_invocation: false` in `agents/openai.yaml`. Implement every
   requested branch, use concise imperatives with semantic endpoints, integrate needed
   validation or stop conditions into their actions, and ensure grants and referenced
   paths correspond to body behavior. Add a standalone gate only under the shared policy.

5. **Validate and prune.** Compare the draft with the fetched mechanics and both shared
   references. Run the single-source, environment-cache, relevance, no-op, and semantic-
   completion pass. Treat uncertain no-ops as manual behavioral findings; record any
   unmet canonical rule with a concrete reason.

6. **Audit.** Spawn `general-purpose` with `model: "sonnet"` and prompt it to run
   `/mp:skill-audit skills/<skill-name>/SKILL.md`; apply safe mechanical fixes and list
   remaining behavioral findings with their owning file and required decision.

7. **Review with the user.** Present created files, invocation behavior by harness,
   branch hierarchy, guideline-driven changes, unresolved findings, and optional
   improvements. Apply requested changes, revalidate them, and iterate until the user
   approves.

## Final report

Report files created, explicit invocation syntax, autonomous-discovery policy, validation
results, audit results, unresolved manual no-op tests, and an accounting of every gathered
requirement and changed artifact.
