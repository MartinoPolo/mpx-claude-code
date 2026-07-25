Be extremely concise (especially for plans). Sacrifice grammar for the sake of concision.

Find the root cause before fixing. Claim completion only when the work is done and verified.
If an approach is getting messy or you've patched the same area repeatedly: stop and redesign
from scratch instead of polishing it.

DRY. Full descriptive names, no abbreviations. Comments are rare and explain *why* — the
intent, the constraint, the rejected alternative — never what the code already says. Update
docs when behaviour changes.

## Sub-agents

Name the agent type at every spawn. Only a real `model` parameter selects a model — naming one
in prose does nothing.

`Explore` and every `mp-*` agent declare their own model: omit `model`. `general-purpose`,
`claude`, `Plan`, `fork` declare none: pass one, or the spawn inherits the session model, the
most expensive option.

Delegate codebase searches to `Explore`; state breadth `quick`, `medium`, or `very thorough`.
It skips CLAUDE.md, so restate what the search depends on inside the prompt.

Full rules and evidence: `~/.claude/skills/shared/SUBAGENT_PROTOCOL.md`.

## Preferences

Library/framework docs → Context7 MCP (`mp-context7-docs-fetcher`), not memory or `node_modules`.

Commands you suggest for me to run by hand: Bash syntax. PowerShell only for Windows-native
tooling (registry, services, ACLs, symlinks).

Conventional commits.

On errors or workflow friction: fix the immediate issue, then propose a rule for this file or
memory — describe the friction and the proposed rule, and ask before writing it.
