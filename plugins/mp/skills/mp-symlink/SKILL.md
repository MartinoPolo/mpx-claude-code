---
name: symlink
description: "Creates and verifies Windows symlinks and directory junctions through PowerShell New-Item. Any symlink or junction work on Windows. Git Bash ln -s and cmd mklink silently create the wrong thing here."
argument-hint: "[link-path] [target-path]"
allowed-tools: Bash, PowerShell
metadata:
  author: MartinoPolo
  version: "0.1.3"
  category: utility
---

# Windows Symlinks & Junctions (Claude Code)

Create and verify links that survive Git and resolve everywhere on this Windows machine.

**The one rule:** In Claude Code, create links with the **PowerShell tool** (`New-Item`). Git Bash `ln -s` copies the target instead of linking (`core.symlinks=false`), and `cmd.exe //c "mklink ..."` from the Bash tool fails with "syntax is incorrect" (quote mangling).

If `$ARGUMENTS` supplies a link path and a target: detect the type (target is a directory → junction, a file → symlink) and run Step 3 directly. Otherwise treat this as the how-to reference below.

## Step 1: Pick the link type

| Target    | Type    | Command                          | Admin? |
| --------- | ------- | -------------------------------- | ------ |
| Directory | Junction | `New-Item -ItemType Junction`     | No     |
| File      | Symlink  | `New-Item -ItemType SymbolicLink` | Yes\*  |

\* File symlinks need **Developer Mode** on (Settings → Privacy & security → For developers) **or** an elevated process. Junctions never need admin — prefer them for directories.

## Step 2: One-time git prerequisite

Git for Windows defaults to `core.symlinks=false`, which rewrites real symlinks into plain text files on `checkout`/`clone`/`merge`. Enable once per machine:

```bash
git config --global core.symlinks true
```

## Step 3: Create the link (PowerShell tool)

Directory junction (no admin):

```powershell
New-Item -ItemType Junction -Path "C:\link\path\name" -Target "C:\repo\real\dir"
```

File symlink (Developer Mode or elevated):

```powershell
New-Item -ItemType SymbolicLink -Path "C:\link\path\file.md" -Target "C:\repo\real\file.md"
```

Make it idempotent — guard before creating so a re-run skips silently:

```powershell
if (-not (Test-Path "C:\link\path\file.md")) { New-Item -ItemType SymbolicLink -Path "C:\link\path\file.md" -Target "C:\repo\real\file.md" }
```

If a file symlink throws "You do not have sufficient privilege" (no Developer Mode), retry that single op elevated — accept the UAC prompt:

```powershell
$mk = "New-Item -ItemType SymbolicLink -Path 'C:\link\path\file.md' -Target 'C:\repo\real\file.md' | Out-Null"
Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-Command',$mk
```

## Step 4: Verify

```powershell
Get-ChildItem "C:\link\path" | Format-Table Name, LinkType, Target -AutoSize
```

- `LinkType` = `SymbolicLink` or `Junction` and `Target` = where it resolves → the link is real.
- A plain file here (blank `LinkType`) means it was **copied, not linked** — delete it and recreate via the PowerShell tool.
- In Git Bash, `ls -la "C:/link/path"` shows `->` arrows for real links.

Confirm the link resolves to real content:

```powershell
Test-Path "C:\link\path\name"   # True → target reachable through the link
```

## Removing links

- **Directory junction:** `(Get-Item "C:\link\path\name").Delete()` — removes the link only. Never `Remove-Item -Recurse` on a junction; PowerShell 5.1 can follow it and delete the target's contents.
- **File symlink:** `Remove-Item "C:\link\path\file.md"` (or Git Bash `rm`).

## Full reference

`WINDOWS-SETUP.md` (repo root) covers the whole `~/.claude` link set, running multiple accounts side-by-side, per-project framework rules, and a troubleshooting table.
