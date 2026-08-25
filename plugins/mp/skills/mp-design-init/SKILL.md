---
name: design-init
description: "Bootstraps a project's visual identity — derives a palette, font pairing, density, and motion language from the project's domain, then writes designs/tokens.css and designs/DESIGN_SYSTEM.md. Use when asked to init or bootstrap a design system, set up design tokens, or establish a project's visual identity. Run once per project."
argument-hint: ""
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.3"
  category: design
---

# Design System Initialization

Derive an opinionated visual identity from what the app is, grill the user until it's settled,
then write `designs/tokens.css` and `designs/DESIGN_SYSTEM.md`.

Shared conventions: [DESIGN_PIPELINE.md](../shared/DESIGN_PIPELINE.md).

**Once per project.** A re-run overwrites the design system — confirm first.

## Step 1: Gather project context

Read whatever exists:

- Project context/decision docs (`.mpx/CONTEXT.md`, `.mpx/DECISIONS.md`, `docs/`, `README.md`)
- `package.json` — name, description, framework
- The global stylesheet and `components.json` — see DESIGN_PIPELINE.md § Project discovery
- Any existing UI, for what the project already looks like

No usable description of the app? Ask the user for 2–3 sentences before continuing.

## Step 2: Recommend a visual direction

The opinionated step. Propose a complete direction, each choice tied to the app's domain and
emotional tone.

- **Palette** — match the domain. Wishlist → warm golds (anticipation). Finance → deep blues and
  greens (trust). Health → soft greens (calm). Developer tool → dark surfaces, accent highlights
  (focus). Social → vibrant and varied (energy).
- **Font pairing** — a specific heading + body pair with a personality that fits. Google Fonts for
  availability. System fonts only when the app demands maximum performance.
- **Density** — data-heavy → dense; reading/content → airy; mixed → medium.
- **Motion** — utility → subtle (150–200ms ease-out); consumer → expressive (spring, ~300ms);
  dashboard → minimal (loading states only).
- **Radius** — consumer → 8–12px; utility → 4–6px; technical → 0–2px.
- **Elevation** — flat light mode → borders over shadows; elevated light mode → layered shadows;
  dark mode → lighter surfaces for elevation.

Present as a 3–4 sentence vision statement, then the concrete values, each with its WHY.

## Step 3: Grill until settled

Ask about: overall direction (too playful? too corporate?), light/dark/both, font overrides,
brand colors that must be honoured, and anything the recommendation missed. Iterate to confirmation.

## Step 4: Reconcile with the existing theme

If the project already has a component library theme (shadcn `components.json` style + base color,
generated custom properties in the global stylesheet), the design tokens **complement** it. The
library owns component-level tokens; the design system owns app-level semantics, the type scale,
spacing philosophy, radius and shadow values for custom components, and motion standards.

Spawn `mp-context7-docs-fetcher` for the library's theming API before overriding anything.

## Step 5: Write `designs/tokens.css`

OKLCH colors for perceptual uniformity. Google Fonts `@import` at the top.

```css
:root {
	/* Typography */
	--font-sans: 'Font Name', system-ui, sans-serif;
	--font-mono: 'Mono Font', ui-monospace, monospace;

	/* Colors */
	--color-primary: oklch(...);
	/* … full semantic set … */

	/* Spacing scale, radii, shadows, motion */
	--space-1: 4px;
}

/* Dark mode overrides, when the project supports it */
.dark {
}
```

## Step 6: Write `designs/DESIGN_SYSTEM.md`

The reference the other three skills read. Cover:

- **Typography** — families with rationale, size scale, weights, heading letter-spacing
- **Color** — every token with its value, usage guidance, contrast notes
- **Spacing & layout** — the scale, when to use each step, grid/flex preferences, density rules
- **Component patterns** — how to use the project's component library within this language,
  variant preferences, icon sizing
- **Motion** — timing functions, durations, what animates and what does not

## Step 7: Record decisions

Append each settled decision to the project's decisions doc if one exists:

```markdown
### [Decision title]

Decided: [date]
What: [choice]
Why: [rationale tied to the app domain]
Rejected: [alternatives considered]
```

## Step 8: Report

Visual identity in one sentence, files written, and that `/mp:design-brief` → `/mp:mockup` →
`/mp:design-refine` now consume these tokens.
