---
name: components-audit
description: "Audits design-system component usage, flagging native elements, wrong variants, missed componentization opportunities, and hardcoded colors that bypass theme tokens."
argument-hint: "[scan-path] [autofix|autofix=true|autofix=false]"
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Grep, Agent, AskUserQuestion, Bash(npm run *), Bash(pnpm *)
metadata:
  author: MartinoPolo
  version: "0.1.5"
  category: code-review
---

# Design System Component Usage Audit

Find where the codebase hand-codes UI that the project's own design-system components already provide, and where those components are used with manual styling that a variant should own. Report findings; optionally autofix the mechanical ones. $ARGUMENTS

## Parameters

- `scan-path` (optional) — root to audit. Default: repo `src/` (or repo root if no `src/`).
- `autofix` — `autofix`/`autofix=true` forces the fix phase ON; `autofix=false` forces OFF; omitted → report only.

## Core Principle

Trust the component's built-in props (variants, sizes, icon slotting) instead of re-applying styles by hand. When a recurring visual need has no variant (e.g. an always-purple button), **add a variant to the component** or **componentize the pattern**, keeping every styled native element attached to the component it belongs to.

## Workflow

### Step 1: Inventory the design system FIRST

Discovery is generalized — no config assumed. Auto-detect, then read real APIs.

1. **Locate the components folder(s).** Spawn an `Explore` sub-agent (breadth: medium, no `model` param) to glob common roots under the scan path — `**/lib/components/**`, `**/components/**`, `**/ui/**` — and return the component folder paths. Strong signals: a directory of single-purpose folders each with a `.svelte`/`.tsx` + an `index.ts` + a variants file.
2. **Detect the stack.** Check `package.json` and imports for `bits-ui`, `shadcn`, `radix-ui`, `cva`, `tailwind-variants` (`tv`). If the project is **shadcn-svelte / Bits UI**, treat `rules-per-project/shadcn-svelte.md` as the canonical anti-pattern source and feed its rules to the audit agents.
3. **Read each base component's real prop API.** Open variant definitions (`*_variants.ts`, `cva()`/`tv()` configs, prop/type declarations) to learn actual `variant`/`intent`/`size` values and icon-slot conventions. Read prop names from the source rather than assuming them.
4. **Build the inventory** — for each component: name, import path, available variants/sizes, and which native element(s) it replaces (`button`→`Button`, `input`→`Input`, calendar/date field→date picker, etc.).
5. **Record the exclusion set** — the component-implementation folder(s) themselves, plus generated/vendored files. These are always excluded from audit targets.

The inventory string seeds every sub-agent prompt — agents must audit against the components that actually exist, not a generic list.

### Step 2: Fan-out audit (parallel sub-agents)

See `../shared/EXPLORATION.md` for delegation policy. Spawn `Explore` sub-agents in parallel (breadth: medium), **roughly one per base component or component group** (per user preference), each given: the inventory, the exclusion set, and one axis checklist from [CHECKLISTS.md](CHECKLISTS.md). For large component sets, run the agents `run_in_background: true` and process findings as each returns.

Audit axes (see [CHECKLISTS.md](CHECKLISTS.md) for the concrete patterns per axis):

- **A — Native element → component**: raw `<button>`, `<input>`, `<select>`, `<textarea>`, `<hr>`, `animate-pulse` divs, styled spans, callout divs that should be the design-system component.
- **B — Improper variant/prop usage**: manual classes that duplicate or override a variant (`<Button class="rounded-lg">`, color overrides defeating `intent`/`variant`), wrong variant, missing `size="icon"`, manual icon sizing.
- **C — Componentize / add-variant**: repeated detached-style patterns (the "always purple button") → add a variant to the component or extract a component. Each finding is tagged **C-clear** (mechanical, auto-fixable) or **C-judgment** (debatable abstraction, recommendation only).
- **D — Hardcoded theme-color bypass**: inline/hardcoded colors (`#hex`, `oklch(...)`, `bg-gray-*`, `bg-white`, `text-black`) bypassing semantic theme tokens.

Every finding must be `{ axis, file, line, current code, suggested fix, confidence }`.

### Step 3: Consolidate & report

1. Merge findings, dedupe by `file:line`, drop anything inside the exclusion set, and apply the skip list (see below).
2. All four axes are actionable. Split C into **C-clear** (unambiguous: map a one-off onto an existing primitive, or add a well-defined variant + migrate call-sites preserving public API) and **C-judgment** (the proposed abstraction is debatable — leave as a recommendation).
3. Write `COMPONENT-AUDIT.md` only if findings exist; otherwise report a clean result in conversation.

Report shape:

```markdown
## Native element → component (A)
- `path:line` — current → suggested fix

## Improper variant/prop usage (B)
- `path:line` — current → suggested fix

## Componentize / add-variant recommendations (C)
- pattern (N occurrences) — proposed variant/component + call-sites

## Hardcoded theme-color bypass (D)
- `path:line` — current → suggested fix
```

### Step 4: Autofix phase (conditional)

Run only when `autofix` is ON and actionable findings exist. Apply **A, B, D, and C-clear**. Leave **C-judgment** as recommendations in the report — those are debatable abstractions for the user to decide.

1. **Pre-analyze each fix** — resolve exact file path, current code, and the precise change (the executor applies; it does not diagnose). For a C-clear variant addition, specify both the edit to the component's variants file and every call-site migration.
2. Spawn `mp-executor` sub-agent with the concrete per-finding instructions plus the requirement to fix only in-scope findings and preserve each component's public API when refactoring internals.
3. After the executor completes, **re-read the changed files on disk** (a concurrent rebase/hook can silently revert edits — verify the final on-disk state directly, rather than trusting an earlier diff), then run the project's typecheck (`npm run check`/`pnpm check`/`tsc`). Distinguish pre-existing errors from new ones.
4. In the output, list any new component variants added so the user can review the design changes.

### Skip list

- Semantically-correct hardcoded colors (e.g. `text-white` on a filled primary button, decorative brand colors).
- The component-implementation folder(s) and generated/vendored files.
- Native elements with no design-system equivalent in the inventory.

## Output

```markdown
Stack: [shadcn-svelte | Bits UI | custom | ...]
Components folder: [path]
Inventory: [N components]

Findings:
- A native→component: [N]
- B improper variant: [N]
- C recommendations: [N]
- D color bypass: [N]

Report: [COMPONENT-AUDIT.md | none]
Autofix: [applied A/B/D/C-clear: N | report only | not requested]
New variants added: [list | none]
Typecheck: [clean | N new errors | not run]
```
