---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
---

# SolidJS

- Signals are getters: `count()` not `count`. Never destructure props (kills reactivity)
- `createMemo` for derived values. `createEffect` only for side effects (DOM, logging, external sync)
- Props: access via `props.name` (reactive) or use `mergeProps`/`splitProps`. Never `const { x } = props`
- `<Show>` over ternary for conditional rendering. `<For>` over `.map()` for lists (keyed by reference)
- `<Suspense>` + `<ErrorBoundary>` for async. Resources via `createResource`
- No virtual DOM — components run once. Don't rely on re-render patterns from React
- `batch()` to group multiple signal updates into one flush
- `onCleanup()` inside `createEffect` for teardown (subscriptions, timers)
- `createStore` for nested reactive objects. `produce` for immer-style mutations
- `lazy()` for code-split components. `<Suspense>` required as parent
