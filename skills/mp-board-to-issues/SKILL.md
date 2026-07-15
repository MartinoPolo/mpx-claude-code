---
name: mp-board-to-issues
description: 'Convert Obsidian board notes (with pasted screenshots) into GitHub issues: read unchecked items from a board section, merge related notes and dedup against existing issues, estimate size, classify AFK/HITL, create labelled issues, and mark each board item [/] with its issue number. Use when: "board to issues", "convert board", "notes to issues", "board notes to github"'
argument-hint: "[section: BUGS | TASKS | FEATURES]"
allowed-tools: Read, Edit, AskUserQuestion, Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.2"
  category: project-management
---

# mp-board-to-issues

Turn board notes into well-formed GitHub issues. See [BOARD_CONVENTION.md](../shared/BOARD_CONVENTION.md) for board format, section→label map, and the checkbox lifecycle; issue bodies and labels follow [GITHUB_ISSUE_TEMPLATE.md](../shared/GITHUB_ISSUE_TEMPLATE.md). $ARGUMENTS

## Rules

- Conversion is **not** blindly 1:1 — merge related bullets into one issue, and skip notes that duplicate an existing open issue.
- Classify HITL only for genuine **unanswered requirement questions**. Visual inspection, manual testing, and QA are not HITL reasons.

## Step 1: Resolve target + read board

Resolve the target section from the argument (`BUGS` / `# BUGS` / `section:BUGS`, per BOARD_CONVENTION); with no argument, target all three intake sections (`# BUGS`, `# TASKS`, `# FEATURES`). Read `.mpx/BOARD.md`.

## Step 2: Collect items

Collect each unchecked `- [ ]` bullet under the target section(s); skip items already marked `- [/]` or `- [x]`. For each item, capture its text (including continuation lines) and every `![[...]]` image wikilink, and **read each image** at `.mpx/board-files/<filename>` so the visual context informs the issue.

## Step 3: Merge + dedup

Group bullets that describe the same fix into a single proposed issue. Check for duplicates against existing issues with `gh issue list --state open --search "<keywords>"` (and `gh search issues` when useful); mark likely duplicates to skip, noting the existing issue number.

## Step 4: Draft each issue

For each proposed issue:

- **Body** — follow the GITHUB_ISSUE_TEMPLATE structure (`## Description`, `## Requirements` as REQ-1..N, `## Acceptance Criteria`, `## Notes`). Reference the screenshots in `## Notes`.
- **Size** — estimate `size:S` (single file / few lines), `size:M` (multi-file, contained), or `size:L` (cross-cutting) from complexity.
- **AFK vs HITL** — AFK when scope is clear; HITL when a requirement question is unanswered (add the `> **Unanswered questions:**` blockquote).
- **Labels** — section→type (`# BUGS`→`bug`, `# TASKS`→`task`, `# FEATURES`→`enhancement`) + exactly one of `AFK`/`HITL` + `size:<X>` + inferred `area:*`.

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

For each created issue, `Edit` its board item: change `- [ ]` → `- [/]` and append ` → #<N>` (the issue number). This is the annotation `mp-batch-execute` uses to close the loop.

## Step 8: Offer to resolve HITL

If any HITL issues were created, offer to resolve them now by running `/mp-hitl` (grill the open questions → flip `HITL`→`AFK`), which makes them batch-executable.

## Report

List: created issues (number, title, labels, size), merged bullets, skipped duplicates (with the existing issue number), and any HITL issues awaiting resolution.
