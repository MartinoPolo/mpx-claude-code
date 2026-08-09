# Issue Tracker Adapter

Skills speak in **abstract verbs**; this file resolves which concrete tracker CLI runs them for
the current repo. A skill reads this on demand — it does not embed `gh`, `kf`, or `glab` commands
of its own.

## Abstract verbs

| Verb | Meaning |
| --- | --- |
| **Log an issue/task** | Create a new tracked work item (title, body, labels). |
| **Fetch a ticket** | Read an issue/task in full — body plus comments. |
| **Comment on a task** | Append a comment/note. |
| **Apply / remove a label** | Set or clear a semantic label — always map it through § Label mapping first. |
| **Open a merge/pull request** | Open code review for a branch. |

## Resolution

Resolve the tracker fresh each run — there is no per-repo setup file to write. Take the first rule
that matches:

1. **`.mpx/kanbanflow.json` exists at the repo/worktree root** → tracker is **KanbanFlow via the
   `kf` CLI**; code review is **GitLab via the `glab` CLI**. (This file is written by `kf init`
   and committed, so its presence is the signal the board is wired up.)
2. **Else the repo has a GitHub remote** (`git remote -v` shows a `github.com` host) → tracker is
   **GitHub via the `gh` CLI** — issues and PRs both.
3. **Else** → **ask the user** which tracker to use before logging anything.

## Adapter — GitHub (`gh`)

Issues and PRs both live in the repo's GitHub. `gh` infers the repo from `git remote` inside a
clone.

| Verb | Command |
| --- | --- |
| Log an issue/task | `gh issue create --title "..." --body "..." --label "..."` (heredoc for a multi-line body) |
| Fetch a ticket | `gh issue view <n> --comments` |
| Comment | `gh issue comment <n> --body "..."` |
| Apply / remove a label | `gh issue edit <n> --add-label "..."` / `--remove-label "..."`; `gh label create "..." --color <hex>` when the label must exist first |
| Open a PR | `gh pr create --title "..." --body "..."` |

## Adapter — KanbanFlow (`kf`) + GitLab (`glab`)

Work items live on the KanbanFlow **board** (`kf`); code review lives on **GitLab** (`glab`) —
they are different systems in this stack. Board identity and the column mapping come from
`.mpx/kanbanflow.json`; a missing or broken file means the board is not wired up (the CLI exits
non-zero), so tell the human to run `kf init` rather than guessing.

| Verb | Command |
| --- | --- |
| Log an issue/task | `kf task create --name "..." [--to <state>] [--label <NAME>]`, then attach the full write-up with `kf comment add <ref> --file <path>` |
| Fetch a ticket | `kf task view <ref>` |
| Comment | `kf comment add <ref> --text "..."` (or `--file <path>`) |
| Apply / remove a label | `kf task edit <ref> --add-label <NAME>` / `--remove-label <NAME>` |
| Open a merge request | `glab mr create` — opened as a **draft**; the human reviews and merges |

`kf` **never creates labels** — it can only apply labels that already exist on the board. If a
label is refused as unknown, ask the human to add it once via the KanbanFlow UI; do not attempt to
create it from the CLI. Canonical board states for `--to` are `todo`, `wip`, `review`, `done`,
`archive`. Richer board workflow (grab, move, finish, AFK/HITL classification) is owned by the
`kf-task-*` skills — route there rather than re-deriving it here.

## Label mapping

The skills name **semantic** labels; each tracker realises them differently. KanbanFlow keeps
three independent axes — **column** (state), **color**, and **label** — so a tag that is a *label*
on GitHub may be a *color* or the *absence of a label* on KanbanFlow. Map, don't assume identical.

| Semantic label | GitHub (`gh`) | KanbanFlow (`kf`) |
| --- | --- | --- |
| `Design needed` | `Design needed` label — `gh label create` it if absent | `Design needed` board label; if the board lacks it, ask the human to add it via the UI |
| `HITL` | `HITL` label | **absence of the `AFK` label** — the default; there is nothing to apply |
| `AFK` | `AFK` label | `AFK` board label (`--add-label AFK`) — promotes a task to autonomous execution |
| `bug` | `bug` label | **red card color**, not a label (board convention: red = bug/critical) |
| `refactor` / `task` (type) | matching type label — `gh label create` it if absent | matching board label if one exists, else the card's column/color per the board's own convention |

When a skill hardcodes any other label, apply it as a board label under the same rule: `gh`
creates it on demand; `kf` requires it to already exist.
