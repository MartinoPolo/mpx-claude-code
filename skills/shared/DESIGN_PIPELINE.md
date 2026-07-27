# Design Pipeline

Conventions shared by `mp-design-init`, `mp-design-brief`, `mp-mockup`, and `mp-design-refine`.
Those skills link here instead of restating any of it.

## Pipeline

| Skill | Runs | Produces |
| ------------------ | -------------------- | --------------------------------------------- |
| `mp-design-init` | once per project | `designs/DESIGN_SYSTEM.md`, `designs/tokens.css` |
| `mp-design-brief` | once per component | `DESIGN_BRIEF_<NAME>.md`, `Design needed` labels |
| `mp-mockup` | after the brief | `variants/variant-<letter>.html` |
| `mp-design-refine` | after variant chosen | `refined.html`, `SUMMARY.md`, labels removed |

## Folder layout

```
designs/
├── DESIGN_SYSTEM.md                    ← design language reference
├── tokens.css                          ← CSS custom properties
└── <component-name>/                   ← kebab-case
    ├── DESIGN_BRIEF_<COMPONENT_NAME>.md  ← authoritative requirements (always kept current)
    ├── refined.html                      ← authoritative visual design (post-refine)
    ├── SUMMARY.md                        ← component map + implementation notes
    └── variants/
        ├── variant-a.html                ← kept for reference
        ├── variant-b.html
        └── DECISION.md                   ← user's variant choice + refinement notes
```

## Project discovery

Assume nothing about the project's stack. Discover it once, at the start of each skill, and
carry the answers through.

**Design language** — `designs/DESIGN_SYSTEM.md` and `designs/tokens.css` when they exist.
Otherwise infer from the project's global stylesheet (`src/app.css`, `src/styles/global.css`,
`app/globals.css` — glob for it) and from existing components.

**Fonts and palette** — read them from the tokens file or the global stylesheet. Never carry a
palette or font pairing over from another project.

**Component directories** — discover, do not assume. In order:

1. `components.json` → `aliases.ui` / `aliases.components` (shadcn projects)
2. Glob for directories holding component files: `src/**/components/*/`, `app/components/*/`,
   `lib/components/*/`
3. Note which directory holds vendored primitives and which holds project-specific compositions

**Component APIs** — read the component source, its variants file (`*-variants.ts`), or its
story (`*.stories.*`) to get real prop and variant names.

**Framework** — from `package.json` dependencies (svelte, react, vue, …).

**Package manager** — lockfile first (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn,
`bun.lock*` → bun, `package-lock.json` → npm), else `package.json` → `packageManager`.

**Library docs** — spawn `mp-context7-docs-fetcher` (omit `model`; it declares its own).
Use it for any framework or component-library API question rather than recalling from memory.

## Mockup HTML rules

Every generated `.html` (variants and `refined.html`) must:

- Link the tokens file rather than inlining it — `<link rel="stylesheet" href="../../tokens.css">`
  from `variants/`, `href="../tokens.css"` from the component folder. With no tokens file, inline
  the project's CSS custom properties in a `<style>` block.
- Load the project's actual fonts (Google Fonts link plus system fallbacks).
- Use the project's own utility and design-system classes throughout.
- Keep `<style>` to component-specific layout — token *values* live in the tokens file.
- Use realistic mock data: real-looking paths, plausible metrics, believable copy.
- Carry an eyebrow label at the top naming the variant and its angle
  (e.g. `VARIANT A — DENSE, DEVELOPER-FOCUSED`), styled with the project's eyebrow/overline class
  or a small uppercase letter-spaced rule.
- Render at ~1440×900 viewport proportions.

### Container context

When the brief specifies surrounding context, reproduce it:

- Elements already in final state render at full fidelity and at their real proportions.
- Elements still being designed render at reduced opacity as non-editable context.
- The designed component fills only its own area — parent chrome (tab bars, panel borders,
  navigation) belongs to the parent and is never duplicated inside the component.
- A standalone component owns its full chrome.

## Design gating label

`Design needed` gates implementation issues on an unfinished design.
`mp-design-brief` creates the label and applies it; `mp-design-refine` removes it.

Match the repo's actual label if it differs — discover with `gh label list --search design`.
With no GitHub remote or no `gh`, skip the gating steps and say so in the report.

## Model policy

Design work runs on opus, always. Every agent these skills spawn is an `mp-*` agent declaring its
own model and effort, so no call site passes `model`. Adding a `general-purpose` or `claude` spawn
would require `model: opus` — prefer a declaring agent, since the `Agent` tool has no `effort`
parameter and generative design must not inherit a low session effort.
See [SUBAGENT_PROTOCOL.md](SUBAGENT_PROTOCOL.md) § 11.
