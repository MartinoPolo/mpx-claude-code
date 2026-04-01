---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
---

# React

- `useMemo`/`$derived` for derived state. Never `useEffect` to sync state from props
- `useEffect` only for: subscriptions, DOM manipulation, external sync. Always clean up (AbortController, clearInterval)
- Event logic belongs in event handlers, not effects
- `useMemo`/`useCallback` only when passing to `React.memo` children. Don't memoize constants
- Define components outside other components. Stable references for memoized component props
- ErrorBoundary wraps Suspense. Independent Suspense boundaries for streaming
- Server Components: no hooks. Push `'use client'` to leaf components, not layouts
- React 19: `useActionState` for form state, `useFormStatus` inside form children, `useOptimistic` for instant feedback
- TanStack Query: `queryOptions()` for DRY query defs. Set meaningful `staleTime`. Include all params in `queryKey`
