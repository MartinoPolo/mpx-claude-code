---
paths:
  - "vite.config.*"
  - "**/+page.svelte"
  - "**/+layout.svelte"
applyTo: "vite.config.*,**/+page.svelte,**/+layout.svelte"
---

# SvelteKit Dev Warmup

When creating a new **primary nav route** (top-level pages reachable from main navigation), add it to both warmup lists:

1. `server.warmup.clientFiles` in `vite.config.ts`
2. `preloadCode()` call in the root `+layout.svelte`

Do NOT add sub-routes, modals, API routes, or rarely-visited pages. Only warm up the 5-10 most frequently navigated routes — each entry adds startup cost (Vite pre-transforms the full dependency tree) and a network fetch on first page load.
