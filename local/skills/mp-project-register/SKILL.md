---
name: mp-project-register
description: "Registers an existing project with the workstation — one colour driving its Windows Terminal profile and icon, its VS Code Peacock theme, its status-line ports and its Raycast quicklinks."
argument-hint: "<project folder name or path>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, AskUserQuestion, PowerShell, Bash(node *), Bash(python *), Bash(ls *), Bash(git *), Bash(gh *), Bash(bash *), Bash(env*)
metadata:
  author: MartinoPolo
  version: "0.5"
  category: setup
---

# Register a project with the workstation

Give a project one colour and one icon, then wire both into every surface that opens
it. $ARGUMENTS

This registers a project that already exists on disk. If it has no git repo yet, step 3
initializes one automatically — see that step for what it covers and where it still stops
to ask.

Skills referenced below (`mp-init-repo`, `mp-raycast-config`, `mp-board-setup`) are
read-and-follow, per the global "Cross-skill references" rule in `instructions/AGENTS.md`.

Scripts live in `${CLAUDE_SKILL_DIR}/scripts/`:

| Script | Purpose |
| --- | --- |
| `wt-profile.mjs` | `colors`, `icons-dir`, `add` a Windows Terminal profile |
| `peacock.mjs` | `used` colours across projects, `write` a project's `peacock.color` |
| `make-icon.py` | Render the 256×256 profile icon |

## Process

1. Gate on the Raycast export
2. Resolve the project
3. Initialize the repo if needed
4. Choose the colour
5. Draw the icon
6. Add the Windows Terminal profile
7. Write the VS Code Peacock block
8. Register dev-server ports
9. Hand the quicklinks to `mp-raycast-config`
10. Offer the remaining setup skills

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
too — the other nine steps stand on their own, and a user who only wants a terminal
profile should not be blocked.

Carry the chosen path forward to step 9. When the export predates work done in this
session, ask for a fresh one rather than reusing it.

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

Check `git -C "<project>" rev-parse --git-dir` (or `Test-Path <project>/.git`). If it
succeeds, the project already has a repo — skip to step 4.

If it fails, read `${CLAUDE_SKILL_DIR}/../mp-init-repo/SKILL.md` in full and carry out its
instructions yourself, in this project directory, right now — script, `.mpx/` structure,
the visibility question, GitHub repo creation, `main`/`dev` branches, branch protection.
It only genuinely needs you to stop once: **repo visibility** (private/public), via
`AskUserQuestion` as its own step 4 directs. Everything else — including the graceful
403-on-branch-protection degradation for private repos on GitHub Free — proceeds without
asking, so this step completes autonomously apart from that one question.

Two deviations from `mp-init-repo`'s instructions, both worth checking before you run its
script:

- **Don't clobber real planning docs.** Its step 3 template-writes `.mpx/CONTEXT.md` and
  `.mpx/DECISIONS.md` unconditionally. If the project already has real content there (a
  pre-scaffold planning phase, prior `/mp-grill` sessions, research written before the repo
  existed), leave those files alone and just commit them as-is — the templates are a
  starting point for projects that have nothing yet, not a format to impose over real
  content.
- **Point `.claude/CLAUDE.md` at real instructions, not the placeholder.** Its script always
  writes a generic bracketed template to `.claude/CLAUDE.md`. Once you know anything real
  about the project (from `.mpx/`, from this conversation, from existing docs), replace it:
  set `.claude/CLAUDE.md` to the single line `@AGENTS.md` and write the actual project
  instructions into `AGENTS.md` at the repo root — this mirrors the convention already used
  by this user's other projects (see `Grovekeeper/AGENTS.md` for the shape: a documentation
  pointer to `.mpx/`, stack, and commands once they exist). If the project has no stack yet
  (pure planning phase), say so plainly in `AGENTS.md` rather than inventing commands.

Report what `mp-init-repo` created (or that it was skipped because a repo already existed)
in the same closing table as the rest of this skill's report.

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

### Step 10: Offer the remaining setup skills

`mp-init-repo` is no longer in this list — step 3 already ran it if the project needed it.
Name the ones that still apply and let the user pick — neither runs unless chosen:

- [`mp-board-setup`](../mp-board-setup/SKILL.md) — Obsidian board and its `BOARD.md` symlink
- [`mp-design-init`](../mp-design-init/SKILL.md) — palette, fonts, `designs/tokens.css`

If the user picks one, read its `SKILL.md` and carry out its steps yourself in this
conversation — this applies to `mp-design-init` too for consistency even though its
invocation isn't blocked.

## Report

Close with a table of surfaces touched — Windows Terminal, VS Code, status line, Raycast —
each with the file written and the value used. Name the Windows Terminal backup path, and
state plainly which steps were skipped and why.
