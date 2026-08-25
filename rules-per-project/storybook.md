---
paths:
  - "**/*.stories.svelte"
applyTo: "**/*.stories.svelte"
---

# Storybook

Story structure, naming, and quality rules. For low-level Storybook API usage (imports, `defineMeta`, play test utilities, bits-ui patterns), see the shadcn-svelte rule.

## Story Organization

Three tiers mirror the component layering system:

| Tier        | Storybook title prefix | Component location                                                                     |
| ----------- | ---------------------- | -------------------------------------------------------------------------------------- |
| **Base**    | `Base/`                | `base/` (plus `shadcn/` in projects that split shadcn installs from custom primitives) |
| **Derived** | `Derived/`             | `derived/`                                                                             |
| **Blocks**  | `Blocks/<Module>/`     | `blocks/<module>/`                                                                     |

Every component gets exactly one `.stories.svelte` file.

## Coverage Bar

Every component gets exactly one `.stories.svelte` file — no complexity threshold. Story sort order is mechanical: `storySort: { order: ['Base', 'Derived', 'Blocks'] }` in `preview.ts`, titles prefixed `Base/…`, `Derived/…`, `Blocks/<Module>/…`.

## Component API Naming

Variant props are named by dimension — `intent`, `tone`, `size`, `state`, `format` — never a generic `variant` prop. Variant arrays/types live in the component's `*_variants.ts` (or `*-variants.ts`) file and are the single source of truth stories import from.

## "All Variants" Story

Every component with variant dimensions (intent, size, tone, format, style, etc.) must have an **"All Variants"** story as its **first story**. This serves as the visual regression baseline.

**Requirements:**

- Import variant arrays from `*-variants.ts` or `index.ts` (e.g. `BUTTON_INTENTS`, `BADGE_TONES`, `BADGE_SIZES`).
- Loop through variant arrays with `{#each}` — never hardcode individual variants.
- Build a **full matrix** combining all variant dimensions. Use a grid layout: one dimension on columns, another on rows. Badge and Button are the templates.
- Label rows and columns with dimension values using the muted text token (`text-muted-foreground` or the project's equivalent).
- If there are more than 2 dimensions, nest loops or split into sections with headings (`text-sm font-medium` on the muted text token).
- Use `argTypes` with `control: 'select'` and `options: [...VARIANT_ARRAY]` for interactive controls.

**Reference — Badge (tone × size × format × style, 4 dimensions):**

```svelte
{#each BADGE_STYLES as badgeStyle (badgeStyle)}
  {#each BADGE_SIZES as size (size)}
    {#each BADGE_FORMATS as format (format)}
      {#each BADGE_TONES as tone (tone)}
        <Badge {tone} {badgeStyle} {format} {size}>{tone}</Badge>
```

**Reference — Button (intent × size, split into text/icon/icon+text sections):**

```svelte
{#each BUTTON_INTENTS as intent (intent)}
  {#each BUTTON_TEXT_SIZES as size (size)}
    <Button {intent} {size}>Label</Button>
```

## "All States" Story

Components with interactive states (checked, disabled, indeterminate, error, open) should have an **"All States"** story showing every visual state. This is separate from "All Variants" — variants are design dimensions, states are interaction states.

## Per-Dimension Stories

Each variant dimension should also have its own dedicated story showcasing all values of that single dimension. Examples: "All Dots" for Badge dot options, "All Fonts" for Badge formats, "All Styles" for Badge styles. This gives focused documentation for each axis.

## Play Function Idiom

- Named `play*` consts defined in `<script module>`, typed with a `PlayContext` interface, passed as `play={playName}` — never inline anonymous functions.
- Assertions scope to `canvasElement` with `data-slot`, role, or `aria-label` queries — never decorator-injected DOM.
- bits-ui overlay quirks: use `userEvent.setup({ pointerEventsCheck: 0 })` (bits-ui sets `pointer-events: none` mid-transition) and `waitFor(...)` polling on `aria-expanded` / `data-state` for open/close transitions.
- Blocks-tier composed cards get containment/propagation play tests: clicking a nested interactive element must not trigger the parent's handler (and vice versa where intended).

## Play Test Labels

Every story with a `play` function must include a **`[play: description]`** suffix in its name. The description is a short lowercase phrase summarizing what the test verifies.

Format: `"Story Name [play: what it tests]"`

Examples:

- `"Primary [play: click calls handler]"`
- `"Disabled [play: disabled no change]"`
- `"Keyboard Navigation [play: keyboard toggle]"`
- `"With Submenus [play: arrow down focuses]"`
- `"Escape Containment [play: escape contained]"`

Stories without play functions never have `[play:]` in their name.

## Fixtures (Blocks Tier)

Use realistic domain fixtures plus adversarial ones (e.g. a 90-char unbroken name to prove `line-clamp` containment); every stub value carries a comment explaining why it was chosen. Context-dependent blocks get isolated stub contexts in stories.

## Accessibility Gate

The Storybook a11y addon runs at `test: 'error'` (blocking). Disabling a rule requires an itemized one-line justification comment next to the exclusion. Only downgrade to `'todo'` when compliance is genuinely impractical, per-rule, never globally.

## Theming Stories

Theme (dark/light) and accent switching are handled by one global decorator/toolbar — never per-story boilerplate. A story may pin a fixed theme wrapper only when comparing variants side by side. Components must consume semantic/accent tokens; a story rendered under a swapped accent must not show hardcoded colors.

## Motion Stories

Components with meaningful motion (press feedback, enter/exit transitions, selection transitions) get a dedicated "Motion" story for eyeball review. Play functions never assert on animations/transitions — such behavior is verified via e2e, full stop.

## Keyboard Shortcut Info Boxes

Stories that demonstrate keyboard interaction must include a visible info box listing available shortcuts. Place it **above** the component inside the story template. Use the `StoryKeyboardHints` and `KeyboardHint` components from `$lib/storybook/`.

```svelte
<script>
	import StoryKeyboardHints from '$lib/storybook/StoryKeyboardHints.svelte';
	import KeyboardHint from '$lib/storybook/KeyboardHint.svelte';
</script>

<StoryKeyboardHints>
	<KeyboardHint keys="Enter / Space" action="Toggle item" />
	<KeyboardHint keys="↓ / ↑" action="Navigate items" />
	<KeyboardHint keys="Escape" action="Close" />
</StoryKeyboardHints>
```

- `keys` prop: single key (`"Escape"`) or multiple keys separated by `/` (`"Enter / Space"`, `"↓ / ↑"`).
- `action` prop: short description of what the shortcut does.
- Never use raw `<kbd>` elements in stories — always use `KeyboardHint`.
- Document the actual keyboard shortcuts the component supports — check what the play test exercises and what the underlying shadcn-svelte/bits-ui primitive provides.

## Overlay Stories

Overlay components (Dialog, Sheet, Popover, Select, DropdownMenu, ContextMenu) must use `portalProps={{ disabled: true }}` in stories so content renders inside the Storybook canvas rather than escaping to `<body>`.

## Templates Must Consume Args

Every `{#snippet template()}` must take `args` and spread it onto the meta `component` (the compound Root for multi-part components) — otherwise the Controls panel edits nothing and silently does nothing.

```svelte
{#snippet template(args: BadgeProps)}
	<Badge {...args} {tone} {badgeStyle} {format} {size}>{tone}</Badge>
```

- **Showcase/matrix stories** (multiple instances, each pinning specific props by design): spread `{...args}` **first**, pinned props **after** — pinned wins.
- **Default/single-instance/interactive/play stories**: hardcoded setup props **first**, `{...args}` **last** — controls win.
- Args type: reuse an existing exported props type if the component has one; otherwise alias `Partial<ComponentProps<typeof X>>` in the module script. Use `Partial`, not the bare `ComponentProps` — a non-`Partial` alias makes every pinned prop that precedes the spread a TS2783 "specified more than once" error under `svelte-check`.
- bits-ui discriminated-union components (Accordion, Select, Slider, Calendar, RadioGroup, ToggleGroup): also `Omit` the discriminant keys from the args type (`'type' | 'value' | 'onValueChange'`, plus any variant-specific callback like Slider's `onValueCommit`) — the full prop union across variants is too complex for TS to check against a spread. If `Omit` over `ComponentProps` still errors as "too complex to represent," import the single-variant type directly from `bits-ui` (e.g. `CalendarSingleRootProps`) instead.
- A template that renders no instance of the meta component (e.g. a story that only calls an imperative helper like `toast()` from a button) is exempt — there is nothing for `args` to bind to.
</content>
</invoke>
