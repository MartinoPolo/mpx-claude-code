# Svelte 5 Review Reference

Judgment-based patterns for Svelte 5 with runes — not caught by linting.
Built from [Svelte 5 documentation](https://svelte.dev/docs).

---

## Runes Overview

Svelte 5 replaces implicit reactivity with explicit runes. All old patterns (`$:`, `export let`, `$$props`, `$$restProps`) are deprecated.

| Old (Svelte 4)             | New (Svelte 5)                      |
| -------------------------- | ----------------------------------- |
| `let count = 0` (reactive) | `let count = $state(0)`             |
| `$: doubled = count * 2`   | `let doubled = $derived(count * 2)` |
| `$: { sideEffect() }`      | `$effect(() => { sideEffect() })`   |
| `export let value`         | `let { value } = $props()`          |
| `$$props`, `$$restProps`   | `let { ...rest } = $props()`        |
| Stores with `$` prefix     | Runes for component state           |

## $state — Reactive State

```svelte
<script>
  // Basic reactive state
  let count = $state(0);

  // Deep reactivity — objects and arrays are proxied
  let todos = $state([
    { id: 1, text: 'Learn Svelte', done: false }
  ]);

  // Nested mutations trigger updates automatically
  function toggle(id) {
    const todo = todos.find(t => t.id === id);
    todo.done = !todo.done; // triggers UI update
  }

  // $state.raw — opt out of deep reactivity for large datasets
  // Must reassign entirely to trigger updates (no proxy overhead)
  let largeDataset = $state.raw(initialData);
  largeDataset = [...largeDataset, newItem]; // reassign to update

  // $state.snapshot — extract plain data for external APIs
  const snapshot = $state.snapshot(todos);
  localStorage.setItem('todos', JSON.stringify(snapshot));
</script>
```

### When to use $state.raw

- Large arrays/objects where deep proxy overhead matters
- Data passed to external libraries that don't expect proxies
- Read-heavy data that rarely changes (always update by reassignment)

## $derived — Computed Values

```svelte
<script>
  let count = $state(0);

  // Simple derivation
  let doubled = $derived(count * 2);

  // Complex multi-step computation
  let summary = $derived.by(() => {
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const tax = subtotal * 0.1;
    return { subtotal, tax, total: subtotal + tax };
  });

  // Filtered/reduced derived state
  let activeItems = $derived(items.filter(i => i.active));
</script>
```

### Key rule: $derived must be side-effect free

The expression inside `$derived()` should only compute and return a value. No mutations, no API calls, no DOM manipulation.

## $effect — Side Effects Only

```svelte
<script>
  // ❌ DON'T use $effect for derived values
  let doubled = $state(0);
  $effect(() => { doubled = count * 2; }); // extra render cycle

  // ✅ Use $derived instead
  let doubled = $derived(count * 2);

  // ✅ DO use $effect for actual side effects
  $effect(() => {
    document.title = `Count: ${count}`;
  });

  // ✅ Cleanup via return
  $effect(() => {
    const interval = setInterval(() => tick(), 1000);
    return () => clearInterval(interval);
  });
</script>
```

### When $effect is appropriate

- DOM manipulation (title, focus, scroll)
- Logging, analytics
- External subscriptions (WebSocket, EventSource)
- Synchronizing with non-Svelte APIs

### When $effect is NOT appropriate

- Computing values from state (use `$derived`)
- Updating other state based on state changes (use `$derived`)
- Event responses (use event handlers)

## $props — Component Inputs

```svelte
<script>
  // Basic props with defaults
  let { name, count = 0 } = $props();

  // Renaming (e.g., reserved words)
  let { class: className, ...rest } = $props();

  // All props without destructuring
  let props = $props();
</script>
```

## Stores vs Runes

Runes are preferred for component-level state. Stores remain useful for:

- **Cross-component shared state** — global/app-level state accessed by many unrelated components
- **Interop with existing store-based libraries**

```javascript
// Convert between stores and runes when needed
import { fromStore, toStore } from "svelte/store";

// Store → reactive object
const reactive = fromStore(existingStore);
reactive.current; // read
reactive.current = 5; // write

// Rune → store (for libraries expecting stores)
let count = $state(0);
const countStore = toStore(
  () => count,
  (v) => (count = v),
);
```

## Component Structure Ordering

Strong convention — flag deviations in review but don't block if justified. Only enforce for components with **30+ lines of script**. Same order for all component types (page components naturally skip props/types sections).

```svelte
<script lang="ts">
  // 1. Imports
  import { goto } from '$app/navigation';
  import Button from '$lib/components/Button.svelte';

  // 2. Types / Interfaces
  interface Props {
    name: string;
    count?: number;
    class?: string;
  }

  // 3. Constants (pure data, no reactive dependencies)
  const MAX_ITEMS = 50;
  const variant_styles = { primary: 'bg-blue-500', secondary: 'bg-gray-500' };

  // 4. Props
  let { name, count = 0, class: class_name }: Props = $props();

  // 5. Context (set_* and use_* calls)
  set_feature_context();
  const { items, select_item } = use_feature();

  // 6. State / Derived (including instance-computed values from props/context)
  let search = $state('');
  let filtered = $derived(items.current.filter(i => i.name.includes(search)));

  // 7. Functions (event handlers, helpers)
  function handle_click() { /* ... */ }
  const handle_input = (e: Event) => { /* ... */ };

  // 8. Effects & Lifecycle (side-effect wiring)
  $effect(() => { document.title = `${name} (${count})`; });
  onMount(() => { /* client-only setup */ });
</script>

<!-- 9. Template markup -->
```

### Key distinctions

- **Constants vs instance-computed values**: `const LIMIT = 50` is a constant (section 3). `const input_id = props.id ?? props.name` depends on reactive inputs — goes in section 6.
- **Page components**: Typically skip Types/Props sections, lean on context setup. Same order otherwise.
- **`onMount`/`onDestroy`**: Group with `$effect` in section 8 — same purpose (wiring side effects). Prefer `$effect` over `onMount` where possible.

## Common Review Patterns

### Check for Svelte 4 patterns in Svelte 5 code

- `$:` reactive declarations → should be `$derived()`
- `export let` → should be `$props()`
- `$$props` / `$$restProps` → should be `$props()` with rest
- Manual store subscriptions → consider runes
- `onMount`/`onDestroy` for side effects → consider `$effect`

### Performance considerations

- Large arrays/objects with frequent reads but rare writes → `$state.raw()`
- Expensive computations → `$derived.by()` (auto-memoized)
- Multiple independent reactive values → separate `$state()` calls, not one big object
