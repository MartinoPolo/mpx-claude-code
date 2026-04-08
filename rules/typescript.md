---
paths:
  - "**/*.ts"
  - "**/*.tsx"
applyTo: "**/*.ts,**/*.tsx"
---

# TypeScript

- Use type guards (`Array.isArray()`, `in` operator, discriminated union checks) to narrow types at runtime instead of `as` type assertions. Assertions bypass the type checker and can hide bugs; guards prove the type is correct.
- Use `as const` to narrow object literals and arrays to their literal types instead of wide types like `string` or `number`. Use discriminated unions (a shared literal field like `type` or `status`) to model states where only certain field combinations are valid, making invalid states unrepresentable.
- Constrain generic type parameters with `extends` to ensure the generic has the required shape. For property access patterns, use `<T, K extends keyof T>` so the compiler can verify the key exists on the object.
- Use the built-in utility types (`Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`) instead of writing custom mapped types that replicate the same behavior.
- Use `Promise.allSettled()` instead of `Promise.all()` when you want all promises to complete regardless of individual failures. `Promise.all` rejects immediately on the first failure and discards the results of the other promises.
- Use `AbortController` to make fetch requests cancellable. Pass the controller's signal to `fetch()` and call `controller.abort()` in cleanup functions (effect teardowns, component unmounts) to prevent stale responses from overwriting newer data.
- Mark function parameters as `readonly` when the function should not mutate the input. When you need to sort or reverse an array without mutating the original, spread-copy it first (`[...array].sort()`) because `.sort()` and `.reverse()` mutate in place.

## Constants & String Literals

- Never scatter raw string or numeric literals as discriminators, statuses, roles, modes, or action types. Extract them into a single-source-of-truth constant and reference it everywhere. Duplicated magic values invite typos that compile silently but fail at runtime.
- Prefer `as const` objects over TypeScript `enum` for defining constant groups. `as const` objects are plain JavaScript (better tree-shaking, no reverse-mapping bloat, compatible with `--isolatedModules`). Use `enum` only when the project already has an established enum convention.
- Before introducing a new string literal, search the codebase for an existing constant, enum, or `as const` object that already defines it. Reuse the existing definition instead of creating a duplicate.
- Derive TypeScript types from `as const` objects (`type X = (typeof OBJ)[keyof typeof OBJ]`) so the type and the runtime values stay in sync automatically.
- Use `satisfies Record<UnionType, ...>` on mapping/handler objects to get compile-time proof that every variant is covered. This is preferred over `switch` when mapping a union to values or callbacks.
- When a `switch` is unavoidable, handle every variant explicitly and add a `default: never` exhaustiveness guard so the compiler errors if a new variant is added but not handled.
