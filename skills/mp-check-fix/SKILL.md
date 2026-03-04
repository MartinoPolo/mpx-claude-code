---
name: mp-check-fix
description: 'Auto-detect and fix build/typecheck/lint errors. Use when: "fix lint errors", "fix type errors", "check and fix", "run checks"'
compatibility: Requires project with npm/yarn/pnpm scripts for build/lint/typecheck
allowed-tools: Bash(bash *detect-check-scripts*), Bash(*run build*), Bash(*run check*), Bash(*run typecheck*), Bash(*run type-check*), Bash(*run tsc*), Bash(*run check:types*), Bash(*run lint*), Bash(*run eslint*), Bash(*run lint:check*), Bash(cd * && *run build*), Bash(cd * && *run check*), Bash(cd * && *run typecheck*), Bash(cd * && *run type-check*), Bash(cd * && *run tsc*), Bash(cd * && *run check:types*), Bash(cd * && *run lint*), Bash(cd * && *run eslint*), Bash(cd * && *run lint:check*), Read, Edit, Glob, Grep, Bash(yarn *), Bash(npm *), Bash(pnpm *), Bash(bun *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: code-review
---

# Check & Fix

Auto-detect and fix build, typecheck, and lint errors. $ARGUMENTS

## Examples

**User says:** "fix lint errors"
**Actions:** Detect package manager, run lint script, parse errors, apply fixes
**Result:** All lint errors fixed, verification run passes

**User says:** "check and fix"
**Actions:** Run build → typecheck → lint in sequence, fix errors at each stage
**Result:** All checks pass with applied fixes listed

## Step 1: Detect Available Checks

Skill script path used below:

```bash
CHECK_SCRIPT="$HOME/.claude/skills/mp-check-fix/scripts/detect-check-scripts.sh"
```

```bash
bash "$CHECK_SCRIPT"
```

Parse output key=value pairs. Report findings:

- Package manager (PM)
- Available checks (BUILD, TYPECHECK, LINT)
- Monorepo packages if applicable

If `NO_PROJECT=true` → report "No package.json found" and stop.

If `PM_UNKNOWN=true` → no lock file found. Ask the user which package manager to use (npm, pnpm, yarn, bun). Then re-run with the chosen PM:

```bash
bash "$CHECK_SCRIPT" . <chosen_pm>
```

## Step 2: Filter by Arguments

- No `$ARGUMENTS` → run all detected checks
- `lint` → only LINT
- `typecheck` or `types` → only TYPECHECK
- `build` → only BUILD
- Multiple args supported: `lint typecheck`

## Step 3: Run Checks

Run each selected check command. For monorepo packages, run from their directory using the `*_DIR` value:

```bash
cd <DIR> && <COMMAND>
```

Capture full output including exit code. Run checks sequentially — stop at first failure to fix before continuing.

## Step 4: Fix Errors

If a check fails:

1. **Read error output** — identify files and line numbers
2. **Read relevant source files** — understand the context
3. **Fix the issues** — use Edit tool for targeted fixes
4. **Re-run the failed check** — verify fix worked

Repeat for up to **3 iterations** per check. If still failing after 3 attempts → report remaining errors and move to next check.

## Step 5: Continue Remaining Checks

After fixing (or giving up on) a check, proceed to the next one. Each check gets its own 3-iteration budget.

## Step 6: Report Results

Summarize final status for each check:

- **Passed**: check passed (on first run or after fixes)
- **Fixed**: had errors, successfully fixed
- **Failed**: still has errors after 3 iterations (list remaining issues)
- **Skipped**: not available in this project

Format:

```
Build:     [status]
Typecheck: [status]
Lint:      [status]
```

## Troubleshooting

| Problem                        | Solution                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| "No scripts detected"          | Check `package.json` has `build`, `lint`, or `typecheck`/`check` scripts |
| "No package.json found"        | Run from project root containing `package.json`                          |
| "PM_UNKNOWN"                   | No lock file found — provide package manager manually when prompted      |
| Wrong package manager detected | Delete stale lock files or specify PM via second argument                |

## Rules

- Never modify test files to make checks pass (unless the test itself has a bug)
- Never disable lint rules to suppress errors — fix the actual code
- Never add `@ts-ignore` or `// eslint-disable` comments
- If a fix requires architectural changes → report it, don't attempt
- For monorepo: report which package had issues
