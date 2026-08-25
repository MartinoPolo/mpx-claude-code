---
name: skill-audit
description: "Audits one skill or every active skill root for portable discovery, authoring conventions, hierarchy, workflow endpoints, tool integrity, and stale or ineffective instructions; safely fixes mechanical drift."
disable-model-invocation: true
allowed-tools: Read, Edit, Glob, Grep, Agent
metadata:
  author: MartinoPolo
  version: "1.0"
  category: utility
---

# Skill Audit

Read [`../shared/AUTHORING.md`](../shared/AUTHORING.md),
[`../shared/WRITING_FOR_AGENTS.md`](../shared/WRITING_FOR_AGENTS.md),
[`../shared/SUBAGENT_PROTOCOL.md`](../shared/SUBAGENT_PROTOCOL.md), and
[`../shared/EXPLORATION.md`](../shared/EXPLORATION.md) before auditing. With
`$ARGUMENTS`, audit only the named skill or path.

## Workflow

1. **Discover active roots.** Identify the repository root, then inspect repository
   manifests, plugin manifests, package configuration, and top-level layout for every
   configured skill root; include conventional nested `skills/**/SKILL.md` locations and
   exclude `deprecated`, fixtures, generated output, dependencies, and worktree metadata.
   Resolve `$ARGUMENTS` against an inventory that states each active root's discovery
   source and assigns every included `SKILL.md` to exactly one root.

2. **Read complete inputs.** Read every selected `SKILL.md`, its directly linked local
   references, and relevant manifests fully. Batch 3–5 skills per parallel
   `general-purpose` spawn with `model: "sonnet"`; keep repo-wide checks in the main
   session. Assign every selected file once and require each auditor to confirm full-file
   reads.

3. **Apply all checks.** For each skill evaluate every check below, cite file and evidence
   for each finding, record pass, finding, or not-applicable for every check, and run each
   repo-wide check once.

4. **Fix mechanical drift.** Auto-fix only deterministic changes: safe positive
   reframing, missing bookkeeping fields with known values, category casing, and verified
   legacy-link replacements. Preserve intent and bump `metadata.version` once per changed
   skill. Reread each applied edit; retain unsafe automation as a manual finding with its
   reason.

5. **Report.** Output a table of skill, issues, fixed, and remaining, then group remaining
   findings by skill and check number. Account for every selected skill and active root,
   include every finding and modified file exactly once, and report unresolved manual no-op
   tests as behavioral judgments.

## Checks

1. **Positive targets:** inspect negative phrasing; reframe when equivalent, retaining
   surprising or irreversible guardrails paired with the desired behavior.
2. **Size and split rationale:** flag `SKILL.md` over 200 lines, plus splits justified
   only by line count or unsplit material with distinct branch/sequence boundaries.
3. **Frontmatter:** require `name`, portable `description`, `allowed-tools`, and valid
   `metadata.author`, two-part `version`, and category; normalize category casing only.
4. **Portable context pointer:** description states purpose and every distinct trigger
   branch in at most two concise sentences. `when_to_use`, if present, adds no unique
   routing information. Flag combined Claude metadata over 1,536 characters and ask
   whether implicit invocation earns its context cost.
5. **Legacy docs:** find obsolete `REQUIREMENTS.md`, `VOCABULARY.md`, `ARCHITECTURE.md`,
   `legacy`, and fallback references; replace only when the current target is verified.
6. **Explicit tools:** exact spawned agent types, `gh` commands, scripts, and delegated
   search breadth are named wherever used.
7. **Vocabulary confirmation:** writers to `.mpx/CONTEXT.md` Domain Language show the
   complete proposed text and obtain user confirmation before writing.
8. **Description behavior:** every claimed capability exists and every delegation or
   invocation branch in the body is represented by the description.
9. **Agent types:** each spawn names an existing `agents/<type>.md` or documented built-in.
10. **Grant paths:** every path-like allowlist entry resolves after supported root
    expansion and wildcard handling.
11. **Dead grants:** every allowed tool has corresponding body behavior; flag grants with
    no use and uses with no grant.
12. **README sync (repo-wide):** compare all discovered active skill roots, agents, and
    hooks with their README tables; report drift for manual edits.
13. **Model mechanics:** flag prose-only model selection, redundant or missing real model
    parameters per SUBAGENT_PROTOCOL, unsupported models, and call-site `effort`.
14. **Shared integrity (repo-wide):** resolve shared links from every active root and flag
    copied shared rules that should be pointers.
15. **Exploration:** broad discovery uses `Explore` with quick, medium, or very thorough
    breadth; exempt deterministic inventories of fixed known patterns.
16. **Personal paths:** scan all skill files and assets for personal roots or usernames;
    require `MPX_*` resolution and loud failure, exempting supported Claude variables and
    genuine system paths.
17. **Semantic completion:** assess whether each procedural step has an unambiguous
    endpoint in its imperative wording and behavior. Flag plausible premature or false
    completion, no-op completion restatements, detached validation or stop conditions,
    and standalone gates outside the approved ambiguous or risky transitions. Do not
    search for or require literal completion phrases.
18. **Hierarchy and disclosure:** classify procedural, reference, or mixed structure;
    verify steps precede supporting detail, concepts are co-located, and branch-only
    material is disclosed through precise one-level pointers.
19. **Single source and caches:** flag duplicated meanings and environment facts cheaply
    discoverable from config, layout, scripts, or `--help`; retain reasons and hidden
    conventions.
20. **Relevance and no-ops:** flag stale or unrelated sentences. Treat suspected no-ops as
    manual behavioral comparisons against the target model's default; never auto-delete
    them solely from textual heuristics.
