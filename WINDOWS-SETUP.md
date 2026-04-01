# Windows Symlinks & Junctions Reference

## Prerequisites

**Admin required.** File symlinks (`mklink`) require an elevated (Administrator) command prompt.

> Junctions (`mklink /J`) don't require admin, but file symlinks do. Since this setup uses both, run everything as Administrator to avoid partial failures.

## Link Types

| Command | Type | Use For | Requires Admin |
|---------|------|---------|----------------|
| `mklink /J <link> <target>` | Junction | Directories | No |
| `mklink <link> <target>` | File symlink | Files | Yes* |
| `mklink /H <link> <target>` | Hard link | Files | No |

\* Unless Windows Developer Mode is enabled.

**Prefer junctions over `/D` for directories** — junctions don't require admin and resolve transparently in Git Bash, Explorer, and cmd.exe.

## How It Works

A symlink/junction is a filesystem pointer. The link path appears as a regular file/folder but reads/writes go to the target. This lets `~/.claude/` reference files managed in a git repo without copying.

## Full Setup Script

Run from an **Administrator** command prompt. Set `REPO` to your clone location.

```cmd
set REPO=<your-clone-path>
set DEST=%USERPROFILE%\.claude

:: Directory junctions
mklink /J "%DEST%\agents"       "%REPO%\agents"
mklink /J "%DEST%\assets"       "%REPO%\assets"
mklink /J "%DEST%\hooks"        "%REPO%\hooks"
mklink /J "%DEST%\instructions" "%REPO%\instructions"
mklink /J "%DEST%\rules"        "%REPO%\rules"
mklink /J "%DEST%\scripts"      "%REPO%\scripts"
mklink /J "%DEST%\skills"       "%REPO%\skills"
mklink /J "%DEST%\sounds"       "%REPO%\sounds"

:: File symlinks (or use mklink /H for hard links without admin)
mklink "%DEST%\AGENTS.md"      "%REPO%\instructions\AGENTS.md"
mklink "%DEST%\CLAUDE.md"      "%REPO%\instructions\CLAUDE.md"
mklink "%DEST%\settings.json"  "%REPO%\settings.json"
```

## Per-Project Framework Rules (React/Solid)

User-level rules (svelte, python, rust, css, typescript) auto-load via the `rules` junction above. For frameworks that share `.tsx`/`.jsx` extensions (React, Solid), link the rule into the specific project's `.claude/rules/`.

From an **Administrator cmd.exe** (or Git Bash with admin if paths have no spaces):

```cmd
:: In a React project
mkdir <project-path>\.claude\rules
mklink "<project-path>\.claude\rules\react.md" "%REPO%\rules-per-project\react.md"

:: In a Solid project
mkdir <project-path>\.claude\rules
mklink "<project-path>\.claude\rules\solid.md" "%REPO%\rules-per-project\solid.md"
```

From **elevated Git Bash** (paths without spaces):

```bash
mkdir -p <project-path>/.claude/rules
cmd.exe //c "mklink <project-path>\.claude\rules\react.md <repo>\rules-per-project\react.md"
```

## Removing Links

```cmd
:: Directory link — always use rmdir, NEVER del (del destroys the target's contents)
rmdir "%USERPROFILE%\.claude\agents"

:: File symlink
del "%USERPROFILE%\.claude\AGENTS.md"
```

## Verification

```cmd
dir "%USERPROFILE%\.claude"
```

Look for `<JUNCTION>` and `<SYMLINK>` markers. In Git Bash, `ls -la ~/.claude/` shows `->` arrows.

## Git Bash Quoting Gotcha

Git Bash's `ln -s` does **not** create real Windows symlinks — it copies the target (`core.symlinks=false`). Use `cmd.exe //c "mklink ..."` instead, but **nested quotes get mangled**.

### What fails

```bash
# Escaped inner quotes — "syntax is incorrect"
cmd.exe //c "mklink \"C:\Users\me\.claude\FILE.md\" \"C:\repo\FILE.md\""

# Single-quote wrapping — same error
cmd.exe //c 'mklink "C:\Users\me\.claude\FILE.md" "C:\repo\FILE.md"'

# del via cmd.exe — also mangles quotes
cmd.exe //c "del \"C:\Users\me\.claude\FILE.md\""
```

### What works

```bash
# Drop inner quotes (safe when paths have no spaces)
cmd.exe //c "mklink C:\Users\me\.claude\FILE.md C:\repo\FILE.md"

# For removing file symlinks, use Git Bash rm directly
rm ~/.claude/FILE.md

# For removing directory links, use Git Bash rm -rf or rmdir via cmd
rm -rf ~/.claude/agents
```

**Rule of thumb:** If your paths have no spaces, drop inner quotes entirely. If they do, run `mklink` from a native `cmd.exe` window rather than piping through Git Bash.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "You do not have sufficient privilege" | Not running as admin | Right-click cmd/Git Bash → "Run as administrator" |
| `mklink` not recognized | Running in Git Bash directly | Use `cmd.exe //c "mklink ..."` |
| Junction shows as empty folder | Target path doesn't exist | Verify target path with `dir` |
| `del` on junction deleted target files | Used `del` instead of `rmdir` | Always `rmdir` for directory links |
| "Syntax is incorrect" from Git Bash | Nested quote mangling | Drop inner quotes or use native cmd.exe |
