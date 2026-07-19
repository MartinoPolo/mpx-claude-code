# Windows Symlinks & Junctions Reference

## Prerequisites

**Admin required.** File symlinks (`mklink`) require an elevated (Administrator) command prompt.

> Junctions (`mklink /J`) don't require admin, but file symlinks do. Since this setup uses both, run everything as Administrator to avoid partial failures.

**Git symlinks must be enabled globally.** Git for Windows defaults to `core.symlinks=false`, which causes git to replace real symlinks with plain text files on checkout/clone/merge. Run once:

```bash
git config --global core.symlinks true
```

Without this, any `git pull`, `git checkout`, or `git clone` will silently break `.claude/rules/` symlinks — creating text files containing the target path instead of actual symlinks.

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

## Multiple Accounts Side-by-Side (Personal + Work)

Run two permanently-logged-in Claude Code accounts at once — one per terminal — using the official `CLAUDE_CONFIG_DIR` env var. Each config dir has its own `.credentials.json`, `history.jsonl`, `projects/`, `sessions/`, and `plugins/`, so the logins never clobber each other.

| Alias | Config dir | Account |
|-------|-----------|---------|
| `cc` / `ccd` | `~/.claude` (default) | Personal |
| `ccw` / `ccwd` | `~/.claude-work` | Work / Team |

### Shared vs per-account

- **Shared** (junctions + file symlinks into this repo, identical in both dirs): `agents assets hooks instructions rules scripts skills sounds`, plus `AGENTS.md CLAUDE.md settings.json settings.local.json WINDOWS-SETUP.md`. One source of truth — edit once, both accounts see it.
- **Per-account** (real files, independent): `.credentials.json`, `history.jsonl`, `projects/`, `sessions/`, `plugins/`, caches, telemetry.

> `settings.local.json` is centralized at the **repo root** and symlinked into both config dirs. It stays git-ignored (`*.local.json`) — a local single source of truth, not version-controlled (it holds machine paths).

### Creating the second config dir

Mirror every shared link from `~/.claude` into the new dir, then give it its own login. Junctions need no admin; file symlinks need admin **or** Developer Mode. Use the PowerShell tool / a PowerShell window:

```powershell
$repo = "C:\_MP_projects\mpx-claude-code"
$work = "$HOME\.claude-work"
New-Item -ItemType Directory -Force -Path $work | Out-Null

# Directory junctions (no admin)
"agents","assets","hooks","instructions","rules","scripts","skills","sounds" | ForEach-Object {
  New-Item -ItemType Junction -Path "$work\$_" -Target "$repo\$_"
}

# File symlinks (admin or Developer Mode)
New-Item -ItemType SymbolicLink -Path "$work\AGENTS.md"           -Target "$repo\instructions\AGENTS.md"
New-Item -ItemType SymbolicLink -Path "$work\CLAUDE.md"           -Target "$repo\instructions\CLAUDE.md"
New-Item -ItemType SymbolicLink -Path "$work\settings.json"       -Target "$repo\settings.json"
New-Item -ItemType SymbolicLink -Path "$work\settings.local.json" -Target "$repo\settings.local.json"
New-Item -ItemType SymbolicLink -Path "$work\WINDOWS-SETUP.md"    -Target "$repo\WINDOWS-SETUP.md"
```

**Moving an existing login into a dir without re-auth:** `Move-Item` the `.credentials.json` instead of running `/logout` (logout can revoke the token server-side). The dir it lands in stays authenticated; the dir it left prompts a fresh login next launch.

### Git Bash aliases (`~/.bashrc`)

The `claude` binary is a native `.exe`, so the env var must be a real Windows path — build it with `cygpath -w`:

```bash
alias cc='CLAUDE_CONFIG_DIR="$(cygpath -w "$HOME/.claude")" claude'
alias ccd='CLAUDE_CONFIG_DIR="$(cygpath -w "$HOME/.claude")" claude --dangerously-skip-permissions'
alias ccw='CLAUDE_CONFIG_DIR="$(cygpath -w "$HOME/.claude-work")" claude'
alias ccwd='CLAUDE_CONFIG_DIR="$(cygpath -w "$HOME/.claude-work")" claude --dangerously-skip-permissions'
```

### Verify

```bash
ls -la ~/.claude-work | grep -E '\->|credentials'   # links + own creds present
cc  -> /status    # shows Personal
ccw -> /status    # shows Team
```

Confirm subscription per dir without launching:

```powershell
(Get-Content "$HOME\.claude\.credentials.json"      -Raw | ConvertFrom-Json).claudeAiOauth.subscriptionType  # personal
(Get-Content "$HOME\.claude-work\.credentials.json" -Raw | ConvertFrom-Json).claudeAiOauth.subscriptionType  # team
```

### Gotcha: concurrent MCP servers

Each running session spawns its **own** copy of every configured MCP server (context7, github, chrome-devtools). Two live sessions = double the MCP processes. If resource use spikes, disable unneeded servers in one account, or don't keep both sessions hot.

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

## Claude Code (PowerShell Tool)

Claude Code's Bash tool runs in Git Bash, where `cmd.exe //c "mklink ..."` fails due to quote mangling (see above). **Use the PowerShell tool instead** — it calls `New-Item -ItemType SymbolicLink` natively, bypassing all quoting issues.

### Creating file symlinks

```powershell
New-Item -ItemType SymbolicLink -Path "C:\projects\<project>\.claude\rules\<rule>.md" -Target "C:\projects\mpx-claude-code\rules-per-project\<rule>.md"
```

### Full example: symlink Svelte rules into a project

```powershell
New-Item -ItemType SymbolicLink -Path "C:\projects\my-app\.claude\rules\shadcn-svelte.md" -Target "C:\projects\mpx-claude-code\rules-per-project\shadcn-svelte.md"
New-Item -ItemType SymbolicLink -Path "C:\projects\my-app\.claude\rules\svelte-context.md" -Target "C:\projects\mpx-claude-code\rules-per-project\svelte-context.md"
New-Item -ItemType SymbolicLink -Path "C:\projects\my-app\.claude\rules\sveltekit-paths.md" -Target "C:\projects\mpx-claude-code\rules-per-project\sveltekit-paths.md"
```

### Verifying

A symlink shows `l` in the Mode column:

```powershell
Get-ChildItem "C:\projects\<project>\.claude\rules\"
# Mode: -a---l  means symlink
```

### What does NOT work in Claude Code

```bash
# Bash tool — all of these fail with "syntax is incorrect":
cmd //c "mklink \"C:\path\link.md\" \"C:\path\target.md\""
cmd //c 'mklink "C:\path\link.md" "C:\path\target.md"'
```

**Rule:** For symlinks in Claude Code, always use the **PowerShell tool** with `New-Item -ItemType SymbolicLink`.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "You do not have sufficient privilege" | Not running as admin | Right-click cmd/Git Bash → "Run as administrator" |
| `mklink` not recognized | Running in Git Bash directly | Use `cmd.exe //c "mklink ..."` |
| Junction shows as empty folder | Target path doesn't exist | Verify target path with `dir` |
| `del` on junction deleted target files | Used `del` instead of `rmdir` | Always `rmdir` for directory links |
| "Syntax is incorrect" from Git Bash | Nested quote mangling | Drop inner quotes or use native cmd.exe |
| `yarn`/`npm`/`pnpm`/`docker` produce no output in Claude Code | TTY detection bug on Windows | Wrap with Node: `node -e "require('child_process').execSync('yarn lint', {stdio:'inherit'})"` — use `stdio:'inherit'` for live output, `encoding:'utf8'` + `console.log()` to capture as string. Apply whenever expected output is silently missing |
| chrome-devtools-mcp / `/chrome` can't connect under WSL | WSL↔Windows Chrome bridge | No fix — run Claude Code natively on Windows (WSL abandoned for this reason) |

## Windows Terminal Keybindings

Remaps needed for Claude Code usability (Windows Terminal → `Ctrl+,` → Open JSON file, or directly `%LOCALAPPDATA%\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json`):

1. Shift+Enter → newline (must send `\r- `, a lone whitespace doesn't work)
2. Ctrl+Backspace → delete whole word

```json
"actions": [
    { "command": { "action": "sendInput", "input": "\r- " }, "id": "User.sendInput.945C32C5" },
    { "command": { "action": "sendInput", "input": "\u0017" }, "id": "User.sendInput.817164EE" }
]
```

## Native Install

Switched from npm install to native install (2026-01-22). Executable lives in `C:\Users\<user>\.local\bin` — must be added to the PATH environment variable manually.
