---
name: mp-board-to-issues
description: "Converts Obsidian board notes from the To Process lane into labelled GitHub issues, deduping against existing ones."
argument-hint: "[optional guidance]"
disable-model-invocation: true
allowed-tools: Read, Edit, AskUserQuestion, Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.5"
  category: project-management
---

# mp-board-to-issues

Turn board notes into well-formed GitHub issues. $ARGUMENTS

First:

1. Read `${CLAUDE_SKILL_DIR}/../shared/BOARD_CONVENTION.md` now — board format, content→type classification, and the four-lane pipeline (state lives in the lane, not the checkbox).
2. Read `${CLAUDE_SKILL_DIR}/../shared/GITHUB_ISSUE_TEMPLATE.md` now — issue bodies and labels follow it.

## Rules

- Conversion is **not** blindly 1:1 — merge related bullets into one issue, and skip notes that duplicate an existing open issue.
- Classify HITL only for genuine **unanswered requirement questions**. Visual inspection, manual testing, and QA are not HITL reasons.

## Step 1: Read the board

Read `.mpx/BOARD.md`. Fresh notes live under the single `# To Process` intake lane — there is no section argument. Any `$ARGUMENTS` is optional free-text guidance (e.g. "only the login bug"), not a section selector.

## Step 2: Collect items

Collect each `- [ ]` bullet under `# To Process`; skip any that already carry a `→ #<N>` annotation (already has an issue), and ignore everything under the downstream lanes (`# Ready to implement`, `# Manual testing`, `# Archive`). Do **not** interpret the checkbox as state — it is the user's manual-verification flag, not a processing marker. For each item, capture its text (including continuation lines) and every `![[...]]` image wikilink, and **read each image** at `.mpx/board-files/<filename>` so the visual context informs the issue.

## Step 3: Merge + dedup

Group bullets that describe the same fix into a single proposed issue. Check for duplicates against existing issues with `gh issue list --state open --search "<keywords>"` (and `gh search issues` when useful); mark likely duplicates to skip, noting the existing issue number.

## Step 4: Draft each issue

For each proposed issue:

- **Body** — follow the GITHUB_ISSUE_TEMPLATE structure (`## Description`, `## Requirements` as REQ-1..N, `## Acceptance Criteria`, `## Notes`). Reference the screenshots in `## Notes`.
- **Size** — estimate `size:S` (single file / few lines), `size:M` (multi-file, contained), or `size:L` (cross-cutting) from complexity.
- **AFK vs HITL** — AFK when scope is clear; HITL when a requirement question is unanswered (add the `> **Unanswered questions:**` blockquote).
- **Type** — infer from the note's content (per BOARD_CONVENTION): a defect → `bug`, a chore/audit/refactor → `task`, a new capability or improvement → `enhancement`. The note's position on the board carries no type information.
- **Labels** — the inferred type + exactly one of `AFK`/`HITL` + `size:<X>` + inferred `area:*`.

## Step 5: Confirm before creating

Present the full plan with `AskUserQuestion`: each board bullet → proposed issue(s), labels, size, AFK/HITL, and any duplicates being skipped. Only create issues after the user confirms the plan (they may edit it).

## Step 6: Create issues

Create each confirmed issue:

```bash
gh issue create --title "<title>" --label "<type>,<AFK|HITL>,size:<X>,area:<..>" --assignee @me --body "$(cat <<'EOF'
<body per GITHUB_ISSUE_TEMPLATE>
EOF
)"
```

## Step 7: Write back to the board

For each created issue, `Edit` `.mpx/BOARD.md` to **move** its item from `# To Process` to `# Ready to implement` and append ` → #<N>` (the issue number) to the item text. **Leave the checkbox marker as `- [ ]` — never write `- [x]` or `- [/]`; the checkbox is the user's alone.** The `→ #<N>` annotation is what `mp-batch-execute` uses to close the loop. (`.mpx/BOARD.md` is a symlink — if Edit/Write refuses it, resolve to the real vault path and edit that; see BOARD_CONVENTION.)

## Step 8: Offer to resolve HITL

If any HITL issues were created, offer to resolve them now by running `/mp-hitl` (grill the open questions → flip `HITL`→`AFK`), which makes them batch-executable.

## Report

List: created issues (number, title, labels, size), merged bullets, skipped duplicates (with the existing issue number), and any HITL issues awaiting resolution.
