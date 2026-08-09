---
paths:
  - "**/*.svelte"
  - "**/*.svelte.ts"
  - "**/*.svelte.js"
  - "**/src/routes/**/*.ts"
applyTo: "**/*.svelte,**/*.svelte.ts,**/*.svelte.js,**/src/routes/**/*.ts"
---

# SvelteKit Type-Safe Paths (≥ 2.26)

Use the type-safe path helpers from `$app/paths` instead of manual string concatenation or deprecated exports. Server-side usage (redirects, hooks, `match()`) is covered by the separate `sveltekit-paths-server.md` rule — link it only in projects with a SvelteKit server runtime.

## `resolve` — type-safe route navigation

Use `resolve()` instead of `base` for all internal links and programmatic navigation. It validates route IDs against your actual routes at the type level and handles base-path prefixing automatically.

```svelte
<!-- ✅ Type-safe — route ID validated, params type-checked -->
<a href={resolve('/blog/[slug]', { slug: post.slug })}>Read more</a>

<!-- ✅ Plain pathname — also valid, gets base-path prefixed -->
<a href={resolve('/about')}>About</a>

<!-- ❌ AVOID — no validation, base path not applied -->
<a href="/blog/{post.slug}">Read more</a>
<a href="{base}/about">About</a>
```

In `.ts` files (universal load functions, client-side navigation):

```ts
import { resolve } from "$app/paths";
import { goto } from "$app/navigation";

await goto(resolve("/blog/[slug]", { slug }));
```

## `asset` — type-safe static file references

Use `asset()` instead of `assets` for files in the `/static/` directory. It provides autocomplete for available files and handles the assets path prefix.

```svelte
<!-- ✅ Type-safe — validates file exists in /static/ -->
<img alt="logo" src={asset('/logo.png')} />

<!-- ❌ AVOID — no validation -->
<img alt="logo" src="/logo.png" />
<img alt="logo" src="{assets}/logo.png" />
```

> **Note:** Files imported from `$lib/assets/` via Vite (e.g. `import logo from '$lib/assets/logo.svg'`) are processed by the bundler and do NOT need `asset()`. Use `asset()` only for files served from `/static/`.
