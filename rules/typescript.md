---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript

- Use type guards (`Array.isArray()`, `in` operator, discriminated union checks) to narrow types at runtime instead of `as` type assertions. Assertions bypass the type checker and can hide bugs; guards prove the type is correct.
- Use `as const` to narrow object literals and arrays to their literal types instead of wide types like `string` or `number`. Use discriminated unions (a shared literal field like `type` or `status`) to model states where only certain field combinations are valid, making invalid states unrepresentable.
- Constrain generic type parameters with `extends` to ensure the generic has the required shape. For property access patterns, use `<T, K extends keyof T>` so the compiler can verify the key exists on the object.
- Use the built-in utility types (`Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`) instead of writing custom mapped types that replicate the same behavior.
- Use `Promise.allSettled()` instead of `Promise.all()` when you want all promises to complete regardless of individual failures. `Promise.all` rejects immediately on the first failure and discards the results of the other promises.
- Use `AbortController` to make fetch requests cancellable. Pass the controller's signal to `fetch()` and call `controller.abort()` in cleanup functions (effect teardowns, component unmounts) to prevent stale responses from overwriting newer data.
- Mark function parameters as `readonly` when the function should not mutate the input. When you need to sort or reverse an array without mutating the original, spread-copy it first (`[...array].sort()`) because `.sort()` and `.reverse()` mutate in place.
