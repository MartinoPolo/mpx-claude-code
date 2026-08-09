---
paths:
  - "**/src/routes/**/*.ts"
  - "**/src/hooks*.ts"
applyTo: "**/src/routes/**/*.ts,**/src/hooks*.ts"
---

# SvelteKit Type-Safe Paths — Server & Runtime Matching

Supplements `sveltekit-paths.md` for projects with a SvelteKit server runtime (SSR, server load functions, API routes, hooks). Do not link this rule in `adapter-static` SPA projects — they have no server at runtime.

## `resolve` in server code

```ts
import { resolve } from "$app/paths";
import { redirect } from "@sveltejs/kit";

// ✅ Server-side redirect with type-safe route
throw redirect(303, resolve("/dashboard"));

// ✅ Dynamic route in load function
const url = resolve("/blog/[slug]", { slug });
```

## `match` — runtime route matching (≥ 2.52)

Use `match()` to identify which route a URL corresponds to and extract its parameters:

```ts
import { match } from "$app/paths";

const route = await match("/blog/hello-world");
if (route?.id === "/blog/[slug]") {
  const { slug } = route.params;
}
```
