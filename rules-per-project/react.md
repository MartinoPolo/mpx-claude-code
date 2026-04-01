---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
---

# React

- When a value can be computed from props or other state, compute it inline or with `useMemo()`. Never use `useEffect` to watch a value and set another state variable, because this causes an extra render cycle for no benefit.
- Reserve `useEffect` strictly for synchronizing with external systems: browser API subscriptions, DOM manipulation, WebSocket connections, or third-party library integration. Always return a cleanup function that cancels pending requests (AbortController), clears timers (clearInterval), or unsubscribes from events.
- Logic that should run in response to a user action belongs in the event handler for that action, not in a `useEffect` that watches state the event handler sets. Effects are for synchronization, not for responding to events.
- Only wrap values in `useMemo` or functions in `useCallback` when they are passed as props to a child component wrapped in `React.memo`. Memoizing constants, inline objects, or callbacks that are only used locally adds overhead without preventing any re-renders.
- Never define a component function inside another component function, because React creates a new component instance on every render which destroys and recreates the entire subtree. Define all components at module scope.
- Always wrap `<Suspense>` boundaries inside an `<ErrorBoundary>` so that errors in suspended children are caught gracefully. Use separate, independent `<Suspense>` boundaries for unrelated content sections so they can stream independently.
- Server Components cannot use hooks, browser APIs, or event handlers. Keep `'use client'` directives on the smallest leaf components that need interactivity, not on layouts or pages, because marking a parent as client turns the entire subtree into client components.
- In React 19, use `useActionState` to unify form submission state (pending, error, data) instead of managing separate `useState` calls. Use `useFormStatus` only inside child components rendered within a `<form>` (it cannot read form state from the same component that renders the form). Use `useOptimistic` to show instant UI feedback while an async action is in flight.
- When using TanStack Query, define query configurations with `queryOptions()` and reuse them across components, prefetches, and cache reads. Always set a meaningful `staleTime` (default is 0, which refetches on every mount). Include every variable that affects the query result in the `queryKey` array so cache entries don't go stale.
