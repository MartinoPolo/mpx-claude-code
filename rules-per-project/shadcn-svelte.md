---
paths:
  - "**/*.svelte"
  - "**/*.svelte.ts"
  - "**/*.svelte.js"
applyTo: "**/*.svelte,**/*.svelte.ts,**/*.svelte.js"
---

# shadcn-svelte

Accessible, composable components for Svelte/SvelteKit. Built on **Bits UI** primitives, Tailwind CSS, and TypeScript. Components are added as source code via CLI.

> **Docs:** Fetch https://www.shadcn-svelte.com/llms.txt for up-to-date component docs.
> **Blocks:** Browse pre-built page sections at https://www.shadcn-svelte.com/blocks

## Principles

1. **Use existing components and blocks first.** Check the registry and [blocks](https://www.shadcn-svelte.com/blocks) before writing custom UI.
2. **Compose from primitives.** Settings page = Tabs + Card + form controls. Dashboard = Sidebar + Card + Chart + Table.
3. **Use built-in variants before custom styles.** `variant="outline"`, `size="sm"`, etc.
4. **Use semantic colors.** `bg-primary`, `text-muted-foreground`.

## CLI

```bash
pnpm dlx shadcn-svelte@latest init                     # Initialize project
pnpm dlx shadcn-svelte@latest add button card dialog    # Add components
pnpm dlx shadcn-svelte@latest add --all                 # Add all components
```

## Blocks

Pre-built page sections available at https://www.shadcn-svelte.com/blocks. Install via CLI:

```bash
pnpm dlx shadcn-svelte@latest add dashboard-01
pnpm dlx shadcn-svelte@latest add sidebar-07
pnpm dlx shadcn-svelte@latest add login-01
```

| Category  | Examples                                                                                     |
| --------- | -------------------------------------------------------------------------------------------- |
| Dashboard | `dashboard-01`                                                                               |
| Sidebar   | `sidebar-01` through `sidebar-16` (collapsible, floating, nested, file tree, calendar, etc.) |
| Login     | `login-01` through `login-05`                                                                |
| Sign Up   | Sign-up page variants                                                                        |
| OTP       | OTP verification pages                                                                       |
| Calendar  | Calendar page layouts                                                                        |

Always check blocks before building page layouts from scratch.

## Styling

- Use **semantic color tokens**: `bg-primary text-primary-foreground`, `text-muted-foreground`, `text-destructive`.
- Use `Badge` variants for status indicators.
- Use `class` for **layout** (`max-w-md`, `mx-auto`), rely on variants for visual styling.
- Use `flex` with `gap-*` for spacing (e.g., `flex flex-col gap-4`).
- Use `size-*` when width equals height (`size-10`).
- Use `truncate` utility for text overflow.
- Semantic tokens handle light/dark — no manual `dark:` color overrides needed.
- Use `cn()` from `$lib/utils` for conditional class merging.
- Overlay components (Dialog, Sheet, Popover) manage their own z-index stacking.

## Icons

Use the `iconLibrary` from `components.json`. For Lucide (default), use path-based imports:

```svelte
<script>
	import SearchIcon from '@lucide/svelte/icons/search';
</script>

<Button>
	<SearchIcon />
	Search
</Button>
```

Components handle icon sizing internally — just place the icon component directly.

## Component Composition

**Bits UI** powers all interactive components. Key patterns:

**Namespace imports** for composite components, **named imports** for single components:

```svelte
import * as Select from "$lib/components/ui/select/index.js"; import * as Dialog from
"$lib/components/ui/dialog/index.js"; import {Button} from "$lib/components/ui/button/index.js"; import
{Spinner} from "$lib/components/ui/spinner/index.js";
```

**Snippets for custom triggers** (Bits UI composition pattern):

```svelte
<Dialog.Trigger>
	{#snippet child({ props })}
		<Button {...props} variant="outline">Open</Button>
	{/snippet}
</Dialog.Trigger>
```

**Structure rules:**

- Place items inside their group: `Select.Item` → `Select.Group`, `DropdownMenu.Item` → `DropdownMenu.Group`, `Command.Item` → `Command.Group`
- Include a title on overlays: `Dialog.Title`, `Sheet.Title`, `Drawer.Title` (use `class="sr-only"` when visually hidden)
- Use full Card composition: `Card.Header` / `Card.Title` / `Card.Description` / `Card.Content` / `Card.Footer`
- Place `Tabs.Trigger` inside `Tabs.List`
- Include `Avatar.Fallback` on every Avatar

**Button loading** — compose with Spinner:

```svelte
<Button disabled>
	<Spinner />
	Saving...
</Button>
```

## Prefer Built-in Components

| Need                | Use                                                |
| ------------------- | -------------------------------------------------- |
| Divider             | `<Separator />`                                    |
| Loading placeholder | `<Skeleton class="h-4 w-3/4" />`                   |
| Status label        | `<Badge variant="secondary">`                      |
| Callout             | `<Alert>` with `Alert.Title` / `Alert.Description` |
| Empty state         | `<Empty.Root>` with sub-components                 |
| Notification        | `toast()` from `svelte-sonner`                     |

## Forms

**Field component** for layout + accessibility:

```svelte
<Field.Set>
	<Field.Legend>Profile</Field.Legend>
	<Field.Group>
		<Field.Field>
			<Field.Label for="name">Name</Field.Label>
			<Input id="name" />
			<Field.Error>Required</Field.Error>
		</Field.Field>
	</Field.Group>
</Field.Set>
```

**Formsnap + Superforms + Zod** for validated server forms:

```svelte
<form method="POST" use:enhance>
	<Form.Field {form} name="email">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>Email</Form.Label>
				<Input {...props} bind:value={$formData.email} />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
</form>
```

**InputGroup** for addons (icons, buttons) inside inputs:

```svelte
<InputGroup.Root>
	<InputGroup.Input placeholder="Search..." />
	<InputGroup.Addon>
		<SearchIcon />
	</InputGroup.Addon>
</InputGroup.Root>
```

Apply `data-invalid` on `Field.Field` and `aria-invalid` on the control for validation states.

## Component Selection

| Need                | Use                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Button/action       | `Button` with variant                                                                               |
| Form inputs         | `Input`, `Select`, `Combobox`, `Switch`, `Checkbox`, `RadioGroup`, `Textarea`, `InputOTP`, `Slider` |
| Option toggle (2–5) | `ToggleGroup.Root` + `ToggleGroup.Item`                                                             |
| Data display        | `Table`, `Card`, `Badge`, `Avatar`                                                                  |
| Navigation          | `Sidebar`, `NavigationMenu`, `Breadcrumb`, `Tabs`, `Pagination`                                     |
| Overlays            | `Dialog` (modal), `Sheet` (side), `Drawer` (bottom), `AlertDialog` (confirm)                        |
| Feedback            | `svelte-sonner` (toast), `Alert`, `Progress`, `Skeleton`, `Spinner`                                 |
| Command palette     | `Command` inside `Dialog`                                                                           |
| Charts              | `Chart` (wraps LayerChart)                                                                          |
| Layout              | `Card`, `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible`                          |
| Empty states        | `Empty`                                                                                             |
| Menus               | `DropdownMenu`, `ContextMenu`, `Menubar`                                                            |
| Tooltips/info       | `Tooltip`, `HoverCard`, `Popover`                                                                   |

## Theming

CSS variables in `:root` (light) and `.dark` (dark), using OKLCH format.

| Variable                                 | Purpose                   |
| ---------------------------------------- | ------------------------- |
| `--background` / `--foreground`          | Page background and text  |
| `--primary` / `--primary-foreground`     | Primary buttons/actions   |
| `--secondary` / `--secondary-foreground` | Secondary actions         |
| `--muted` / `--muted-foreground`         | Muted/disabled states     |
| `--accent` / `--accent-foreground`       | Hover/accent states       |
| `--destructive`                          | Error/destructive actions |
| `--border`, `--input`, `--ring`          | Borders, inputs, focus    |
| `--chart-1` through `--chart-5`          | Charts                    |
| `--radius`                               | Border radius             |

Dark mode uses class-based toggle (`.dark` on `<html>`). This project has a custom dark mode context in `$lib/context/dark_mode.context.svelte.ts` — use `useDarkMode()` instead of third-party packages.

### Adding Custom Colors

Add to the global CSS file (`src/app.css`):

```css
:root {
  --warning: oklch(0.84 0.16 84);
  --warning-foreground: oklch(0.28 0.07 46);
}
.dark {
  --warning: oklch(0.41 0.11 46);
  --warning-foreground: oklch(0.99 0.02 95);
}

@theme inline {
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
}
```
