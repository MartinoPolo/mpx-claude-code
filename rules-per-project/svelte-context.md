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

## Context Pattern (`src/lib/context/`)

Every context follows the **set / use** convention:

```ts
// src/lib/context/my_feature.context.svelte.ts
import { getContext, setContext } from "svelte";
import { CONTEXT_KEYS } from "./context_key";
import { StateRaw } from "$lib/reactivity/state.svelte";
import { Derived } from "$lib/reactivity/derived.svelte";

function create_my_feature_context() {
  const count = new StateRaw(0);
  const doubled = new Derived(() => count.current * 2);
  return { count, doubled };
}

type MyFeatureContext = ReturnType<typeof create_my_feature_context>;

export function set_my_feature_context() {
  const context = create_my_feature_context();
  setContext(CONTEXT_KEYS.my_feature, context);
  return context;
}

export function use_my_feature() {
  return getContext<MyFeatureContext>(CONTEXT_KEYS.my_feature);
}
```

## Rules

1. **`set_*`** — call once in a parent layout/component to provide the context.
2. **`use_*`** — call in any descendant to consume the context.
3. Register all context keys in `src/lib/context/context_key.ts`.
4. Compose state from `StateRaw`, `Derived`, `Persisted` inside the `create_*` factory function.
5. Name context files `<feature>.context.svelte.ts`.
6. Export the return type as `type <Feature>Context = ReturnType<typeof create_*>`.

## Persisted State Example

```ts
import { Persisted, json_serde } from "$lib/reactivity/persisted.svelte";

function is_theme(value: unknown): value is "dark" | "light" | "system" {
  return (
    typeof value === "string" && ["dark", "light", "system"].includes(value)
  );
}

const theme = new Persisted({
  key: "theme",
  serde: json_serde(is_theme),
  default_value: "system" as const,
});
```

## Reference: Dark Mode

Dark mode uses `mode-watcher` (shadcn-svelte recommended). No Svelte context needed.

- `<ModeWatcher />` in `src/routes/+layout.svelte`
- Toggle: `src/lib/components/DarkModeToggle.svelte` (uses `mode`, `setMode` from `mode-watcher`)

## Reference: Showcase Form (example context using all reactivity classes)

- Context: `src/lib/context/showcase_form.context.svelte.ts`
- Set in: `src/routes/+layout.svelte`
- Consumed by: `src/routes/+page.svelte`
- Uses: `Persisted` (selects), `StateRaw` (checkboxes), `Derived` (selection count)
