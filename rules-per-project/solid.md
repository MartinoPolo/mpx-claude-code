---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
applyTo: "**/*.tsx,**/*.jsx"
---

# SolidJS

- Signals are accessor functions that must be called to read their value: write `count()`, not `count`. Forgetting the parentheses reads the signal itself (a function reference) instead of its current value.
- Never destructure props in a component's parameter list (`const { x } = props`), because this reads the prop values once at call time and breaks reactivity. Access props as `props.name` to keep them reactive, or use `mergeProps()` to set defaults and `splitProps()` to separate groups of props.
- Use `createMemo()` to derive computed values from signals. Use `createEffect()` only for side effects that interact with the outside world (DOM manipulation, logging, network requests, subscriptions). Register teardown logic inside effects with `onCleanup()` to clear timers and unsubscribe from events.
- Use the `<Show when={condition}>` component instead of ternary expressions for conditional rendering, and `<For each={list}>` instead of `.map()` for rendering lists. `<For>` keys items by reference for efficient updates.
- Wrap async data loading in `createResource()` and place the consuming component inside `<Suspense>` with an `<ErrorBoundary>` parent to handle loading and error states.
- Solid has no virtual DOM and does not re-render components. Component functions execute exactly once to set up the reactive graph. Do not rely on patterns from React where the component function re-runs on every state change.
- When updating multiple signals that should cause a single UI update, wrap the mutations in `batch()` to prevent intermediate renders.
- Use `createStore()` instead of `createSignal()` for nested reactive objects that need fine-grained updates on individual properties. Use `produce()` from `solid-js/store` for immer-style immutable update syntax on stores.
- Use `lazy()` to code-split components into separate bundles that load on demand. Lazy components must be rendered inside a `<Suspense>` boundary that shows a fallback while the component code is loading.
