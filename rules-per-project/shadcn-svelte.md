---
paths:
    - '**/*.svelte'
    - '**/*.svelte.ts'
    - '**/*.svelte.js'
    - '**/*-variants.ts'
applyTo: '**/*.svelte,**/*.svelte.ts,**/*.svelte.js,**/*-variants.ts'
---

# shadcn-svelte

Built on **Bits UI** primitives, Tailwind CSS 4, and TypeScript. Components live as source code under `$lib/components/shadcn/`.

> **Docs:** Fetch https://www.shadcn-svelte.com/llms.txt or use Context7 MCP for up-to-date API reference.

## Component Layering System

Three tiers — every component belongs to exactly one:

| Tier | Location | Storybook prefix | When to use |
|------|----------|-------------------|-------------|
| **Base** | `shadcn/` + `base/` | `Base/` | Direct shadcn-svelte installations + small custom primitives (HelpText, SearchField, StatCell) |
| **Derived** | `derived/` | `Derived/` | Wraps Base components for a specific app concern. Create when a pattern is used **≥2 times** across the UI. |
| **Blocks** | `blocks/<module>/` | `Blocks/<Module>/` | Feature-level composed UI: cards, panels, wizards, views. May depend on context stores. |

**Rules:**
- Use shadcn-svelte base components before writing custom markup.
- When the same component pattern appears ≥2 times, extract a Derived component.
- Every component gets its own Storybook page (one `.stories.svelte` per component).
- Composition demos (showing how components work together) are separate stories titled `Blocks/<Module>/Layout` or similar.

## Imports

**Multi-part** (dialog, select, card, tabs, …): namespace import.
**Single-component** (button, input, badge, …): named import.

```ts
import * as Dialog from "$lib/components/shadcn/dialog/index.js";
import * as Card from "$lib/components/shadcn/card/index.js";
import { Button } from "$lib/components/shadcn/button/index.js";
import { Input } from "$lib/components/shadcn/input/index.js";
```

Derived components have no barrel — import the `.svelte` file directly.

## Styling

- **Semantic color tokens only**: `bg-primary`, `text-muted-foreground`, `text-destructive` — never raw values like `bg-blue-500`.
- **`class` for layout** (`max-w-md`, `mx-auto`), never for overriding component colors/typography.
- **`flex` + `gap-*`** for spacing — never `space-x-*` / `space-y-*`.
- **`size-*`** when width equals height (`size-10` not `w-10 h-10`).
- **`truncate`** shorthand, not `overflow-hidden text-ellipsis whitespace-nowrap`.
- **`cn()`** from `$lib/utils` for conditional class merging — no manual ternaries in class strings.
- **No manual `dark:` overrides** — semantic tokens handle light/dark automatically.
- **No manual `z-index`** on overlay components (Dialog, Sheet, Popover handle their own stacking).
- **Built-in variants first** (`variant="outline"`, `size="sm"`) before custom styles.

## Icons

Use path-based Lucide imports. Components handle sizing — **no `size-*` classes on icons inside components**.

```svelte
<script>
  import SearchIcon from '@lucide/svelte/icons/search';
</script>

<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>
```

- `data-icon="inline-start"` (prefix) or `data-icon="inline-end"` (suffix) on icons inside `Button`.
- Never use Unicode characters as icons (⌫, ⌘, ✓, ×) — use Lucide components. Exception: keyboard labels inside `<Kbd>`.

## Composition Rules

**Items always inside their Group:**
- `Select.Item` → `Select.Group`, `DropdownMenu.Item` → `DropdownMenu.Group`, `Command.Item` → `Command.Group`

**Overlays always need a Title** (a11y): `Dialog.Title`, `Sheet.Title`, `Drawer.Title` — use `class="sr-only"` if visually hidden.

**Card structure**: Always use `Card.Header` / `Card.Title` / `Card.Description` / `Card.Content` / `Card.Footer` composition.

**Tabs**: `Tabs.Trigger` must be inside `Tabs.List`.

**Avatar**: Always include `Avatar.Fallback`.

**Button loading**: Compose `Spinner` + `disabled` — no `isPending`/`isLoading` prop exists.

```svelte
<Button disabled>
  <Spinner data-icon="inline-start" />
  Saving...
</Button>
```

**Custom triggers** use Bits UI snippet pattern:
```svelte
<Dialog.Trigger>
  {#snippet child({ props })}
    <Button {...props} variant="outline">Open</Button>
  {/snippet}
</Dialog.Trigger>
```

## Forms

- **`Field.FieldGroup` + `Field.Field`** for form layout — never raw `div` with spacing classes.
- **`InputGroup.Root` + `InputGroup.Input`** for input addons — never raw `Input` inside `InputGroup.Root`.
- **`ToggleGroup`** for 2–5 option sets — never manual `Button` loops with active state.
- **`Field.FieldSet` + `Field.FieldLegend`** for grouping related checkboxes/radios.
- **Validation**: `data-invalid` on `Field.Field`, `aria-invalid` on the control. **Disabled**: `data-disabled` on `Field.Field`, `disabled` on the control.

## Prefer Built-in Components

| Instead of | Use |
|------------|-----|
| `<hr>` or border div | `<Separator />` |
| `animate-pulse` div | `<Skeleton class="h-4 w-3/4" />` |
| Custom styled span | `<Badge variant="secondary">` |
| Custom callout div | `<Alert>` with `Alert.Title` / `Alert.Description` |
| Custom empty state | `<Empty.Root>` with sub-components |
| Custom toast | `toast()` from `svelte-sonner` |

## Component Selection

| Need | Use |
|------|-----|
| Button/action | `Button` with variant |
| Form inputs | `Input`, `Select`, `Combobox`, `Switch`, `Checkbox`, `RadioGroup`, `Textarea`, `InputOTP`, `Slider` |
| Toggle 2–5 options | `ToggleGroup.Root` + `ToggleGroup.Item` |
| Data display | `Table`, `Card`, `Badge`, `Avatar` |
| Navigation | `Sidebar`, `Tabs`, `Breadcrumb`, `Pagination` |
| Overlays | `Dialog` (modal), `Sheet` (side), `Drawer` (bottom), `AlertDialog` (confirm) |
| Feedback | `svelte-sonner` (toast), `Alert`, `Progress`, `Skeleton`, `Spinner` |
| Command palette | `Command` inside `Dialog` |
| Layout | `Card`, `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible` |
| Empty states | `Empty` |
| Menus | `DropdownMenu`, `ContextMenu`, `Menubar` |
| Tooltips/info | `Tooltip`, `HoverCard`, `Popover` |

## Theming

CSS variables in `:root` (light) and `.dark` (dark), OKLCH format. Dark mode via class toggle (`.dark` on `<html>`) using `mode-watcher`.

Custom colors: add to `src/app.css` with `@theme inline` block.

## Component Variant File Structure (`*-variants.ts`)

The `*-variants.ts` file is the **single source of truth** — types and constants derived from the `tv()` definition.

```
component/
  component-variants.ts   ← tv() config, types, constants
  Component.svelte        ← imports from variants file
  index.ts                ← Root from .svelte, everything else from variants file
```

**Types**: `keyof typeof myVariants.variants.variant` — not `VariantProps<...>` (adds `| undefined`).
**Full arrays**: `Object.keys(myVariants.variants.variant) as MyVariant[]`.
**Subset arrays**: `asExhaustiveArray<MyVariant>()([...])` from `$lib/utils/variants.js`.
**`index.ts`**: import `Root` from `.svelte`, everything else directly from `*-variants.ts`.
**`.svelte`**: no `<script module>` re-exports.
