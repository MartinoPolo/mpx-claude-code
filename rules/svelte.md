---
paths:
  - "**/*.svelte"
  - "**/*.svelte.ts"
  - "**/*.svelte.js"
---

# Svelte 5

- Use Svelte 5 runes exclusively. Never use legacy Svelte 4 patterns like `$:` reactive declarations, `export let` for props, `$$props`, `$$restProps`, or writable stores for component-level state.
- When a value can be computed from other reactive state, use `$derived()` instead of writing a `$effect()` that sets another `$state` variable. Effects that exist only to synchronize state cause unnecessary render cycles.
- Reserve `$effect()` strictly for side effects that interact with the outside world: DOM manipulation, logging, analytics, WebSocket subscriptions, or synchronizing with non-Svelte APIs. Always return a cleanup function from effects that create subscriptions or timers.
- Use `$state.raw()` instead of `$state()` for large arrays or objects that are read frequently but updated rarely. Raw state skips deep proxy wrapping, but requires full reassignment to trigger updates (mutations won't be detected).
- Use `$state.snapshot()` to extract a plain JavaScript object from reactive state before passing it to external APIs like `localStorage.setItem()`, `JSON.stringify()`, or `fetch` request bodies that don't understand Svelte proxies.
- Use `$derived.by()` when the derived computation requires multiple steps or intermediate variables. It is automatically memoized and only re-evaluates when its dependencies change.
- In components with 30 or more lines of script, follow this ordering: imports, then type definitions, then constants, then `$props()`, then context calls, then `$state`/`$derived` declarations, then functions and event handlers, then `$effect` and lifecycle hooks.
- Use `{#snippet}` blocks instead of slots for reusable template fragments. Use `{@render}` instead of `<svelte:component>` for dynamic component rendering.
- Svelte stores are still appropriate for cross-component shared state that many unrelated components access, and for interoperating with store-based libraries. Use `fromStore()` and `toStore()` from `svelte/store` to convert between stores and runes when needed.
