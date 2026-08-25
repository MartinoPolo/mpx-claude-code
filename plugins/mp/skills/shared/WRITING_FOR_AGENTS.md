# Writing for Agents

Canonical guidance for skills, agents, project instructions, and references consumed by
agents. Adapted from Matt Pocock's *writing-for-agents* skill and skill mechanics.
Local platform and repository constraints remain in [AUTHORING.md](AUTHORING.md).

## Context pointers and invocation

A **context pointer** names material outside the current context and states the distinct
**branches** that should load it. Its wording controls discovery: say what the material
does, then give one concise trigger per genuinely different branch. Collapse synonyms,
front-load recognizable leading words, and remove identity repeated by the target.

| Harness | Discovery metadata | Explicit syntax | Explicit-only control |
| --- | --- | --- | --- |
| Claude Code | `description` plus optional appended `when_to_use` | `/plugin:skill` (or `/skill`) | `disable-model-invocation: true` |
| Pi | `description` only | `/skill:name` | `disable-model-invocation: true` |
| Codex | `description` only | `$name` | packaged `agents/openai.yaml`: `policy.allow_implicit_invocation: false` |

Make `description` the portable, always-visible pointer and include every unique trigger
branch there. `when_to_use` is optional Claude-only enrichment; it must add no unique
routing fact. Prefer omitting it when the description is sufficient. Invocation syntax
is harness identity, not the skill frontmatter `name` rule.

Always-loaded pointers spend **context load** on every turn. Documents remembered and
selected by a human spend **cognitive load** instead. Pay context load only for useful
autonomous discovery; use explicit-only policy when the human should remain the index.

## Information hierarchy

Build documents from ordered **steps** and on-demand **reference**; procedural,
reference-only, and mixed documents are all valid. Rank information by immediacy:

1. In-file steps needed for this run.
2. In-file reference needed across its branches.
3. Disclosed reference reached through a precise pointer.

Use progressive disclosure by branch: inline what every branch needs and disclose what
only one branch needs. Keep references one link deep where local conventions require it.
Co-locate each concept's definition, rules, and caveats under one heading rather than
scattering fragments.

Split by **branch** when paths need different material, or by **sequence** when visible
later steps cause premature completion. Line count is a guardrail, not the rationale.
Splitting a sequence only hides later work across a real context boundary; another
heading in the same prompt does not. Keep a long document intact when every path needs it
and the hierarchy remains clear.

## Semantic completion

Every procedural step needs an unambiguous endpoint. Normally that endpoint is inherent
in a concise imperative: name the action, its scope, and any validation or stop condition
that governs it. Delete a completion clause that merely restates the action, and never add
a standalone completion sentence mechanically after every step.

Ask where an agent could plausibly stop early or claim success incorrectly. Integrate the
needed bound into the action when possible. Retain a standalone gate only for a genuinely
ambiguous or risky transition involving:

- measurable verification not already required by the action;
- a destructive or irreversible action;
- explicit approval;
- allowed failure, fallback, or partial success;
- exhaustive reconciliation; or
- consequential false-success prevention.

Use one standalone form, at the end of the relevant step:

`**Gate:** Continue only when <observable condition>.`

The condition must be observable and cover the relevant scope, branches, or artifacts.
Sharpen a vague bound before splitting a sequence. Reference-only documents need a clear
application bound, but not a procedural completion sentence.

## Language

Use a pretrained **leading word** (for example, “cache,” “branch,” or “red”) as a compact
anchor when it accurately names a behavior. Repeat the token, not its full definition.
State the positive target so the intended behavior is most available. Keep a negative
only for a surprising or irreversible guardrail, paired with what to do instead.

## Disclosure and pruning pass

Before publishing or updating agent-facing writing:

1. **Single source** — keep each rule authoritative in one place and point to it elsewhere.
2. **Environment cache** — remove inventories and commands cheaply discoverable from
   files, layout, configuration, or `--help`; retain conventions, reasons, and hidden gotchas.
3. **Relevance** — remove stale exposition and disclose branch-specific material.
4. **No-op test** — ask whether each sentence changes behavior versus the target model's
   default. Delete behavioral no-ops rather than polishing them. This is an empirical,
   model-relative judgment; uncertain findings require a manual comparison, not an
   automatic rewrite.
5. **Semantic completion** — remove no-op completion restatements, integrate validation
   and stop conditions into actions, and retain standalone gates only for the listed
   ambiguous or risky transitions.
