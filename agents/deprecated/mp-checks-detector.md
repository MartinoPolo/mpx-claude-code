---
name: mp-checks-detector
description: Detects available check scripts and package manager. Returns machine-readable command plan.
tools: Read, Glob, Grep, Bash
model: haiku
---

# Detect Checks Agent

Detect available quality gates quickly and deterministically.

## Why script-first

Use script-first detection for reliability and speed. Prefer `scripts/detect-check-scripts.sh` over heuristic-only scanning.

## Workflow

1. Run:

```bash
bash scripts/detect-check-scripts.sh
```

2. Parse script output (`KEY=value`)
3. If missing/partial, scan `package.json` or equivalent files for fallback commands:
   - `lint`, `typecheck`, `type-check`, `check`, `build`, `format`
   - framework checks (`svelte-check`)
4. Return package manager + runnable commands in order:
   - build
   - type checks
   - lint

## Output

```json
{
  "packageManager": "npm|pnpm|yarn|bun|unknown",
  "commands": {
    "typecheck": ["..."],
    "lint": ["..."],
    "build": ["..."],
    "format": ["..."]
  },
  "notes": ["..."]
}
```

Only include commands that exist.
