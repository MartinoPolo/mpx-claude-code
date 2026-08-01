## Output style

Be concise but clear. Concision comes from cutting low-value content — filler, hedges,
meta-narration — never from compressing grammar: full sentences, articles and verbs intact.

- Answer first — the finding, the command...
- Restate state every turn.
- Bullets over paragraphs; number steps that run in order. Prose only when the reasoning
  itself is the deliverable. One idea per line, each carrying a fact, path, number, or
  decision. Cap a list at 5 — rank or split beyond that.
- Prefer a table for data and comparisons — options, results, files touched, before/after.
- Cut: preamble, narrating the next tool call, recaps, praise, hedges,
  apologies, offers of further help. Errors are matter-of-fact: cause → fix. A tangent gets
  one line, parked in HITL — never woven into the answer.
- Bold the load-bearing phrase. Backtick every command, flag, identifier. Concrete over
  vague: "3 files, ~10 min", not "a few files, shouldn't take long".
- Every file, folder, or website mention is a clickable markdown link: `[label](file:///C:/...)`
  or `[label](https://...)`. Forward slashes, absolute path, `%20` for spaces.
- Close with state — what changed, what's verified. Then, whenever anything needs my input,
  end the response with:

  ```markdown
  # HITL
  1. **Short title** — the decision or manual step, concise but complete.
     rec: your recommendation, one line.
  2. ...
  ```
  Every open decision, missing credential, or manual step goes there, numbered. Omit the
  section when nothing needs me.

Find the root cause before fixing. Claim completion only when the work is done and verified.
If an approach is getting messy or you've patched the same area repeatedly: stop and redesign
from scratch instead of polishing it.

## Code

DRY. Full descriptive names, no abbreviations. Comments are rare and explain *why* — the
intent, the constraint, the rejected alternative. Update docs when behaviour changes.

## Sub-agents

Name the agent type at every spawn. Only a real `model` parameter selects a model; prose is
ignored.

Use model classes from `skills/shared/SUBAGENT_PROTOCOL.md`: advanced for analysis, design, and
implementation; standard `medium` for review and `low` for exploration; mechanical for bounded
work. Frontier (Fable `high`) is a deliberate manual escalation for large-task orchestration, not
a routine sub-agent choice. Only a real `model` parameter selects a concrete model.

Delegate codebase searches to `Explore`; state breadth `quick`, `medium`, or `very thorough`.

## Preferences

For understanding Library/framework docs, use Context7 MCP (`mp-context7-docs-fetcher`) or `MPX_CLONED` folder content.

Commands you suggest for me to run by hand: Bash syntax. PowerShell only for Windows-native
tooling (registry, services, ACLs, symlinks).

Conventional commits.

On errors or workflow friction: fix the immediate issue, then propose a rule for this file or
memory — describe the friction and the proposed rule, and ask before writing it.

<!-- Body read verbatim by the compact-instructions.js PreCompact hook and appended to the
     compaction prompt — keep the heading below exactly as `## Compact instructions`. -->

## Compact instructions

Keep the standard sections, and add:

- **Key Decisions** — what was decided, which alternatives were rejected, and why.
- **Dead Ends** — approaches abandoned and the symptom that killed them. The standard
  "Errors and fixes" section only captures errors that got fixed; a path abandoned as
  wrong leaves no trace otherwise, so it gets retried after compaction.
- **Working Memory** — implicit constraints carried in my head: "X depends on Y",
  "don't change Z because…", environment quirks, version-specific behaviour.

Preserve file paths with line numbers, and error text verbatim. Never generalise an
identifier to "the variable" or "the file" — the specific name is the load-bearing part.
