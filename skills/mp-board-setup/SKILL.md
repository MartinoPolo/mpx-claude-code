---
name: mp-board-setup
description: 'Set up an Obsidian board for this project and link it into the repo so agents can read requirements and pasted screenshots: creates the vault board file with the section skeleton, the .mpx/BOARD.md symlink + .mpx/board-files junction, and gitignores both. Use when: "set up board", "board setup", "init board", "create board"'
argument-hint: "[vault-root]"
disable-model-invocation: true
allowed-tools: AskUserQuestion, PowerShell, Bash(git rev-parse *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: setup
---

# mp-board-setup

One-time setup that creates this project's Obsidian **board** and links it into the repo, so `mp-board-to-issues` and `mp-batch-execute` can read requirements and pasted images. See [BOARD_CONVENTION.md](../shared/BOARD_CONVENTION.md) for the board format and link layout. $ARGUMENTS

## Step 1: Resolve paths

- **Repo root** — `git rev-parse --show-toplevel`.
- **Project name** — the repo directory's base name (becomes the board filename `<project>.md`).
- **Vault root** — the `[vault-root]` argument if given; else `$env:MPX_OBSIDIAN_VAULT`; else ask the user for the absolute Obsidian vault path (and suggest they set `MPX_OBSIDIAN_VAULT` so future projects skip this prompt).

## Step 2: Create board + links

Run the setup script with the resolved paths (PowerShell tool):

```powershell
& "$HOME\.claude\skills\mp-board-setup\scripts\link-board.ps1" -Repo "<repo>" -Vault "<vault>" -Project "<project>"
```

The script is idempotent and:

- enables `git core.symlinks` globally so Windows preserves real symlinks;
- creates `<vault>\Boards\<project>.md` with the single `# To Process` intake section **only if it does not already exist** (never clobbers existing notes; lifecycle lanes are added later as work progresses);
- creates the `.mpx/board-files` junction → `<vault>\Files` (no admin) and the `.mpx/BOARD.md` file symlink → the board;
- appends `.mpx/BOARD.md` and `.mpx/board-files/` to `.gitignore`.

Without Windows Developer Mode the direct symlink call fails; the script then retries that single op in an elevated child process (`Start-Process -Verb RunAs`), which raises a UAC prompt. Tell the user to accept it.

## Step 3: Verify + report

Confirm the script printed both links. If it still warned that the `.mpx/BOARD.md` symlink could not be created (elevation declined, or the UAC prompt wasn't accepted), the junction and board file are already in place — only the file symlink needs the extra privilege. Re-run the script and accept the UAC prompt, or enable Windows Developer Mode (Settings › Privacy & security › For developers) and re-run.

Report the board path, both link paths, and the next step: **open the board in Obsidian, paste any bug/task/feature notes with screenshots under `# To Process` (no need to sort by type), then run `/mp-board-to-issues` or `/mp-batch-execute`.**
