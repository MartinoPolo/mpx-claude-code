# Board Convention

Shared single-source-of-truth for the Obsidian **board** workflow, referenced by `/mp:board-setup`, `/mp:board-to-issues`, and `/mp:batch-execute`. The board is a plain-markdown file that lives in an Obsidian vault (so pasted screenshots work) and is exposed inside the repo via two links under `.mpx/` (so agents can read requirements **and** images).

## Why a board

GitHub's issue API cannot round-trip images to an agent — an agent creating or reading an issue never sees pasted screenshots. Obsidian markdown embeds images as wikilinks that an agent **can** read. So visual bug notes are captured on the board first, then optionally converted to GitHub issues.

## Link layout (per project)

| Path in repo | Type | Target | Purpose |
|---|---|---|---|
| `.mpx/BOARD.md` | file symlink | `<vault>\Boards\<project>.md` | the board's text (requirements) |
| `.mpx/board-files/` | directory junction | `<vault>\Files` | the vault's shared attachments folder (images) |

Both are **gitignored** — they point outside the repo and are per-machine. The vault root comes from the `MPX_OBSIDIAN_VAULT` environment variable. `/mp:board-setup` creates all of this.

> **Writing back to the board:** because `.mpx/BOARD.md` is a real symlink, the Write/Edit tools may refuse to write through it ("Refusing to write through symlink"). Resolve it to the vault target (`<vault>\Boards\<project>.md`) and edit that real path directly.

### Image resolution

Board items reference screenshots as bare-filename wikilinks: `![[Pasted image 20260712212316.png]]` (an optional `|<width>` suffix is display-only, e.g. `![[img.png|639]]`). Resolve each by reading `.mpx/board-files/<filename>` — the junction makes every vault attachment readable at a stable project-relative path. Never rely on the wikilink being a path; it is only a filename.

## Sections (H1 headings) — the pipeline

The board is a four-lane pipeline. Every note starts in `# To Process`; the skills **move** it lane-by-lane as work progresses (they never delete or retype the note). `/mp:board-setup` seeds all four headings:

```markdown
# To Process

# Ready to implement

# Manual testing

# Archive
```

Paste every new note under `# To Process` regardless of whether it's a bug, task, or feature — type is inferred from the note's **content** at conversion time, not from the lane it sits in.

| Lane | Holds | An item arrives here via |
|---|---|---|
| `# To Process` | raw intake notes, not yet processed | you paste it |
| `# Ready to implement` | a GitHub issue exists (`→ #N` appended) | `/mp:board-to-issues` moves it |
| `# Manual testing` | implemented, awaiting your manual verification | `/mp:batch-execute` moves it |
| `# Archive` | you manually tested it and checked it off | you move it |

Only `# To Process` items are converted to issues; items in the other three lanes are skipped by both work skills.

### Type classification (from content)

`/mp:board-to-issues` reads each note and picks the GitHub type label from what it describes:

| Note describes | Type label | Native? |
|---|---|---|
| a defect / something broken | `bug` | yes |
| a chore / audit / refactor | `task` | yes (custom) |
| a new capability or improvement | `enhancement` | yes |

## Item format

One board item is a single top-level checklist bullet under `# To Process`:

```markdown
- [ ] The edit-name button should be a ghost button, aligned with the name ![[Pasted image 20260715085802.png]]
```

An item may span continuation lines and carry multiple images. Related bullets may be merged into one issue at conversion time (conversion is not blindly 1:1).

## State lives in the lane, not the checkbox

**The lane an item sits in is the state machine — not the checkbox.** A skill advances an item by **moving it to the next lane**, and leaves the checkbox marker exactly as it found it (always `- [ ]`). Agents never write `- [x]` or `- [/]`.

The checkbox belongs to **you**: it is your manual-verification flag. While an item sits in `# Manual testing` you test the fix, and once you've confirmed everything was done you check it (`- [ ]` → `- [x]`) and move it to `# Archive`. Because agents never touch the checkbox, a checked box always means *you* verified it — never that a script assumed the work was done.

| Step | Who | Board effect | Checkbox |
|---|---|---|---|
| paste a note | you | add `- [ ]` under `# To Process` | `- [ ]` |
| GitHub issue created | `/mp:board-to-issues` | move item to `# Ready to implement`, append ` → #<N>` | unchanged `- [ ]` |
| implemented | `/mp:batch-execute` | move item to `# Manual testing` | unchanged `- [ ]` |
| manually verified | **you** | check the box, then move to `# Archive` | `- [ ]` → `- [x]` |

### Issue-number annotation

When `/mp:board-to-issues` creates issue `#142` from an item, it appends the reference and moves the item, leaving the marker `- [ ]`:

```markdown
# Ready to implement

- [ ] The edit-name button should be a ghost button ... ![[...]] → #142
```

`/mp:batch-execute` matches a board item back to its issue by this ` → #<N>` annotation (or, in board-direct mode, by item text identity) to move it from `# Ready to implement` to `# Manual testing`.

## Targeting the board (shared by both work skills)

`# To Process` is the only intake lane, so the work skills take no section argument. `/mp:board-to-issues` processes **every `- [ ]` item under `# To Process`** (skipping any that already carry a `→ #N` annotation); `/mp:batch-execute` in board-direct mode (`board`) does the same. Items in `# Ready to implement`, `# Manual testing`, and `# Archive` are never re-processed.
