---
name: mp-design-3-styles
description: 'Generate multiple UI variants in different design styles for comparison. Spawns parallel subagents, each creating a variant in a distinct aesthetic. Use when: "design styles", "style variants", "design exploration", "explore designs", "3 styles", "5 styles"'
argument-hint: '<ComponentOrPageName> [--count 5] [--styles brutalism,cafe,luxury] [--target src/components/MyComponent.svelte]'
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(cat *), Bash(mkdir *), Bash(rm -rf */.design-variants*), Bash(mv *), Bash(cp *), AskUserQuestion, Agent, Task
metadata:
  author: MartinoPolo
  version: "1.0"
  category: design
---

# Design Style Exploration

Generate multiple UI variants in different design styles, compare side-by-side, pick a winner, extract design tokens.

## Usage

```
/mp-design-3-styles LoginForm
/mp-design-3-styles DashboardPage --count 5
/mp-design-3-styles Sidebar --styles brutalism,cafe,luxury
/mp-design-3-styles PricingCard --target src/components/PricingCard.svelte
```

## Arguments

- **First argument** (required): Component or page name in PascalCase
- `--count N`: Number of variants (default: 3, any positive integer)
- `--styles`: Comma-separated style slugs from `style-catalog.md` (overrides auto-selection)
- `--target`: Where the winner should be placed (auto-detected if omitted)

$ARGUMENTS

## Workflow

```
1. Parse & Detect → 2. Select Styles → 3. Spawn Subagents → 4. Generate Comparison → 5. User Picks → 6. Finalize
```

### Step 1: Parse Arguments & Detect Context

#### Detect framework

Read `package.json` in the project root. Determine framework:

| Dependency | Framework | File extension |
|---|---|---|
| `svelte` | Svelte | `.svelte` |
| `react` or `next` | React | `.tsx` |
| `vue` or `nuxt` | Vue | `.vue` |
| None of the above | HTML | `.html` |

#### Detect scope

Infer from the component name and context:

- Names containing `Page`, `View`, `Layout`, `Dashboard`, `Landing` → **page** scope
- Everything else → **component** scope
- User can clarify if ambiguous

#### Detect target path

If `--target` not specified, infer from project structure:

1. Search for existing file matching the component name
2. If found, use that path (the variant will replace it)
3. If not found, use `src/components/{Name}.{ext}` for components or `src/routes/` / `src/pages/` for pages

### Step 2: Select Styles

Read the style catalog: `~/.claude/skills/mp-design-3-styles/style-catalog.md`

**If `--styles` provided:** Use those exact styles.

**If auto-selecting:** Pick `N` styles that maximize distance across 4 axes:

1. **Theme polarity** — mix light and dark surfaces
2. **Typography family** — mix serif, sans, mono, and display fonts
3. **Density** — mix airy, medium, and dense
4. **Mood** — mix professional, playful, raw, and elegant

Algorithm: from the 18 catalog styles, select N that cover the widest spread. Prefer including at least one dark theme, one display/unusual font, and one minimal/clean option.

Present the selected styles to the user before spawning:

> "I'll generate 3 variants: **brutalism** (raw, thick borders), **cafe** (warm, cozy), **cosmic** (dark, neon). Generating now..."

### Step 3: Spawn Parallel Subagents

Create the variants directory:

```
src/.design-variants/
├── v1-{style-slug}/
├── v2-{style-slug}/
└── v3-{style-slug}/
```

Spawn one `mp-style-variant-generator` agent per style, **all in parallel**. Each agent receives:

```
Generate a {scope} named "{ComponentName}" in the {framework} framework.

## Functional Requirements
{user's original requirements or description of what the component/page does}

## Style Definition
{full style entry from style-catalog.md}

## Output
Write files to: {absolute path to variant folder}
Component name: {ComponentName}
Framework: {framework}
Scope: {scope}

## Anti-AI-Slop
- NEVER use generic fonts (Inter, Roboto, Arial) unless the style specifies them
- NEVER use purple gradients on white
- NEVER use centered 3-column equal card grids unless the style demands it
- Use the style's exact fonts and colors — no substitutions
- Use realistic example data, not "Lorem ipsum" or "John Doe"
```

### Step 4: Generate Comparison Page

After all subagents complete, generate a comparison page at `src/.design-variants/CompareAll.{ext}`.

#### Component scope — Side-by-side grid

Generate a page/component that imports all N variants and renders them in a responsive grid:

- 1 column on mobile, 2 columns on tablet, 3 columns on desktop
- Each cell has a label showing the style name
- Each cell renders the variant component with the same props/data

**Svelte example structure:**
```svelte
<script>
  import V1 from './v1-brutalism/{ComponentName}.svelte';
  import V2 from './v2-cafe/{ComponentName}.svelte';
  import V3 from './v3-cosmic/{ComponentName}.svelte';
</script>

<div class="compare-grid">
  <div class="variant">
    <h2>1. Brutalism</h2>
    <V1 />
  </div>
  <div class="variant">
    <h2>2. Cafe</h2>
    <V2 />
  </div>
  <div class="variant">
    <h2>3. Cosmic</h2>
    <V3 />
  </div>
</div>
```

#### Page scope — Tabbed view

Generate a tabbed layout where each tab renders one variant at full width:

- Tab bar at top with style names
- Active tab renders the full page variant below
- Keyboard navigable (arrow keys between tabs)

### Step 5: User Picks a Winner

Inform the user how to view the comparison:

> "All variants generated. View them at `src/.design-variants/CompareAll.svelte`.
> Start your dev server to see them side-by-side."

Then ask which variant they prefer:

Use `AskUserQuestion` with options for each variant (by style name) plus "None — regenerate" option.

If user picks "None":
- Ask what they didn't like and what direction to try
- Go back to Step 2 with adjusted style selection

### Step 6: Finalize

After user picks a winner:

#### 6a. Move winner to target

Copy the winning variant's component file(s) to the target path (from Step 1). If a file already exists at the target, confirm before overwriting.

#### 6b. Extract design tokens

Create a `design-tokens.md` file alongside the target component:

```markdown
# Design Tokens — {style-name}

Extracted from {ComponentName} variant.

## Typography
- Display: {font}
- Body: {font}
- Mono: {font}

## Colors
- Primary: {hex}
- Secondary: {hex}
- Surface: {hex}
- Text: {hex}

## Spacing
- Density: {level}
- Base unit: {value}

## Motion
- Approach: {description}
- Duration: {values used}

## CSS Custom Properties
{extract all --custom-properties defined in the component}
```

#### 6c. Clean up

Delete the entire `src/.design-variants/` directory.

Report:

> "Done. Winner ({style-name}) placed at `{target-path}`. Design tokens saved to `{tokens-path}`. Variants cleaned up."

## Notes

- The comparison page uses minimal styling to avoid influencing perception of the variants
- Each variant is isolated — styles don't leak between them (scoped CSS)
- If a variant subagent fails, report the error and continue with the successful ones
- The skill does NOT commit anything — user decides when to commit
