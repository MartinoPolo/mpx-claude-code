---
paths:
  - "**/*.svelte"
  - "**/*.svelte.ts"
  - "**/*.svelte.js"
  - "**/*.context.**"
applyTo: "**/*.svelte,**/*.svelte.ts,**/*.svelte.js, **/*.context.**"
---

Use the **reactivity classes** in `src/lib/reactivity/` with Svelte's **Context API** for shared state. Never use raw Svelte stores (`writable`, `readable`) — use these classes instead.

## Reactivity Classes (`src/lib/reactivity/`)

| Class               | Backed by            | Use case                                                                          |
| ------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `StateRaw<T>`       | `$state.raw()`       | Mutable reactive state. Supports custom equality checks and value transforms.     |
| `Derived<T>`        | `$derived.by()`      | Computed reactive value. Supports mutable override.                               |
| `Persisted<T>`      | `localStorage`       | Persistent state with cross-tab sync via `storage` events. Requires a `Serde<T>`. |
| `ReadonlyState<T>`  | wraps `MutableState` | Read-only accessor. Created via `state.readonly()`.                               |
| `ProtectedState<T>` | wraps `MutableState` | Read-only with escape hatch `set_unprotected()`. Created via `state.protected()`. |

## Context Pattern

Every context uses `createContext` (Svelte 5.40+) with a **set / use** convention:

```ts
// src/lib/feature/my_feature.context.svelte.ts
import { createContext } from "svelte";
import { StateRaw } from "$lib/reactivity/state.svelte";
import { Derived } from "$lib/reactivity/derived.svelte";

// 1. Type + createContext destructuring
type MyFeatureContext = ReturnType<typeof createMyFeatureContext>;

const [useMyFeature, setMyFeatureInternal] = createContext<MyFeatureContext>();
export { useMyFeature };

// 2. set function
export function setMyFeatureContext() {
  const ctx = createMyFeatureContext();
  setMyFeatureInternal(ctx);
  return ctx;
}

// 3. Factory last — return is the last thing in the file
function createMyFeatureContext() {
  const count = new StateRaw(0);
  const doubled = new Derived(() => count.current * 2);
  return { count, doubled };
}
```

## Rules

1. `set*Context()` — factory+provider, call once in a parent component to provide the context.
2. `use*()` — consumer getter, call in any descendant to consume the context.
3. Both generated from `createContext<T>()` + factory wrapper — no manual keys needed.
4. Compose state from `StateRaw`, `Derived`, `Persisted` inside the `create*` factory function.
5. `type <Feature>Context = ReturnType<typeof create*>`.
6. Files named `<feature>.context.svelte.ts`.
7. File ordering: imports → type alias + `createContext` destructuring → `set*Context()` → `create*` factory (last, so the return is the final thing in the file).

## Persisted State Example

```ts
import { Persisted, jsonSerde } from "$lib/reactivity/persisted.svelte";

function isTheme(value: unknown): value is "dark" | "light" | "system" {
  return (
    typeof value === "string" && ["dark", "light", "system"].includes(value)
  );
}

const theme = new Persisted({
  key: "theme",
  serde: jsonSerde(isTheme),
  defaultValue: "system" as const,
});
```
