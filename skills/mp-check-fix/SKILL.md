---
name: mp-check-fix
description: "Deterministically detect and run check scripts, then fix failures (CHECK_ALL first; fallback to typecheck/lint/format/build)."
disable-model-invocation: true
compatibility: Requires package.json scripts for check:all/check-all or typecheck/lint/format/build
allowed-tools: Bash(bash *detect-check-scripts*), Bash(*run build*), Bash(*run check*), Bash(*run check:all*), Bash(*run check-all*), Bash(*run typecheck*), Bash(*run type-check*), Bash(*run tsc*), Bash(*run check:types*), Bash(*run lint*), Bash(*run eslint*), Bash(*run lint:check*), Bash(*run lint:css*), Bash(*run format*), Bash(*run fmt*), Bash(*run format:check*), Bash(*run prettier*), Bash(cd * && *run build*), Bash(cd * && *run check*), Bash(cd * && *run check:all*), Bash(cd * && *run check-all*), Bash(cd * && *run typecheck*), Bash(cd * && *run type-check*), Bash(cd * && *run tsc*), Bash(cd * && *run check:types*), Bash(cd * && *run lint*), Bash(cd * && *run eslint*), Bash(cd * && *run lint:check*), Bash(cd * && *run lint:css*), Bash(cd * && *run format*), Bash(cd * && *run fmt*), Bash(cd * && *run format:check*), Bash(cd * && *run prettier*), Read, Edit, Glob, Grep, Bash(yarn *), Bash(npm *), Bash(pnpm *), Bash(bun *)
metadata:
  author: MartinoPolo
  version: "0.3"
  category: code-review
---

# Check & Fix

Deterministic check execution and fix loop based on `detect-check-scripts.sh`.

This skill accepts no arguments. Ignore argument-based filtering and follow detector output only.

## Step 1: Detect Available Checks

```bash
bash $HOME/.claude/scripts/detect-check-scripts.sh
```

Handle all outputs explicitly:

- `NO_PROJECT=true`: report "No package.json found" and stop.
- `PM_UNKNOWN=true`: ask user which package manager to use (`npm`, `pnpm`, `yarn`, `bun`), then re-run:

```bash
bash $HOME/.claude/scripts/detect-check-scripts.sh . <chosen_pm>
```

- `PM=<pm>`: continue with detected scripts.
- `MONOREPO=true`: expect package-prefixed keys too (for example `packages_ui_CHECK_ALL=...`).

Possible script keys per scope (root or prefixed package):

- `<prefix>CHECK_ALL`, `<prefix>CHECK_ALL_DIR`
- `<prefix>TYPECHECK`, `<prefix>TYPECHECK_DIR`
- `<prefix>LINT`, `<prefix>LINT_DIR`
- `<prefix>FORMAT`, `<prefix>FORMAT_DIR`
- `<prefix>BUILD`, `<prefix>BUILD_DIR`

If no runnable script keys are present after `PM=...`, report "No scripts detected" and stop.

## Step 2: Build Run Plan (No Arguments)

Per scope:

- If `CHECK_ALL` exists: run `CHECK_ALL`, then `BUILD` (if present).
- If `CHECK_ALL` does not exist: run detected `TYPECHECK`, `LINT`, `FORMAT`, then `BUILD`.

Never filter checks by user arguments. The detector output fully determines what runs.

## Step 3: Run Checks

Run planned commands in deterministic order.

- `CHECK_ALL` mode: `CHECK_ALL` -> `BUILD`
- Individual mode: `TYPECHECK` -> `LINT` -> `FORMAT` -> `BUILD`

For monorepo keys, run from `*_DIR`:

```bash
cd <DIR> && <COMMAND>
```

Run sequentially. Stop at first failing command, fix it, then continue.

## Step 4: Fix Errors

If a check fails:

1. Parse failing files and diagnostics from command output.
2. Read relevant files and identify root cause.
3. TDD-first when practical:

- If there is a clear behavioral bug and test setup exists, add/update a focused failing test first (red).
- Implement minimal fix (green).
- Refactor only if needed.

4. Re-run the failed command.

Repeat up to **3 iterations** per failed command. If still failing, mark as `Failed` and continue.

## Step 5: Continue Remaining Checks

Continue through remaining planned commands. Each command has its own 3-iteration fix budget.

## Step 6: Report Results

Summarize status for each attempted command/scope:

- `Passed`: passed immediately
- `Fixed`: failed initially, passed after fixes
- `Failed`: still failing after 3 iterations
- `Skipped`: not detected for that scope or superseded by `CHECK_ALL`

Report in execution order. Include scope (`root` or package prefix) and command used.

Recommended table:

```
Scope | Command | Status | Notes
```

## Troubleshooting

| Problem                            | Action                                                             |
| ---------------------------------- | ------------------------------------------------------------------ |
| `NO_PROJECT=true`                  | Run from a folder containing `package.json`                        |
| `PM_UNKNOWN=true`                  | Ask user for package manager and re-run detector with arg 2        |
| `PM=...` but no script keys        | Report "No scripts detected" and stop                              |
| Prefix keys present (`apps_api_*`) | Treat each prefix as its own scope; run with corresponding `*_DIR` |

## Rules

- Fix underlying issues rather than suppressing (`@ts-ignore`, `eslint-disable`)
- Keep tests truthful; do not weaken assertions to force a pass
- If a fix needs architectural changes outside check-fix scope, report a blocker
- For monorepos, report failing scopes explicitly
