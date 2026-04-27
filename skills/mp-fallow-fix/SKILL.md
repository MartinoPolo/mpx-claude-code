---
name: mp-fallow-fix
description: "Diagnose and fix fallow dead-code or audit failures. Use when: fallow check fails, dead-code regression detected, unused exports/types found, or agent needs to suppress/baseline fallow findings. Also use when working with code quality suppressions (@public, fallow-ignore)."
allowed-tools: Read, Edit, Glob, Grep, Bash(*fallow*), Bash(pnpm *fallow*), Bash(git diff*), Bash(git log*)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: code-quality
---

# Fallow Fix

Diagnose and resolve fallow code-quality failures. $ARGUMENTS

## Step 1: Identify the Failure

Run the appropriate diagnostic command based on what failed:

- **Dead-code regression** (`check:fallow` failed): output already shows all issues with file:line and rule explanations
- **Audit failure** (fallow-gate hook blocked commit/push): `pnpm fallow:audit` for JSON details
- **Need more detail**: re-run `pnpm check:fallow` — `--explain` includes rule descriptions and docs URLs

Parse the JSON output. Each issue has `path`, `line`, `name`, `severity`, and `actions`.

## Step 2: Categorize Each Issue

For each issue, determine the correct action:

### Fix (default — remove the dead code)

- Unused file → delete it
- Unused export → remove the `export` keyword or delete the declaration
- Unused dependency → `pnpm remove <package>`
- Stale suppression → remove the `// fallow-ignore-*` comment

### Suppress (only when the code is intentionally unused)

| Situation                                         | Suppression                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Public API export consumed by external packages   | `/** @public */` above the export                                            |
| Intentionally pre-exported for planned use        | `/** @expected-unused */` above the export (becomes stale warning when used) |
| Framework lifecycle method (mount, destroy, etc.) | `// fallow-ignore-next-line unused-class-member`                             |
| Interface implementation method                   | `// fallow-ignore-next-line unused-class-member`                             |
| High-complexity function that can't be split now  | `// fallow-ignore-next-line complexity`                                      |
| Entire generated file                             | `// fallow-ignore-file` at top                                               |

**Never** use blanket `// fallow-ignore-next-line` without specifying the kind.

### Available suppression kinds

`unused-export`, `unused-type`, `unused-class-member`, `unused-enum-member`, `unresolved-import`, `unlisted-dependency`, `duplicate-export`, `circular-dependency`, `complexity`, `code-duplication`, `coverage-gaps`

## Step 3: Apply Fixes

1. Fix or suppress each issue
2. Re-run the failing command to verify
3. If dead-code count legitimately changed (new public API, refactored exports): update the baseline

```bash
pnpm fallow:save-baseline
```

Commit the updated `fallow-baselines/dead-code-regression.json` alongside your code changes.

## Step 4: Verify

Re-run the original failing check:

- `pnpm check:fallow` — must exit 0
- `pnpm fallow:audit` — verdict must be `pass` or `warn`

## Rules

- Prefer removing dead code over suppressing it
- Every suppression must have a clear reason (public API, framework requirement, etc.)
- Never suppress to make checks pass without understanding why the code is unused
- Always commit baseline updates in the same PR as the code changes that caused them
- `stale-suppressions` is set to `error` — orphaned suppression comments will fail checks
