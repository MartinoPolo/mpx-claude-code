---
name: mp-project-register
description: "Registers an existing project with the workstation — one colour driving its Windows Terminal profile and icon, its VS Code Peacock theme, its status-line ports and its Raycast quicklinks."
argument-hint: "<project folder name or path>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, AskUserQuestion, PowerShell, Bash(node *), Bash(python *), Bash(ls *), Bash(git *), Bash(gh *), Bash(bash *), Bash(env*)
metadata:
  author: MartinoPolo
  version: "0.6"
  category: setup
---

# Register a project with the workstation

Give a project one colour and one icon, then wire both into every surface that opens
it. $ARGUMENTS

This registers a project that already exists on disk. If it has no git repo yet, step 3
initializes one automatically — see that step for what it covers and where it still stops
to ask.

Skills referenced below are read-and-follow, per the global "Cross-skill references" rule in `instructions/AGENTS.md`.

## Process

Follow Steps 1–11 in order; branch-only repository and Obsidian details are disclosed at
the steps that trigger them.
### Step 1: Gate on the Raycast export

**Stop here and ask before touching anything.** Raycast's quicklinks can only be changed
through an exported `.rayconfig`, and the export is a manual step in the Raycast UI that
nothing here can perform. Doing it last would mean finishing every other surface and then
stalling, so it comes first.

Tell the user, in these words: **Raycast → `Ctrl+,` → Advanced → Export Settings & Data**,
passphrase of 8+ characters, saved to the Desktop.

Then use `AskUserQuestion` to have them confirm the export exists and point at it. Find
candidates with `Glob` on `Raycast-*.rayconfig` under their Desktop and Downloads, and offer
the newest as options, each labelled with its modified time, so the usual case is one
keystroke. Resolve the home
directory from the environment rather than writing it out. Offer a **Skip Raycast** option
too — the remaining steps stand on their own, and a user who only wants a terminal
profile should not be blocked.

Carry the chosen path forward to step 9. When the export predates work done in this
session, ask for a fresh one rather than reusing it.

**Gate:** Continue only when a current export path or an explicit Raycast skip is recorded before another surface changes.

### Step 2: Resolve the project

Resolve `MPX_PROJECTS` and `MPX_WORK` with `env | grep '^MPX_'` — written in prose they are
literal text, not paths to search. Take the folder from `$ARGUMENTS`. A bare name is
resolved against the machine roots `MPX_PROJECTS` then `MPX_WORK`; confirm the match when
both contain it. Fail with the variable's name when neither resolves.

Report what is already registered, so a re-run repairs rather than duplicates:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/wt-profile.mjs" colors
node "${CLAUDE_SKILL_DIR}/scripts/peacock.mjs" used
ls "<project>/.vscode/settings.json"
```
### Step 3: Initialize the repo if needed

Check `git -C "<project>" rev-parse --git-dir` (or `Test-Path <project>/.git`). When it
fails, read and execute [REPOSITORY_INIT.md](REPOSITORY_INIT.md), the repository-creation
branch and its local instruction-refinement exception. When it succeeds, preserve the existing repository.
### Step 4: Choose the colour

One colour drives the Windows Terminal tab, the VS Code chrome and the icon plate, so the
project reads the same in every window.

Propose a colour that fits what the project *is* — read its `README.md` for the domain
rather than reaching for the next unused hue. Check it against both lists from step 2 and
pick again when it is close enough to an existing one to be confused at a glance;
neighbouring shades of the same hue are the common trap.

Confirm the choice with `AskUserQuestion`, offering the suggestion plus two alternatives.
### Step 5: Draw the icon

Icons live beside the Windows Terminal settings — `node "${CLAUDE_SKILL_DIR}/scripts/wt-profile.mjs" icons-dir`
prints the folder. Render to the session scratchpad first, **show it to the user with
`Read`**, and copy it into that folder only once they accept it. `make-icon.py` refuses to
overwrite an existing file, so a rejected draft is written under a new name.

A glyph covers most projects:

```bash
python "${CLAUDE_SKILL_DIR}/scripts/make-icon.py" --color '#0F766E' \
  --glyph 'π' --font cambriab.ttf --glyph-scale 0.78 --out '<scratchpad>/<project>.png'
```

When no character carries the meaning, write a motif file defining
`draw_motif(draw, size, ink, plate)` — Pillow drawing calls on a plate already filled,
with `size` the supersampled canvas — and pass `--motif <file>`. Keep the shape readable
at 16px: solid silhouettes, few parts, no thin outlines.
### Step 6: Add the Windows Terminal profile

```bash
node "${CLAUDE_SKILL_DIR}/scripts/wt-profile.mjs" add \
  --name '<project>' --dir '<project path>' --icon '<icons dir>/<project>.png' --color '#RRGGBB'
```

The script backs the settings file up beside itself, copies the shell commandline from the
profiles already there, generates the GUID, and re-parses the result before writing, so a
malformed edit never reaches Windows Terminal. Report the backup path. Windows Terminal
picks the profile up on its own — no restart.

The profile **name** is what Raycast's terminal quicklink targets in step 9, so keep it
identical to the folder name.

The new-tab dropdown is a grouped `newTabMenu` in the same settings file — general shells,
mpx tooling, work repositories, a `remainingProfiles` catch-all, then admin shells, with
`separator` entries between groups. A freshly added profile lands in the catch-all until its
GUID is placed explicitly. Use `AskUserQuestion` to ask which group the project belongs to
(mpx tooling, work repositories, or leave it in the catch-all), then `Edit` the settings
file to insert `{ "type": "profile", "profile": "<guid>" }` at the end of the chosen group.
Two rules the menu depends on: keep every GUID comment-free JSON (Windows Terminal rejects
trailing commas), and remember that the `ctrl+shift+<digit>` bindings target dropdown
*positions* — inserting into a group above the work section shifts every number below it,
so tell the user when the numbering moves.
### Step 7: Write the VS Code Peacock colour

```bash
node "${CLAUDE_SKILL_DIR}/scripts/peacock.mjs" write '<project path>' '#RRGGBB'
```

This merges into any existing `.vscode/settings.json` and writes **only** `peacock.color`,
set to the same value as the tab, which is what makes the two windows match. One property is
the single source of truth: Peacock regenerates the activity bar, status bar, title bar and
badge colours itself the first time VS Code opens the folder. Any stale derived keys left in
`workbench.colorCustomizations` by an earlier colour are cleared in the same write.
### Step 8: Register dev-server ports

When the project serves anything on localhost, use `Edit` to add its ports to `devServers`
in `plugins/mp/statusline-projects.json`, keyed by the project folder name. The
status line then renders each as a clickable `:port` that turns green while something is
listening. Read the ports from the project's own config — a `dev` script, `vite.config.*`
or a compose file — rather than assuming defaults. Skip the step for a project with no
server.
### Step 9: Hand the quicklinks to `mp-raycast-config`

Propose the family for this project, then read
`${CLAUDE_SKILL_DIR}/../mp-raycast-config/SKILL.md` (and the `REFERENCE.md` it points to)
and carry out its process yourself, in this conversation, with the export path from step 1
and the quicklink list below as its inputs. That skill owns the format, the
ULID rule, the alias records and the import wording; restating any of it here would let the
two drift apart.

The usual family, with `<letter>` the project's initial and the bare word going to
whichever member the user reaches for most:

| Quicklink | `link` |
| --- | --- |
| folder | the project path |
| code | `file:///<project path>` + the VS Code `openWith` id |
| term | `wt -p "<profile name>"` — the name from step 6 |
| repo / issues / prs | the GitHub URLs from `gh repo view --json url` |

Registering several projects in one sitting is worth batching: collect every project's
quicklinks first and hand them over together, so the user does one export/import
round-trip instead of one per project.
### Step 10: Register the project in Obsidian

Resolve `MPX_OBSIDIAN_VAULT`. When it names a vault the user uses, read and execute
[OBSIDIAN_REGISTRATION.md](OBSIDIAN_REGISTRATION.md), which points to the vault's
authoritative task-system document and current examples; do not infer or restate their
format. Otherwise skip this branch and record why. Verify that all three vault registrations
are present exactly once when this branch runs.
### Step 11: Offer the remaining setup skills

`mp-init-repo` is no longer in this list — step 3 already ran it if the project needed it.
Name the ones that still apply and let the user pick — neither runs unless chosen:

- [`mp-board-setup`](../mp-board-setup/SKILL.md) — Obsidian board and its `BOARD.md` symlink
- `mp-design-init` — palette, fonts, `designs/tokens.css`

If the user picks `mp-design-init`, resolve `MPX_SKILLS_DIR` and, when it is available,
read `<resolved MPX_SKILLS_DIR>/mp/skills/mp-design-init/SKILL.md`. If it is unavailable,
report that the selected skill cannot be resolved and do not guess another path. If the user
picks either skill, read its `SKILL.md` and carry out its steps yourself in this conversation
— this applies to `mp-design-init` too for consistency even though its invocation isn't blocked.

## Report

Close with a table of surfaces touched — Windows Terminal, VS Code, status line, Raycast,
Obsidian `Tasks.md` — each with the file written and the value used. Name the Windows Terminal backup path, and
state plainly which steps were skipped and why.
