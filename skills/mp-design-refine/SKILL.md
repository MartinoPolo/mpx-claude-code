---
name: mp-design-refine
description: "Applies refinement requirements to a chosen mockup variant, producing refined.html and SUMMARY.md, updating the brief, and unblocking the GitHub issues that were gated on the design."
when_to_use: "User asks to refine a design, accept or select a variant, polish a mockup, or refine all pending designs."
argument-hint: "all | <variant-letter> [refinement requirements...]"
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Bash(gh *), Bash(npx *), Bash(pnpm *), Bash(yarn *), Bash(bunx *), mcp__chrome-devtools__new_page
metadata:
  author: MartinoPolo
  version: "0.2"
  category: design
---

# Design Refinement

Apply refinement requirements to a chosen variant. Produces `refined.html` and `SUMMARY.md`,
updates the design brief, and clears the design gate on dependent issues.

Shared conventions — folder layout, project discovery, mockup HTML rules, container context, the
`Design needed` label: [DESIGN_PIPELINE.md](../shared/DESIGN_PIPELINE.md).

## Step 1: Parse arguments

Argument `all` → [Batch mode](#batch-mode). Otherwise:

- **Variant** — first token, a letter A–Z, case-insensitive
- **Refinements** — everything after it

`B make header sticky, use Badge for status, add empty state` → variant B, three refinements.

Ask for the variant if it is missing, and for the changes if the refinements are empty.

## Step 2: Locate source files

1. Infer the active component from context, else the most recently modified folder under
   `designs/` that has variants.
2. Read `designs/<component-name>/variants/variant-<letter>.html`.
3. Read `designs/<component-name>/DESIGN_BRIEF_<COMPONENT_NAME>.md` in full.
4. Read `designs/DESIGN_SYSTEM.md` when it exists.

## Step 3: Inventory components

For every component named in the brief or the refinements, check the project's component
directories, read real props and variants from source, and note the gaps.

## Step 4: Adopt missing components

For each gap:

1. Spawn `mp-context7-docs-fetcher` against the project's component library.
2. Install with the detected package manager. shadcn projects:
   `<pm-exec> shadcn@latest add <name> --yes --overwrite` — `pnpm dlx`, `npx`, `yarn dlx`, or
   `bunx` per DESIGN_PIPELINE.md § Project discovery, and `shadcn-svelte@latest` on Svelte.
   Other libraries: their own documented install command.
3. Record the adoption in `SUMMARY.md`.

## Step 5: Write `refined.html`

`designs/<component-name>/refined.html`, following DESIGN_PIPELINE.md § Mockup HTML rules, plus:

- The chosen variant as visual and structural base
- **Every** refinement requirement applied
- Every state from the brief, not just the happy path
- Eyebrow label `REFINED — Variant <X> + <short refinement summary>`

## Step 6: Write `SUMMARY.md`

`designs/<component-name>/SUMMARY.md`. Requirements, states, and layout rules stay in the brief —
the summary carries only implementation-relevant decisions and the component map.

```markdown
# <Component Name> — Design Summary

**Base**: Variant <X> | **Refined**: <date>

## Refinements Applied

Variant <X> refined with: [comma-separated list]. See the design brief for full requirements.
Key structural changes from the base variant: [1–3 sentences].

## Component Map

### Codebase — use as-is

| Component | Path | Usage | Key Props/Variants |
| --------- | ------------------- | ------------- | --------------------------- |
| Button | `<discovered path>` | [where + how] | `variant="ghost" size="sm"` |

### Adopt

| Component | Source | Install command | Purpose |
| --------- | -------- | ---------------------- | ---------------- |
| [name] | [library] | `<detected pm command>` | [what it covers] |

### Build custom

| Proposed Name | Description | Why existing components don't cover it |
| ------------- | -------------- | -------------------------------------- |
| [name] | [what it does] | [reason] |

## Implementation Notes

[Animation approach, event model, accessibility, keyboard nav, scroll behaviour, edge cases.
Only what is not already in the brief.]
```

## Step 7: Update the brief

Insert below the `# Title` heading:

```markdown
> **Status**: Refined (Variant <X>)
> **Refined mockup**: `designs/<component-name>/refined.html`
> **Summary**: `designs/<component-name>/SUMMARY.md`
> **Refinements**: [comma-separated short list]
```

Refinement that reveals a missing or wrong requirement fixes it in the brief's own section rather
than recording it in the summary.

## Step 8: Comment on the GitHub issue

Ask for the design issue number if unknown, then:

```bash
gh issue comment <number> --body "## Design Refined

Variant **<X>** refined: [comma-separated refinements]

**Artifacts:**
- \`designs/<component-name>/refined.html\` — open in browser to review
- \`designs/<component-name>/SUMMARY.md\` — component map + implementation notes
- \`designs/<component-name>/DESIGN_BRIEF_<COMPONENT_NAME>.md\` — updated brief"
```

## Step 9: Unblock dependent issues

Run this only once the user has reviewed `refined.html` and approved it. Before approval, report
"Pending user approval — re-run the unblock pass once approved" and leave every label in place.

1. **Find candidates** — these signals are complementary, use whichever return results:

    ```bash
    gh issue view <design-issue> --json subIssues -q '.subIssues[].number'
    gh issue list --search "designs/<component-name>" --state open --json number,title,labels
    gh issue list --label "Design needed" --search "<component-name>" --state open --json number,title,labels
    ```

    Also parse open issue bodies for `Blocked by #<design-issue>`.

2. **Filter** to issues that genuinely depend on this design — skim the body when uncertain, so
   unrelated issues keep their labels.
3. **Remove the gate**: `gh issue edit <number> --remove-label "Design needed"`
4. Feed the results into Step 10.

## Step 10: Open and report

Open `refined.html` through Chrome DevTools MCP when available, no screenshot — the user reviews
it themselves.

Report in this order:

1. **Artifacts** — `refined.html`, `SUMMARY.md`, brief updated
2. **Component map** — counts only: N reuse, N adopted, N custom
3. **Unblocked** — `#<num> — <title>` per issue whose gate was cleared
4. **Ready to execute** — those unblocked issues carrying no other open `blocked-by`, so the user
   knows what can go to `/mp-execute` next
5. **Still blocked** — candidates left labelled, one line of reason each

## Batch mode

Argument `all`: refine every design folder whose variant choice is recorded but unprocessed.
Procedure: [BATCH_MODE.md](BATCH_MODE.md).
