# Audit Axis Checklists

Concrete anti-pattern checklists fed to the per-component sub-agents. Pass the relevant axis (or axes) to each agent along with the discovered inventory and the exclusion set. Every finding reports `{ axis, file, line, current code, suggested fix, confidence }`. Always exclude the component-implementation folder(s).

## Axis A — Native element → component

Find native/hand-rolled markup that an inventory component replaces:

1. `<button>` → `<Button>` (with the appropriate variant)
2. `<input>` → `<Input>`
3. `<select>` → `<Select>`
4. `<textarea>` → `<Textarea>`
5. raw `<a>` styled as a button → `<Button href="...">`
6. native date `<input type="date">` / hand-built calendar → the design-system date picker / `Calendar`
7. `<hr>` or border-only divs → `<Separator>`
8. `animate-pulse` placeholder divs → `<Skeleton>`
9. manually styled status spans → `<Badge>`
10. hand-built callout/notice divs → `<Alert>`
11. checkbox/switch/radio built from native inputs → the inventory equivalent

Only flag elements that have a real equivalent in the discovered inventory.

## Axis B — Improper component variant / prop usage

The higher-value half — the component is used, but its variants are bypassed:

1. component used without the right variant prop — custom classes doing what a variant (`ghost`/`secondary`/`outline`/`link`) should
2. size applied via manual classes instead of the `size` prop
3. icon-only controls missing `size="icon"` / `size="icon-sm"`
4. icons inside a component with manual `size-*`/`class` instead of the icon-slot convention (e.g. `data-icon="inline-start"`)
5. manual `class="rounded-*"` on a component that already owns its border-radius
6. color overrides defeating an intent/variant — e.g. `intent="primary" class="bg-[oklch(...)] hover:bg-[...]"`, or `intent="link" class="text-blue-800"` overriding a themeable token
7. wrong variant for the role (e.g. `outline` on an icon toggle that should be `ghost`)

Fix pattern: remove the manual class, let the variant/prop own it.

## Axis C — Componentize / add-variant

Recurring detached-style patterns. Tag each finding **C-clear** (safe to auto-apply) or **C-judgment** (debatable — recommendation only):

1. the same custom styling repeated ≥2–3 times (e.g. an "always purple" button, a repeated card-like wrapper) → propose a new variant on the existing component, or extract a component
2. a one-off component that re-implements an inventory primitive → map it onto the primitive (refactor internals, keep its public API and call-sites unchanged)
3. a custom block that duplicates a base pattern → compose from base components

**C-clear** = the target component/variant is unambiguous and the change is mechanical (e.g. map a one-off onto an existing primitive, or add a clearly-named variant + migrate every call-site). **C-judgment** = the abstraction is debatable (is this really one variant? what should it be named?) — leave for the user.

For each: report the pattern, occurrence count, call-sites, the proposed variant/component, and the C-clear/C-judgment tag. When adding a variant, edit the component's variants file and migrate all call-sites, preserving the public API.

## Axis D — Hardcoded theme-color bypass

Colors that won't follow the theme (the original dark-mode symptom):

1. inline `style=` with hardcoded `oklch()` / `rgb()` / `#hex`
2. hardcoded Tailwind palette colors (`bg-white`, `text-black`, `bg-gray-*`, `bg-slate-*`) instead of semantic tokens (`bg-background`, `text-foreground`, `bg-muted`, …)
3. `<style>` blocks with `background:`/`color:` lacking a `:global(.dark)` / dark override
4. `:not(.dark)` selectors without a matching `.dark` rule

Skip: semantically-correct hardcoded colors — `text-white` on a filled primary button, decorative/brand colors that are intentionally theme-independent.
