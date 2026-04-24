---
paths:
  - "**/*.svelte"
  - "**/*.svelte.ts"
  - "**/*.svelte.js"
applyTo: "**/*.svelte,**/*.svelte.ts,**/*.svelte.js"
---

# Svelte 5

- Use Svelte 5 runes for reactivity (`$state`, `$derived`, `$props`, `$effect`).
- Use `onMount` for fire-once setup (data fetching, third-party library init) that should never re-run.
- When a value can be computed from other reactive state, use `$derived()` instead of writing a `$effect()` that sets another `$state` variable. Effects that exist only to synchronize state cause unnecessary render cycles.
- Reserve `$effect()` strictly for side effects that interact with the outside world: DOM manipulation, logging, analytics, WebSocket subscriptions, or synchronizing with non-Svelte APIs. Always return a cleanup function from effects that create subscriptions or timers.
- Never pass an async function directly to `$effect()` — it does not support async (the return value is reserved for cleanup). Wrap async calls with `void asyncFn()` or an IIFE instead. `onMount` supports async functions directly.
- Use `$state.raw()` instead of `$state()` for large arrays or objects that are read frequently but updated rarely. Raw state skips deep proxy wrapping, but requires full reassignment to trigger updates (mutations won't be detected).
- Use `$state.snapshot()` to extract a plain JavaScript object from reactive state before passing it to external APIs like `localStorage.setItem()`, `JSON.stringify()`, or `fetch` request bodies that don't understand Svelte proxies.
- Use `$derived.by()` when the derived computation requires multiple steps or intermediate variables. It is automatically memoized and only re-evaluates when its dependencies change.
- In components with 30 or more lines of script, follow this ordering:

1. imports
2. type definitions
3. constants
4. `$props()`
5. context calls
6. `$state`/`$derived` declarations
7. functions and event handlers
8. `$effect` and lifecycle hooks
9. render logic

- Use `{#snippet}` blocks instead of slots for reusable template fragments. Use `{@render}` instead of `<svelte:component>` for dynamic component rendering.

## State Management

- Use Svelte's `createContext` (5.40+) for shared state across component trees. Avoid global stores or module-level singletons when context can scope state to a subtree.
- Each context file exports `set*Context()` (provider) and `use*()` (consumer), both generated from `createContext<T>()`. The private `create*` factory function is not exported.
- Before using raw runes in context factories, search the codebase for existing reactivity wrapper classes (e.g. `StateRaw`, `Derived`, `Persisted`, `ReadonlyState`, `ProtectedState`). These are typically located in `src/lib/reactivity/`. If they exist, prefer them over raw runes — they provide equality checks, transforms, read-only wrappers, and persistence out of the box.
- Build context state inside a `create*` factory function, then pass it to the setter from `createContext`. Use reactivity classes when available; fall back to raw runes only if the project does not have them.
- Export the context shape as `type <Feature>Context = ReturnType<typeof create*>` so consumers get full type safety without duplicating the type.
- Name context files `<feature>.context.svelte.ts`.
- Context file ordering: imports → type alias + `createContext` destructuring → `set*Context()` → `create*` factory last (so the factory's `return` is the final thing in the file).
- For persistent state that survives page reloads, use a `Persisted` class if available; otherwise store values in `localStorage` with a serializer/deserializer and listen to `storage` events for cross-tab synchronization.
- Wrap mutable state in a read-only accessor (e.g. `ReadonlyState` or `ProtectedState` if available, or a manual getter) when exposing it to consumers that should not mutate it directly.
- When one context depends on another, either pass the dependency as a parameter to `create*`, or call `use*()` inside the factory (valid when both providers are set in the same layout).
