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

### Image resolution

Board items reference screenshots as bare-filename wikilinks: `![[Pasted image 20260712212316.png]]` (an optional `|<width>` suffix is display-only, e.g. `![[img.png|639]]`). Resolve each by reading `.mpx/board-files/<filename>` — the junction makes every vault attachment readable at a stable project-relative path. Never rely on the wikilink being a path; it is only a filename.

## Sections (H1 headings)

The board has five H1 sections. The first three are **intake** (you paste notes there); the last two are **lifecycle lanes**.

```markdown
# BUGS

# TASKS

# FEATURES

# MANUAL TESTING

# ARCHIVE
```

### Section → GitHub label map (intake sections only)

| Section | Type label | Native? |
|---|---|---|
| `# BUGS` | `bug` | yes |
| `# TASKS` | `task` | yes (custom) |
| `# FEATURES` | `enhancement` | yes |

`# MANUAL TESTING` and `# ARCHIVE` are lanes, not intake — items there are never converted to issues.

## Item format

One board item is a single top-level checklist bullet under a section:

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
| `- [x]` | implemented | `mp-batch-execute` | **move** the item to `# MANUAL TESTING` |
| (in `# ARCHIVE`) | manually verified, closed | **you** | you move it after checking the fix |

`mp-batch-execute` never auto-archives — the move to `# ARCHIVE` is a human step after manual verification confirms the fix.

### Issue-number annotation

When `mp-board-to-issues` creates issue `#142` from an item, it rewrites the marker and appends the reference:

```markdown
- [/] The edit-name button should be a ghost button ... ![[...]] → #142
```

`mp-batch-execute` matches a board item back to its issue by this ` → #<N>` annotation (or, in board-direct mode, by item text identity) to perform the `- [x]` + move-to-Manual-Testing write-back.

## Section selection syntax (shared by both work skills)

A section argument accepts the bare section name, case-insensitive, with or without leading `#`(s): `BUGS`, `# BUGS`, and `section:BUGS` all select `# BUGS`. Omitting the section targets all three intake sections.
