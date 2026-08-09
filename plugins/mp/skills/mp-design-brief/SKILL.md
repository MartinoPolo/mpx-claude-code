---
name: design-brief
description: "Writes a standalone design brief for a UI component — surrounding context, exhaustive requirements and states, and a component reuse map — then gates dependent GitHub issues with a Design needed label."
when_to_use: "User asks for a design brief, design spec, component spec, or UI spec."
argument-hint: "[component-name]"
allowed-tools: Read, Write, Glob, Grep, Agent, Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.2"
  category: design
---

# Design Brief Creation

Produce a design brief complete enough that a designer — human or AI — can build a pixel-accurate
mockup without asking a single question.

Shared conventions: [DESIGN_PIPELINE.md](../shared/DESIGN_PIPELINE.md).
Brief structure and writing rules: [BRIEF_TEMPLATE.md](BRIEF_TEMPLATE.md).

## Philosophy

1. **Context is king.** Every component lives somewhere. Say WHERE, WHAT surrounds it, and HOW
   MUCH SPACE it gets. The mockup reflects real proportions.
2. **Reuse over invention.** Name the existing components to build from. Design a new primitive
   only when nothing fits.
3. **Requirements-driven.** Scrape every source. Human decisions outrank code.
4. **Standalone.** A reader understands the whole picture without opening another file.

## Step 1: Gather every requirement

Before writing anything:

1. **GitHub** — `gh issue list --search "<keywords>" --state all`, then `gh issue view <n>
   --json title,body,comments` on the hits. Issue comments carrying human decisions rank highest.
2. **Project docs** — context, decisions, and epic specs, wherever the project keeps them.
3. **Existing implementation** — read any code for this feature. Current state vs. desired state.
4. **Related briefs** — other folders under `designs/`.
5. **Design language** — `designs/DESIGN_SYSTEM.md`, else infer per DESIGN_PIPELINE.md
   § Project discovery.

For broad searches, spawn `Explore` with breadth stated (`quick`, `medium`, `very thorough`).
It skips CLAUDE.md — restate what the search depends on inside the prompt.

## Step 2: Determine surrounding context

The most important step. Establish:

**Where it lives** — page content, sidebar panel, split-pane region, tab content, modal/dialog,
inline card, or layout chrome. Read the actual layout components to get real dimensions and real
nav items rather than inventing them.

**How much space it gets** — measure from the layout source: sidebar width, panel split ratios,
header heights. Record them as concrete percentages or pixels.

**What is settled** — which surrounding elements are implemented or designed to final state (the
mockup reproduces those faithfully) and which are still open.

Write the findings into the brief's *Surrounding Context* section.

## Step 3: Inventory components to reuse

Discover the project's component directories (DESIGN_PIPELINE.md § Project discovery), then for
every component relevant to the feature record its name, import path, real variants and props
(read from the source, variants file, or story), and where it is used in this design.

Be specific: "use `Button variant='ghost'` size='icon'", not "add a button".

## Step 4: Research missing primitives

For a needed pattern the inventory lacks, spawn `mp-context7-docs-fetcher` against the project's
component library. List the result under *Components to Adopt* with the reason nothing existing
suffices. Installation is deferred to `/mp:design-refine`.

## Step 5: Draft the brief

Write `designs/<component-name>/DESIGN_BRIEF_<COMPONENT_NAME>.md` — kebab-case folder, screaming
snake-case filename — following [BRIEF_TEMPLATE.md](BRIEF_TEMPLATE.md).

## Step 6: Gate dependent issues

Implementation issues that cannot proceed without this design get labelled.

1. Ensure the label exists:

    ```bash
    gh label list --search "Design needed" --json name -q '.[].name'
    gh label create "Design needed" --color "FBCA04" --description "Design must be completed before implementation"
    ```

2. Find dependents:

    ```bash
    gh issue list --search "<component-name>" --state open --json number,title,labels
    gh issue view <epic-number> --json subIssues -q '.subIssues[].number'
    ```

3. Label each confirmed dependent — skim the body when uncertain, so unrelated issues stay clean:

    ```bash
    gh issue edit <number> --add-label "Design needed"
    ```

4. Report which issues were labelled and why.

With no GitHub remote or no `gh`, skip this step and note it in the report.

## Step 7: Hand off

Save the brief, then invoke `/mp:mockup` to generate variants.
