# React Native Setup Branch Reference

Read the framework-rules section when linking rules on any platform; read failure handling when a command fails; read monorepo structure when composing the final report. Record each branch's stated success or accepted-exception outcome in that report.

### Step 7: Link Framework Rules

Set up `.claude/rules/` in the new project with the React rule file from the central mpx-claude-code repo. This gives Claude framework-specific guidance when editing `.tsx`/`.jsx` files.

**Source:** `<mpx-claude-code-repo>/rules-per-project/react.md`
**Destination:** `<project-path>/.claude/rules/react.md`

```bash
mkdir -p <project-path>/.claude/rules
```

#### Symlink by platform

Detect the OS and create the appropriate link:

**Linux / macOS:**
```bash
ln -s /path/to/mpx-claude-code/rules-per-project/react.md <project-path>/.claude/rules/react.md
```

**Windows:**
Symlinks require Administrator privileges (or Developer Mode enabled). Claude Code must be running in an **elevated Git Bash** or **elevated cmd.exe** terminal.

- See `WINDOWS-SETUP.md` in the mpx-claude-code repo for full Windows symlink reference.
- Git Bash `ln -s` does NOT create real Windows symlinks. Use `cmd.exe`:

```bash
cmd.exe //c "mklink <project-path>\.claude\rules\react.md <mpx-claude-code-repo>\rules-per-project\react.md"
```

If the current terminal is **not elevated**, inform the user:

> Cannot create symlink — Administrator privileges required.
> Run this command in an elevated Git Bash or cmd.exe (Run as Administrator):
> ```
> mklink "<project-path>\.claude\rules\react.md" "<mpx-claude-code-repo>\rules-per-project\react.md"
> ```
> Alternatively, enable Windows Developer Mode to allow symlinks without admin.

If symlinking fails, report the manual command and continue.

#### Detect mpx-claude-code repo location

Check in order:
1. `$HOME/.claude/rules/` exists and is a symlink → resolve its target to find the repo root
2. Common locations: `/c/projects/mpx-claude-code`, `~/mpx-claude-code`
3. If not found, ask the user for the path


## Monorepo Structure

The template creates:

```
apps/
  web/          # React + Vite Plus
  mobile/       # Expo + React Native + Expo Router
  api/          # Hono backend
packages/
  shared/       # Types, hooks, API clients, Zod schemas
  ui/           # Gluestack UI + NativeWind components
  config/       # Shared ESLint, TSConfig
```

## Rules

- Always use pnpm (standardized package manager)
- Template repo name: `template-react-native-monorepo` (user's GitHub account)
- No Svelte MCP prompt (this is React, not Svelte)
- If checks fail, report errors and continue
- Branch protection: require PR + require CI checks, no required reviewers
- Always use `git -C <path>` instead of `cd <path> && git`

## Failure Handling

| Problem                  | Action                                          |
| ------------------------ | ----------------------------------------------- |
| Template repo not found  | Inform user to create it first, stop execution  |
| Repo creation fails      | Report `gh` error and stop                      |
| Branch protection fails  | Record complete error and unprotected branch as accepted exception; continue |
| pnpm install fails       | Record complete error and setup impact as accepted exception; continue only if setup remains viable |
| Checks fail              | Preserve every command/output and record all failures as accepted exceptions |
| Push fails               | Report `git` error and remediation              |

## Output

After completion, display:

- Repo URL
- Default branch
- Branch protection status (main, dev)
- Monorepo structure overview
- Check results (pass/fail)
- Any errors encountered
