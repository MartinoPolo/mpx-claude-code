# shadcn-svelte Component Catalog

Reference lookup — not auto-loaded. Consult when choosing which component to reach for; linked from the `shadcn-svelte.md` rule.

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
