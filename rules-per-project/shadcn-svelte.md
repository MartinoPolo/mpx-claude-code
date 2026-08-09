---
paths:
    - '**/*.svelte'
    - '**/*.svelte.ts'
    - '**/*.svelte.js'
    - '**/*_variants.ts'
    - '**/*.stories.svelte'
applyTo: '**/*.svelte,**/*.svelte.ts,**/*.svelte.js,**/*_variants.ts,**/*.stories.svelte'
---

# shadcn-svelte

Built on **Bits UI** primitives, Tailwind CSS 4, TypeScript. Components live as source in the base tier — `$lib/components/base/`.

## When unsure or a bug appears — read the source, don't improvise

Any question about a component's API, props, or behaviour, and any fix for a broken interaction, must be grounded in how the library actually works. Before guessing:

- **Local clones** (authoritative, offline): `$MPX_CLONED/shadcn-svelte/docs/content/components/<name>.md` and `$MPX_CLONED/bits-ui/docs/content/components/<name>.md`. shadcn wraps Bits UI, so behaviour/props usually trace to the Bits UI page.
- **Context7 MCP** (`mp-context7-docs-fetcher`) for anything the clones don't cover.

This overrides any convention below when they disagree.

## Layering — every component belongs to exactly one tier

- **Base** — `base/` (`shadcn/` where installs are split), story `Base/`: direct shadcn installs + small custom primitives (HelpText, SearchField, StatCell).
- **Derived** — `derived/`, story `Derived/`: wraps Base for one app concern. Extract once a pattern appears **≥2×**.
- **Blocks** — `blocks/<module>/`, story `Blocks/<Module>/`: feature-level composed UI (cards, panels, wizards). May depend on context stores.

Reach for a Base component before writing custom markup.

## Imports

Multi-part (dialog, select, card, tabs…) → namespace. Single-component (button, input, badge…) → named. Derived have no barrel — import the `.svelte` directly.

```ts
import * as Dialog from "$lib/components/base/dialog/index.js";
import { Button } from "$lib/components/base/button/index.js";
```

## Styling

- **Semantic tokens only** — `bg-primary`, `text-muted-foreground`, `text-destructive`; never `bg-blue-500`, never manual `dark:`.
- **`class` for layout only** (`max-w-md`, `mx-auto`) — not for overriding component colors/typography. Built-in variants first (`variant="outline"`, `size="sm"`).
- **`flex` + `gap-*`** for spacing, not `space-x/y-*`. **`size-*`** when w == h. **`truncate`** shorthand.
- **`cn()`** from `$lib/utils` for conditional classes — no ternaries in class strings.
- **No manual `z-index`** on overlays (Dialog, Sheet, Popover self-stack).

## Icons

Path-based Lucide imports. Components size icons themselves — no `size-*` on icons inside components. Never Unicode glyphs (⌫ ⌘ ✓ ×), except keyboard labels inside `<Kbd>`.

```svelte
<script>import SearchIcon from '@lucide/svelte/icons/search';</script>
<Button><SearchIcon data-icon="inline-start" />Search</Button>
```

`data-icon="inline-start"` / `"inline-end"` for prefix/suffix icons in `Button`.

## Composition

- **Items inside their Group**: `Select.Item`→`Select.Group`, `DropdownMenu.Item`→`DropdownMenu.Group`, `Command.Item`→`Command.Group`.
- **Overlays need a Title** (a11y): `Dialog.Title` / `Sheet.Title` / `Drawer.Title` — `class="sr-only"` if hidden.
- **Card**: `Card.Header`/`Title`/`Description`/`Content`/`Footer`. **Tabs**: `Tabs.Trigger` inside `Tabs.List`. **Avatar**: always `Avatar.Fallback`.
- **Button loading**: compose `Spinner` + `disabled` (no `isPending`/`isLoading` prop).
- **Custom triggers** via Bits UI `child` snippet:

```svelte
<Dialog.Trigger>
  {#snippet child({ props })}
    <Button {...props} variant="outline">Open</Button>
  {/snippet}
</Dialog.Trigger>
```

## Forms

- **`Field.FieldGroup` + `Field.Field`** for layout — not raw `div` + spacing. **`Field.FieldSet` + `Field.FieldLegend`** to group checkboxes/radios.
- **`InputGroup.Root` + `InputGroup.Input`** for addons — never raw `Input` inside `InputGroup.Root`.
- **`ToggleGroup`** for 2–5 option sets — not `Button` loops with active state.
- **Validation**: `data-invalid` on `Field.Field`, `aria-invalid` on the control. **Disabled**: `data-disabled` on `Field.Field`, `disabled` on the control.

## Theming

CSS vars in `:root` (light) / `.dark` (dark), OKLCH. Dark mode by class toggle on `<html>` via `mode-watcher`. Custom colors: `@theme inline` block in `src/app.css`.

## Variant files (`*_variants.ts`)

Single source of truth — types and constants derive from the `tv()` config.

```
component/
  component_variants.ts   ← tv() config, types, constants
  Component.svelte        ← imports from variants file; no <script module> re-exports
  index.ts                ← Root from .svelte, everything else from variants file
```

- **Types**: `keyof typeof myVariants.variants.variant` — not `VariantProps<...>` (adds `| undefined`).
- **Full arrays**: `Object.keys(myVariants.variants.variant) as MyVariant[]`.
- **Subset arrays**: `asExhaustiveArray<MyVariant>()([...])` from `$lib/utils/variants.js`.
