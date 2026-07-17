# Session Handoff

Date: 2026-07-15

Authored from a `prejemesi` session, but all deliverables live in **`mpx-claude-code`** — that's why this handoff is here.

## Progress This Session

Designed (via `/mp-grill`) and built (via `/mp-skill-create`) a three-skill **Obsidian board → GitHub issues → orchestrated batch-fix → verify** workflow. New files, **uncommitted**:

- `skills/shared/BOARD_CONVENTION.md` — DRY single-source spec the other three reference.
- `skills/mp-board-setup/SKILL.md` + `scripts/link-board.ps1` — one-time/project setup.
- `skills/mp-board-to-issues/SKILL.md` — board notes → GitHub issues.
- `skills/mp-batch-execute/SKILL.md` + `REFERENCE.md` — orchestrated batch executor.

Two cleanup fixes already **committed (unpushed)** in this repo:

- `32acb14` `fix(mp-check-fix): remove stale duplicate detect-check-scripts.sh` (orphaned copy missing TEST/TEST_UNIT/TEST_E2E detection; SKILL.md already pointed at the canonical script).
- `8f2a379` `fix(skills): use canonical "design needed" label spelling to prevent duplicate` (7 refs across `mp-to-issues`, `mp-issue-create`, `shared/GITHUB_ISSUE_TEMPLATE.md`).

In the **prejemesi GitHub repo**: deleted the duplicate label `design-needed` (kept spaced `design needed`; 0 issues needed migration).

Set **`MPX_OBSIDIAN_VAULT`** (User env) = `C:\Users\snapy\OneDrive\Obsidian\ObsidianMP`.

Validated: convention audit clean, `link-board.ps1` parses, all SKILL.md < 200 lines (30/44/58).

## Key Decisions

- **Two work skills + one setup skill + shared reference**, not one mega-skill — matches `mp-*` decomposition; board→issues needs a human confirm (conversion is not 1:1); `mp-batch-execute` must also run on plain issue ranges with no board.
- **Board of record in Obsidian; repo gets `.mpx/BOARD.md` symlink + `.mpx/board-files` junction → vault `Files`; both gitignored.** Why: image-paste only works in Obsidian, and `attachmentFolderPath` is the global `Files` folder, so pasted images live vault-wide (not next to the note). Option A (junction for images) chosen over env-var-only so agents get a stable project-relative path to images with zero runtime config.
- **Sequential fix-agents on one shared branch** as v1 default — shared working tree means parallel commits race the git index. `--parallel` via Agent `isolation:"worktree"` is documented as experimental in `mp-batch-execute/REFERENCE.md`.
- **Sections (H1):** `# BUGS` `# TASKS` `# FEATURES` (intake) + `# MANUAL TESTING` (agent-done) + `# ARCHIVE` (user-managed). Lifecycle: `- [ ]` → `- [/]` (+ ` → #N`) → `- [x]` (moved to Manual Testing) → user archives.
- **Labels:** section→type (`bug`/`task`/`enhancement`) + `AFK`|`HITL` (uppercase) + `size:S|M|L` (colon, matches prejemesi) + inferred `area:*`.
- **Verify gate** reuses `mp-execute` Steps 5/6 + `$HOME/.claude/scripts/detect-check-scripts.sh` + `mp-checker`. Playwright: raw only (no MCP), **stale-worktree sanity-gate FIRST**, never `networkidle`, concrete commands deferred to each project's `AGENTS.md`/memory.

## Dead Ends & Mistakes

- **A single `.md` symlink does NOT make images resolvable.** Wikilinks are bare filenames (`![[Pasted image ...png]]`) resolved by Obsidian's vault-wide search, not filesystem paths. Confirmed via `.obsidian/app.json` `attachmentFolderPath:"Files"` + 153 flat images in the vault `Files/`. That's why the image junction is required — don't try to solve it with relative paths.
- The `mp-check-fix` "bug" was subtler than briefed: the SKILL.md already used the canonical script (fixed earlier in `f2bfc1d`); only an orphaned stale copy remained, so the fix was deletion, not a repoint.

## Next Steps

1. **Commit the 5 new skill files** to `mpx-claude-code` (separate commit, e.g. `feat(skills): add Obsidian board workflow (setup/to-issues/batch-execute)`). Awaiting user go-ahead.
2. **Update `README.md` "Skills Reference"** to list `mp-board-setup`, `mp-board-to-issues`, `mp-batch-execute` (+ mention `shared/BOARD_CONVENTION.md`). Consider the existing `obsidian` category.
3. **First real use / smoke test** in prejemesi: run `/mp-board-setup` (needs Windows Developer Mode for the `.mpx/BOARD.md` file symlink; the junction works without). Then migrate the existing bug bullets out of `DareckyDashboard.md` into the new dedicated `Boards/prejemesi.md`.
4. Optional belt-and-suspenders: teach `mp-to-issues`/`mp-issue-create` to match either `design needed` spelling so the duplicate can't reappear even if someone runs an old copy.

## Critical Files

- `skills/shared/BOARD_CONVENTION.md` — the spec all three skills follow; edit here first to change conventions.
- `skills/mp-board-setup/scripts/link-board.ps1` — idempotent symlink/junction/gitignore setup.
- `skills/mp-batch-execute/REFERENCE.md` — parallel-worktree mode + Playwright contract.
- `WINDOWS-SETUP.md` — symlink/junction command reference (junction = no admin; file symlink = Dev Mode/elevation; use the PowerShell tool, not Bash `mklink`).
- `scripts/detect-check-scripts.sh` — canonical check/test detector reused by the verify gate.

## Working Memory

- `MPX_OBSIDIAN_VAULT = C:\Users\snapy\OneDrive\Obsidian\ObsidianMP` (User env, set this session). `mp-board-setup` reads it; else it prompts.
- `mpx-claude-code` is symlinked into `~/.claude`, so the new skills are already live in the skill list for the current session. The two cleanup commits are unpushed; the 5 skill files are uncommitted.
- On Windows: directory junctions need no admin; file symlinks need Developer Mode or elevation. In Claude Code, create them with the **PowerShell tool** (`New-Item -ItemType SymbolicLink` / `-ItemType Junction`) — Bash/cmd `mklink` mangles quotes.
- The reference workflow this was modeled on = session `93356bca` (2026-07-13): board → 8 issues (#136–143) → sequential fixes on `fix/redesign-size-s-batch` → PR #144. The verify pass caught a **stale-worktree false-PASS** (`:5173` served a different worktree) — that incident is why the sanity-gate is load-bearing.
- Don't run two commit-making sub-agents in the same repo concurrently — git index race. Sequence them.
