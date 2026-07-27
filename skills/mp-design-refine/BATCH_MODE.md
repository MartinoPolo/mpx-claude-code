# Batch Mode

`/mp-design-refine all` — refine every design folder whose variant choice is recorded but
unprocessed. Step numbers refer to [SKILL.md](SKILL.md).

## A. Discover

Every direct subfolder of `designs/` where all three hold:

1. `variants/DECISION.md` exists
2. `SUMMARY.md` is absent
3. `refined.html` is absent

None qualify → report "No unprocessed DECISION.md folders found" and stop.

## B. Parse each DECISION.md

- **Variant letter** — from phrases like "let's refine Variant E", "go with B", "I prefer C"
  (case-insensitive). Ambiguous → take the last variant mentioned.
- **Refinements** — the full body, passed verbatim.

## C. Confirm

Print `| Folder | Variant | Refinement preview (first 80 chars) |` and ask "Proceed with refining
all N folders above?" Wait for confirmation.

## D. Process sequentially

One folder at a time, inline — no sub-agent. Sequential anyway to avoid filesystem conflicts, so
delegation would buy only context isolation at the cost of an uncontrolled effort level on
generative design work.

Per folder run Steps 2, 3, 5, 6, and 7 against that folder's variant letter and refinement text.
Defer component adoption (Step 4) and the GitHub work (Steps 8–10) — both run once across the
whole batch in section E, after the user has reviewed.

Print `✓ <folder> refined (Variant X)` after each. On failure, log it, continue to the next
folder, and carry it into the final summary.

Context grows with each folder. Past roughly five, refine in several passes rather than one run.

## E. Wrap up

Summary table of folders processed, skipped (with reasons), and failed, plus the adoption gaps
collected along the way. Then run Steps 4 and 8–9 in one pass across the successful folders.
