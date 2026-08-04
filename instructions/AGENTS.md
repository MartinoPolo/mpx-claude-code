## Working principles

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
