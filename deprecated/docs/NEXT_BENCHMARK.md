# Next benchmark session — paste this as the opening prompt

> **Deprecated 2026-08-01.** All three questions below were answered by the July 2026
> round: haiku stays on `mp-checker`/`mp-git-committer` but lost `mp-pr-manager` to
> sonnet, `mp-reviewer-*` pinned to `effort: medium`, and `Explore`'s `effort: low` pin
> confirmed on the real agent. Verdicts are in `skills/shared/SUBAGENT_PROTOCOL.md` § 7;
> raw tables in `docs/SUBAGENTS.md` § Benchmark evidence.
>
> Kept for the **methodology rules** below — each fixes a real failure and applies to any
> future round. Still open, if a next round happens: `mp-context7-docs-fetcher`
> (unbenchmarked), effort for `mp-scanner-architecture` and `mp-issue-analyzer`, and
> whether the `Explore` override corrects nested spawns.

Run a sub-agent capability benchmark for this repo (`C:\_MP_projects\mpx-claude-code`).
You have explicit opt-in to use the `Workflow` tool and as many sub-agents as needed.

Read `skills/shared/SUBAGENT_PROTOCOL.md` § 7 first for the previous round's verdicts
and their `TESTED` / `UNVERIFIED` tags; the raw result tables live in
`docs/SUBAGENTS.md` § Benchmark evidence. Do not re-derive what they already establish.

## Three open questions

### Q1 — Is haiku 4.5 good enough for the five mechanical agents?

Five agents are pinned `model: haiku` and have never been tested: `mp-checker`,
`mp-git-committer`, `mp-pr-manager`, `mp-issue-finder`, `mp-context7-docs-fetcher`.
A previous round showed haiku flailing badly on *search* (20+ tool calls, 1.5M cache
reads, ending up more expensive per task than sonnet) — but that was search, and these
are mechanical. The extrapolation was explicitly refused as unsound. Settle it.

Build tasks that mirror each agent's real contract, not synthetic ones:
- `mp-checker` — run a repo check command, correctly report pass/fail and the failing
  output without attempting a fix.
- `mp-git-committer` — stage a prepared dirty tree, produce a conventional commit message
  matching this repo's convention, return its structured JSON result.
- `mp-pr-manager` — compose PR title/body from a real branch diff; title must carry the
  `#N` issue prefix per repo convention.
- `mp-issue-finder` — given a branch diff, find which GitHub issue it closes.
- `mp-context7-docs-fetcher` — blocked until Context7 is registered (see Setup).

Arms: `haiku` (no effort — it is inert on haiku) vs `sonnet` at `low`. The question is
not "is haiku as smart" but "does haiku cost less *per completed task* after retries and
tool-call flailing". Report cost per task, not per token, and report tool-call counts.
Recommend keep-or-promote per agent individually.

### Q2 — Effort for reviewing and analysis (`UNVERIFIED` in § 7)

`mp-reviewer-*` (7), `mp-scanner-architecture`, `mp-issue-analyzer` deliberately have no
`effort:` set, so they inherit session effort. Benchmark review-shaped work — seeded real
defects in a real diff — across sonnet `low` / `medium` / `high`. Measure recall of
seeded defects AND false-positive rate; a reviewer that reports more is not better.

### Q3 — Does `agents/Explore.md`'s `effort: low` pin hold for the real agent?

The pin is an extrapolation: the previous benchmark spawned default workflow sub-agents,
not `Explore` itself. Spawn the actual `Explore` agent (via the `Agent` tool, omitting
`model` — it declares its own) and confirm `low` matches `medium` on real multi-hop
searches. Also test whether `Explore.md`'s 36-line body helps or hurts against
`SUBAGENT_PROTOCOL.md` § 4's "keep the body thin" rule.

## Setup required before benchmarking

1. **Register the Context7 MCP server.** It is currently unregistered — verify with
   `ToolSearch` yourself before trusting any agent that claims it is available. Until it
   is registered, `mp-context7-docs-fetcher` cannot be benchmarked and is in fact broken
   in production: its `tools:` allowlist is only the two MCP tools plus `Read`, so it
   cannot degrade to WebSearch, it just fails.
2. **Do not reuse `prejemesi/storybook-static/`** for browser tests — it is a stale build
   (2026-05-31) whose story IDs no longer match source (2026-07-13). Run `pnpm storybook`
   against live source, or derive ground truth from the built artifact itself.

## Methodology rules — each fixes a real failure from last round

- **Derive ground truth from the exact artifact under test**, never from source that may
  have drifted from the build. Last round the rubric described UI that did not exist,
  which would have rewarded hallucination instead of penalising it.
- **Verify tool availability yourself** before scoring any arm on tool use. Last round a
  whole suite silently measured WebSearch fallback instead of Context7.
- **Guard structured output.** Two agents satisfied the schema with the literal string
  `"test"` and scored 0, which looked like capability failure but was a harness artifact.
  Add a minimum-length / sanity check and re-run any arm that trips it.
- **Label agents in the workflow journal.** `journal.jsonl` records no labels, so mapping
  agents back to arms required content-sniffing and was only ±1 accurate. Return the arm
  key inside each agent's structured result.
- **Design tasks that can discriminate.** Two rounds running, exploration tasks saturated
  at 100% for most arms — they separated cost, never quality. Include tasks hard enough
  that some arm actually fails, or state plainly that the result bounds cost only.
- **Report per-task cost**, and state whether sonnet intro pricing ($2/$10, ends
  2026-08-31) or standard ($3/$15) was used.

## Deliverable

Concrete `model:` / `effort:` recommendations per agent, each tagged `TESTED` or
`UNVERIFIED`, ready to fold into `SUBAGENT_PROTOCOL.md` § 7 (verdicts) and
`docs/SUBAGENTS.md` § Benchmark evidence (raw tables). Update `README.md` in the
same change per repo convention. Flag any recommendation the data does not actually
support rather than filling the table.
