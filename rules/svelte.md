---
paths:
  - "**/*.svelte"
  - "**/*.svelte.ts"
  - "**/*.svelte.js"
---

# Svelte 5

- Runes only: `$state`, `$derived`, `$effect`, `$props`. No legacy `$:`, `export let`, stores for component state
- Derive don't sync: `$derived()` over `$effect()` that sets state
- `$effect` only for side effects: DOM, logging, subscriptions, external APIs. Always return cleanup
- `$state.raw()` for large read-only datasets (skips proxy overhead, requires reassignment to update)
- `$state.snapshot()` to extract plain data for external APIs (localStorage, fetch body)
- `$derived.by()` for multi-step computations (auto-memoized)
- Component script order (30+ lines): imports → types → constants → props → context → state/derived → functions → effects
- `{#snippet}` over slot, `{@render}` over `<svelte:component>`
- Stores still valid for cross-component shared state and library interop; use `fromStore`/`toStore` for conversion
