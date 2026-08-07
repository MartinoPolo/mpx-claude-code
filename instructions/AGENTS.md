## Working principles

Find the root cause before fixing. Claim completion only when the work is done and verified.
If an approach is getting messy or you've patched the same area repeatedly: stop and redesign
from scratch instead of polishing it.

## Code

DRY. Full descriptive names, no abbreviations. Comments are rare and explain _why_ — the
intent, the constraint, the rejected alternative. Update docs when behaviour changes.

Avoid numeric values describing repo state in comments, docs, skills, reference files. These drift over time and are not useful to readers. Instead, describe general shape or place to find.

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
