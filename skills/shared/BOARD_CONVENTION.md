# Board Convention

Shared single-source-of-truth for the Obsidian **board** workflow, referenced by `mp-board-setup`, `mp-board-to-issues`, and `mp-batch-execute`. The board is a plain-markdown file that lives in an Obsidian vault (so pasted screenshots work) and is exposed inside the repo via two links under `.mpx/` (so agents can read requirements **and** images).

## Why a board

GitHub's issue API cannot round-trip images to an agent — an agent creating or reading an issue never sees pasted screenshots. Obsidian markdown embeds images as wikilinks that an agent **can** read. So visual bug notes are captured on the board first, then optionally converted to GitHub issues.

## Link layout (per project)

| Path in repo | Type | Target | Purpose |
|---|---|---|---|
| `.mpx/BOARD.md` | file symlink | `<vault>\Boards\<project>.md` | the board's text (requirements) |
| `.mpx/board-files/` | directory junction | `<vault>\Files` | the vault's shared attachments folder (images) |

Both are **gitignored** — they point outside the repo and are per-machine. The vault root comes from the `MPX_OBSIDIAN_VAULT` environment variable. `mp-board-setup` creates all of this.

> **Writing back to the board:** because `.mpx/BOARD.md` is a real symlink, the Write/Edit tools may refuse to write through it ("Refusing to write through symlink"). Resolve it to the vault target (`<vault>\Boards\<project>.md`) and edit that real path directly.

### Image resolution

Board items reference screenshots as bare-filename wikilinks: `![[Pasted image 20260712212316.png]]` (an optional `|<width>` suffix is display-only, e.g. `![[img.png|639]]`). Resolve each by reading `.mpx/board-files/<filename>` — the junction makes every vault attachment readable at a stable project-relative path. Never rely on the wikilink being a path; it is only a filename.

## Sections (H1 headings)

The board has **one predefined intake section**, `# To Process` — paste every note there regardless of whether it's a bug, task, or feature. The seed skeleton contains only this heading:

```markdown
# To Process
```

Type is inferred from each note's **content** at conversion time, not from any section it sits under.

### Type classification (from content)

`mp-board-to-issues` reads each note and picks the GitHub type label from what it describes:

| Note describes | Type label | Native? |
|---|---|---|
| a defect / something broken | `bug` | yes |
| a chore / audit / refactor | `task` | yes (custom) |
| a new capability or improvement | `enhancement` | yes |

### Lifecycle lanes (added as work progresses)

Two lanes are **not** part of the seed skeleton — they appear only once items reach them:

- `# MANUAL TESTING` — `mp-batch-execute` creates this heading (if absent) and moves an item here once implemented.
- `# ARCHIVE` — you create and use this lane yourself, moving items here after manually verifying the fix.

Items under either lane are never converted to issues.

## Item format

One board item is a single top-level checklist bullet under `# To Process`:

```markdown
- [ ] The edit-name button should be a ghost button, aligned with the name ![[Pasted image 20260715085802.png]]
```

An item may span continuation lines and carry multiple images. Related bullets may be merged into one issue at conversion time (conversion is not blindly 1:1).

## Checkbox lifecycle

An item moves through four states. The checkbox marker is the state machine:

| Marker | State | Set by | Side effect |
|---|---|---|---|
| `- [ ]` | intake — not yet processed | you | — |
| `- [/]` | GitHub issue created | `mp-board-to-issues` | append ` → #<N>` to the item |
| `- [x]` | implemented | `mp-batch-execute` | **move** the item to `# MANUAL TESTING` (creating the lane if absent) |
| (in `# ARCHIVE`) | manually verified, closed | **you** | you move it after checking the fix |

`mp-batch-execute` never auto-archives — the move to `# ARCHIVE` is a human step after manual verification confirms the fix.

### Issue-number annotation

When `mp-board-to-issues` creates issue `#142` from an item, it rewrites the marker and appends the reference:

```markdown
- [/] The edit-name button should be a ghost button ... ![[...]] → #142
```

`mp-batch-execute` matches a board item back to its issue by this ` → #<N>` annotation (or, in board-direct mode, by item text identity) to perform the `- [x]` + move-to-Manual-Testing write-back.

## Targeting the board (shared by both work skills)

There is a single intake section, so the work skills take no section argument for the board. `mp-board-to-issues` processes **every unchecked `- [ ]` item under `# To Process`**; `mp-batch-execute` in board-direct mode (`board`) does the same. Items already marked `- [/]` or `- [x]`, and anything under the lifecycle lanes, are skipped.
