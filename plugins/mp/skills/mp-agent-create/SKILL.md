---
name: agent-create
description: "Creates or restructures a custom agent when a user needs a delegated role, distinct delegation branches, tools, workflow, or structured output."
argument-hint: "[agent name or description]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Agent
metadata:
  author: MartinoPolo
  version: "0.7"
  category: utility
---

# Agent Create

Create a focused custom agent following repository conventions.

Read [`../shared/AUTHORING.md`](../shared/AUTHORING.md),
[`../shared/WRITING_FOR_AGENTS.md`](../shared/WRITING_FOR_AGENTS.md), and
[`../shared/SUBAGENT_PROTOCOL.md`](../shared/SUBAGENT_PROTOCOL.md). They are the single
sources for writing, identity, tools, models, lifecycle, and permission mechanics.

## Workflow

1. **Fetch current mechanics.** Spawn `claude-code-guide` with the prompt: “Return the
   current Claude Code custom-agent frontmatter, packaging, delegation, tool, model, and
   permission mechanics; separate requirements from general writing advice.” Classify
   fetched claims as platform mechanics and exclude general writing advice.

2. **Gather requirements.** In one numbered request ask for purpose; distinct delegation
   branches and phrases; inputs and outputs; ordered actions; points where premature or
   false completion is plausible; reference needs; read-only or read-write scope; required
   tools; mechanical, standard, or advanced model class; color; and parent-facing output
   shape. Use `$ARGUMENTS` for known answers, have every remaining field answered or
   marked not applicable, and define each branch's expected result.

3. **Design the hierarchy.** Give every requirement one source. Keep universal ordered
   actions in the workflow, co-locate branch rules, and disclose branch-only reference
   through precise pointers so each run can identify what it needs. Keep one responsibility
   and a body under 100 lines; split only when a real branch or sequence boundary earns the
   extra context hop.

4. **Draft `agents/<agent-name>.md`.** Use lowercase hyphenated identity (except an exact
   built-in override), a one-line description under 250 characters that front-loads all
   distinct delegation branches, minimal tools, a concrete `haiku`, `sonnet`, or `opus`
   model, and a color. Include a focused role, numbered workflow, and parseable output
   contract. Follow SUBAGENT_PROTOCOL for MCP, overrides, model parameters, and grants
   rather than restating that lifecycle here. Align filename and identity, grant every
   used capability and no unused capability, account for all requested branches in the
   output, and write concise imperative steps with semantic endpoints. Integrate needed
   validation or stop conditions into their actions; add a standalone gate only under the
   shared policy.

5. **Validate and prune.** Compare the draft against fetched mechanics and all three
   shared references. Apply the single-source, environment-cache, relevance, positive-
   target, no-op, and semantic-completion tests. Leave uncertain no-ops as manual
   behavioral findings and record unmet applicable rules with exact reasons.

6. **Review with the user.** Present the file, delegation branches, hierarchy, model and
   tool rationale, guideline-driven edits, and unresolved findings. Apply requested
   revisions, revalidate, and iterate until the user approves and all findings are resolved
   or explicitly accepted.

## Final report

Report the created file, branch coverage, model and grants, validation results, manual
no-op tests, and an accounting of every gathered requirement and changed artifact.
