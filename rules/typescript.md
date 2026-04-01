---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript

- Type guards over `as` assertions. Use `Array.isArray`, `in` operator, discriminated unions
- `as const` for literal types. Discriminated unions to make invalid states unrepresentable
- Use `keyof` constraints on generics: `<T, K extends keyof T>`
- Use built-in utility types (`Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`) — don't reinvent
- `Promise.allSettled` over `Promise.all` when partial failure is acceptable
- AbortController for cancellable fetch. Clean up in effect returns
- `readonly` params to prevent mutation. Spread-copy before `.sort()`, `.reverse()`
