---
name: mp-script-discovery
description: 'Discover runnable scripts across package.json files and identify frontend/backend/database run commands. Use when: "find scripts", "how to run app", "detect dev server"'
argument-hint: "[project-dir]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(bash $HOME/.claude/skills/mp-script-discovery/scripts/detect-project-scripts.sh*), Bash(cat *), Bash(node *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: utility
---

# Script Discovery

Wrap `$HOME/.claude/skills/mp-script-discovery/scripts/detect-project-scripts.sh`. Use this skill when agents need a reliable fallback reference for script discovery behavior.

## Goal

- Detect package manager
- Enumerate runnable scripts from root package by default
- Optionally scan nested packages in recursive mode
- Optionally filter by category
- Return concise command recommendations

## Detector Contract

Script path:

```bash
SCRIPT_DETECTOR="$HOME/.claude/skills/mp-script-discovery/scripts/detect-project-scripts.sh"
bash "$SCRIPT_DETECTOR"
```

Usage:

```bash
bash "$SCRIPT_DETECTOR" [project_dir] [--recursive|-r] [--category|-c <name>] [--json]
```

Category options:

- `frontend`
- `backend`
- `database`
- `build`
- `typecheck`
- `lint`
- `test`
- `other`

Behavior:

- Default (no flags): root `package.json` scripts only, concise text lines
- `--recursive`: scans nested `package.json` files and prints package headers with category groups
- `--category`: filters scripts to one category in either default or recursive mode
- `--json`: returns machine-readable JSON with package/script metadata

## Step 1: Run detector (default wrapper mode)

```bash
bash "$SCRIPT_DETECTOR" ${ARGUMENTS:-.}
```

Default output format:

- `<packageManager> <scriptName> (<scriptCommand>) [:port]`

If detector returns an error line, report it and stop.

## Step 1a: Optional detector modes

Recursive scan:

```bash
bash "$SCRIPT_DETECTOR" ${ARGUMENTS:-.} --recursive
```

Category filtered scan:

```bash
bash "$SCRIPT_DETECTOR" ${ARGUMENTS:-.} --category frontend
```

JSON scan (automation/debugging):

```bash
bash "$SCRIPT_DETECTOR" ${ARGUMENTS:-.} --recursive --json
```

## Example Outputs

Default, no flags:

```text
yarn build (turbo run build)
yarn dev (turbo run dev)
yarn lint (turbo run lint)
```

With category filter:

```text
yarn dev (turbo run dev)
yarn frontend (yarn turbo run start:dev --filter=@atc/frontend)
```

Recursive with package headers:

```text
[apps/frontend] @atc/frontend
  frontend:
    yarn dev (vite --port 3000 --strictPort || vite --port 3010) :3000
```

JSON mode (truncated):

```json
{
  "packageManager": "yarn",
  "recursive": true,
  "categoryFilter": "frontend",
  "packages": [
    {
      "packagePath": "apps/frontend",
      "scripts": [
        {
          "name": "dev",
          "command": "vite --port 3000",
          "category": "frontend",
          "port": 3000
        }
      ]
    }
  ]
}
```

## Step 2: Rank preferred run commands

For each category, prefer scripts in this order:

- Frontend: `dev`, `start`, `preview`, `dev:web`, `dev:client`
- Backend: `dev:api`, `dev:server`, `start:api`, `start:server`, `dev`, `start`
- Database: `db:migrate`, `migrate`, `prisma:migrate`, `db:seed`, `seed`

Favor root package commands when equivalent.

## Step 3: Return concise plan

Return this structure:

```json
{
  "packageManager": "npm|pnpm|yarn|bun|unknown",
  "frontend": {
    "recommended": {
      "cwd": "...",
      "script": "...",
      "command": "...",
      "port": 3000
    },
    "alternatives": []
  },
  "backend": {
    "recommended": { "cwd": "...", "script": "...", "command": "..." },
    "alternatives": []
  },
  "database": {
    "recommended": { "cwd": "...", "script": "...", "command": "..." },
    "alternatives": []
  },
  "notes": []
}
```

## Rules

- Do not start servers automatically in this skill
- Do not mutate files
- Keep output deterministic
- Prefer default detector mode first; use `--recursive`, `--category`, or `--json` only when task requires them
- If no frontend script exists, return `frontend.recommended=null`
