---
name: mp-suppression-audit
description: >-
  Repository-wide audit of code quality suppressions and config rule changes.
  Finds eslint-disable, fallow-ignore, svelte-ignore, @ts-ignore, and disabled
  rules in configs. Evaluates each suppression — fix it if a simple solution
  exists, keep it if justified. Creates a PR with all fixes.
  Use when: "audit suppressions", "check suppressions", "suppression audit",
  "find disabled rules", "lint suppression review", "code quality audit"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
metadata:
  author: MartinoPolo
  version: "0.1"
  category: code-quality
---

# Suppression Audit

Audit all code quality suppressions and lint config rule changes across the repository. For each suppression, determine whether a simple fix resolves the underlying issue or the suppression is genuinely needed. Fix unjustified suppressions, verify checks pass, and create a PR.

## Suppression Types

| Type | Pattern | Where |
|------|---------|-------|
| ESLint | `eslint-disable`, `eslint-disable-next-line`, `eslint-disable-line` | Source files |
| Fallow | `fallow-ignore-next-line`, `fallow-ignore-file` | Source files |
| Svelte | `svelte-ignore` | `.svelte` files |
| TypeScript | `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` | `.ts`/`.svelte` files |
| Oxlint | `oxlint-disable`, rules set to `"off"` | Source + config |
| Config rules | Rules set to `"off"`, `"warn"`, or `0` | `eslint.config.*`, `.oxlintrc.*` |

## Process

### Step 1: Detect Check Commands

Spawn `mp-checks-detector` sub-agent to discover available check scripts. Store the returned command plan for Step 5.

### Step 2: Scan for All Suppressions

Use `Grep` to find every suppression comment in source files (exclude `node_modules`, `dist`, `.svelte-kit`, lock files). For each match, record:

- File path and line number
- Suppression type and rule name
- Surrounding code context (3 lines before/after)

### Step 3: Scan Config Files

Find and read all lint config files (`eslint.config.*`, `.eslintrc.*`, `.oxlintrc.*`, `oxlint.json`). For each:

1. List every rule explicitly set to `"off"`, `"warn"`, or `0`
2. Check git history for recent changes (last 2 weeks): `git log --since="2 weeks ago" -p -- <config-file>`
3. Flag any rule that was downgraded (error→warn) or removed recently

### Step 4: Evaluate Each Suppression

For each suppression found in Steps 2-3, classify it:

**REMOVE** — suppression is unjustified, a straightforward fix exists:
- Rule violation is easy to fix (rename, restructure, add type)
- Suppression was added as a shortcut instead of fixing the issue
- The suppressed rule no longer triggers (code changed since suppression was added)

**KEEP** — suppression is justified:
- Framework/library limitation requires it (e.g., Svelte a11y for intentionally non-standard interactions)
- Fix would require major refactoring disproportionate to the benefit
- Rule is genuinely wrong for the context (e.g., `no-undef` disabled globally in TypeScript projects)
- Test files where the suppressed pattern is the thing being tested

**UPGRADE** — warning should be an error:
- Config recently downgraded a rule from error to warn without clear reason
- Rule removal weakens quality gates

Log the evaluation as a table (printed to the user) and immediately proceed to fixes:

```
| # | File | Type | Rule | Verdict | Reason |
|---|------|------|------|---------|--------|
```

### Step 5: Fix Suppressions

Automatically fix every suppression marked REMOVE or UPGRADE — no confirmation needed.

For each fix:

1. Remove the suppression comment
2. Fix the underlying code issue
3. Run the fast check command (pre-commit tier) to catch regressions
4. If the fix breaks something, revert and reclassify as KEEP with explanation

After all individual fixes pass, run the full check suite once.

### Step 6: Create PR

Use `/mp-commit-push-pr` skill to commit all changes and create a PR. Include the evaluation table in the PR body so reviewers can see the reasoning for each decision.

PR title format: `chore: audit and fix code quality suppressions`

## Edge Cases

- **Generated files** (`.svelte-kit/`, `dist/`): skip entirely
- **Test files**: suppressions in test code are more often justified — evaluate with higher bar for removal
- **Index/barrel files**: `unused-export` suppressions on re-export files are usually justified
- **Config-level `"off"` rules**: check if the rule conflicts with another tool (e.g., ESLint `no-undef` off because TypeScript handles it) — these are usually justified
