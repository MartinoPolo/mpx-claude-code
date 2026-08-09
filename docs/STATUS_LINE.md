# Status Lines — Design & Implementation

Design decisions and mechanics behind [`scripts/status-line.mts`](../scripts/status-line.mts)
(main bar) and [`scripts/subagent-status-line.mts`](../scripts/subagent-status-line.mts)
(tasks panel). The README carries the feature overview; this file records *why* each thing is the
way it is, and the constraints that are easy to trip over. Layout, colors and glyphs are chosen
against Windows Terminal with the `Cascadia Mono, Symbols Nerd Font` fallback pair.

## Main status line — layout decisions

- **One separator.** ` · ` (U+00B7) means "next field" everywhere; there is no second rank of
  separator.
- **The location row is only project/worktree and branch.** The dev-server ports and the MR/PR
  block move to a row of their own (`buildServersAndReviewLine`), indented beneath it: the worktree
  path and branch can each run long, and trailing that state behind them pushed it off the right edge.
- **Branch state has its own row too.** Its counts grow without bound during a session; it is
  indented beside the servers/review row, both reading as a detail of the location above.
- **The directory name is the only white field.** It answers "where am I", asked most often and
  from furthest away; every other field on that row stays grey. In a worktree the white moves to
  the worktree half of `project/worktree`, the actual location.
- **The first line is title · id** — what the session is about, how to refer to it. The account is
  *not* named here: the pane background already answers "which account is this" (see
  [Account background](#account-background)).
- **Effort is a gauge, not a word.** `◆◆◆◇◇` (high) reads at a glance; five slots for the five
  levels `low medium high xhigh max`, anything unrecognized falls back to `<level>` text.
- **Dim grey is for context, not signal.** Fetch age, cache ages, quota countdowns, session cost
  and a compaction's clock all render dim — they qualify the number beside them rather than
  demanding attention. The one exception is a quota cache old enough that its percentages are
  wrong, which goes coral.
- **The session name is the only field with weight** — bold, the scheme's bright purple lifted
  toward white. It is the title of the thing you are looking at, found before anything else.
- **An empty row is dropped, not emitted blank** — outside a repo the branch-state row has no
  content, so the rows below move up.

## Two-column layout

The left column (session, model, location, branch state, context/cost, compaction, quota) keeps the
left edge; the finished-agent ledger is **pinned to the right**, filling the gutter beside the short
left rows instead of stacking below them. `composeColumns` does this after both columns are built.

- **Width comes from `$COLUMNS`**, which Claude Code exports for the status-line command (there is no
  width in the stdin JSON — that field exists only in the *sub-agent* panel's payload). With no width
  the composer falls back to stacking, which is the layout that existed before, so an older Claude
  Code or an odd environment degrades rather than breaks.
- **The block starts on the first row.** When the bar fills the width, Claude Code relocates its own
  right-aligned indicators (remote-control `/rc`, the queued-agent count) to their own rows below the
  bar, so the first row's right edge is free for the ledger.
- **The whole block pins at one column** (`columns - widestLedgerLine`), so the ledger's table stays
  vertically aligned; only its widest line reaches the right margin. A left row too wide to seat its
  next ledger line beside it leaves that line for a later row, and any ledger lines with no left row
  to share fall to their own pinned rows below — the ledger stays in order and contiguous either way.
- **A pinned row leads with the U+2800 guard**, not spaces, for the same reason the nested rows do:
  Claude Code trims leading whitespace off every row, and the guard survives it.
- **Widths are measured with `visibleWidth`** (`lib/statusline-ansi.mts`), which strips SGR runs and
  OSC-8 hyperlink wrappers and then counts cells. It counts Private Use Area Nerd Font icons and
  emoji as **two** cells deliberately over-inclusively: a line measured too narrow would let the right
  column run past the margin and wrap, breaking the layout, whereas measuring an icon row a cell too
  wide only shifts that one row's right column left by a cell. When it cannot fit the block beside the
  left column at all (`columns - widestLedgerLine < 2`), it falls back to stacking.

## Data sources

Most values come straight from Claude Code's stdin JSON: model, session name/id, effort, context
(`context_window.used_percentage` + `total_input_tokens`), cost, and quota (`rate_limits`). Two
values are not in the payload and are read from files it points at or names by convention —
compaction history (from `transcript_path`, see [Compaction history](#compaction-history)) and
sub-agent history (see [Sub-agent history on the main bar](#sub-agent-history-on-the-main-bar)).

Quota reads `rate_limits` with no network call, keeping a cached last-known value; a background
`/api/oauth/usage` fallback runs only at session cold-start so the endpoint's rate limit is never
hit in normal use. A stale cache shows a muted age note, and a very old one is flagged coral
because the percentages themselves can no longer be trusted.

## Compaction history

Claude Code writes one `compact_boundary` line into a session's transcript on every compaction:

```json
{ "type": "system", "subtype": "compact_boundary", "timestamp": "…",
  "compactMetadata": { "trigger": "auto", "preTokens": 227148, "postTokens": 11300,
                       "cumulativeDroppedTokens": 215848, "durationMs": 87407 } }
```

Only `trigger` and `preTokens` are documented; `parseCompactionEvent` defaults every field it
cannot read rather than dropping the event, because the transcript format changes between versions.

**Sub-agents compact independently**, each writing its own transcript at
`<session>/subagents/agent-<id>.jsonl` keyed by the panel payload's `task.id` — which is what lets
a panel row show its own history.

**The read is incremental.** Transcripts reach tens of megabytes and both renderers run every
tick, so `$TMPDIR/claude-compact-<key>.tsv` holds the byte offset already scanned plus the events
found; each tick parses only the appended bytes. Three details make that correct:

- The offset is **bytes**, not characters, so one emoji in a tool result cannot drift it.
- A tick can land mid-line while Claude Code is still writing, so a trailing partial line is left
  unconsumed and re-read next time instead of being parsed and lost.
- An offset *ahead* of the file means the transcript was replaced or truncated (a resumed session
  forks a new file), which restarts the scan from zero.

**Layout.** One indented row per event, oldest first, under the context line that owns them (the
tasks panel indents two spaces deeper so its rows nest under an agent). Only the last
`COMPACTION_ROWS` are spelled out; the rest collapse into `N earlier`. `auto` is amber (the only
field on the row you did not decide), `manual` and the token change stay at reading weight, the
clock is dim.

## The context bar and `autoCompactWindow`

The bar fills toward the **auto-compaction limit**, not the model window — a full bar means
compaction is about to fire, the only threshold on the line anyone acts on.

The limit is `min(context_window_size, autoCompactWindow) - reserve`, where the reserve is
`min(maxOutputTokens, 20000) + 13000` read off the bundle. **It is an offset, not a fraction** —
moving the trigger means moving `autoCompactWindow`, not scaling it. `settings.json` sets
`autoCompactWindow`.

Context escalation is a fraction of that limit (50% / 70% / 90%), so the cut-offs follow
`autoCompactWindow` instead of silently meaning less each time it is raised. The bar takes the same
escalating color, so bar and token count cannot disagree.

The percentage in `118k (11%)` reads against the **model window**, deliberately: the bar answers
"how close am I to losing history", the percentage answers "how much of the window am I using".
Two questions, two denominators.

## Click targets

Almost every identifier on the line is an OSC-8 hyperlink to the thing it names:

| Click | Opens |
| --- | --- |
| project / worktree name | Explorer in that folder |
| VS Code glyph beside a name | VS Code in that folder |
| terminal glyph beside a name | a new Windows Terminal tab in that folder, same profile |
| branch name | the branch on its remote (`.../tree/<branch>`, GitLab `/-/tree/`) |
| `↑3` unpushed count | the compare view of the default branch against this one |
| `:8100` port | `localhost:8100` over the scheme the probe saw it speak |
| pencil glyph after the ports | `statusline-projects.json`, where the ports live |
| session id | the session's transcript `.jsonl` |
| `5h` / `7d` quota labels | the claude.ai usage dashboard |

**The branch URL** comes from `git remote get-url origin`, normalised from any of the three remote
spellings (scp-like, `ssh://`, `https://`) with `.git` stripped and the tree path picked by host
(GitLab nests under `/-/`). No parseable remote → plain text, no link.

**The unpushed count links to the compare view** (`.../compare/<default>...<branch>`), the page
that offers to open a PR/MR. The base branch is resolved from `git for-each-ref` over
`refs/remotes/origin/{HEAD,main,master}` — refs only, because resolving it over the network is the
kind of wait a status line cannot afford. The ref read happens only when something is ahead.

**Worktrees split into two click targets.** `git rev-parse --path-format=absolute
--git-common-dir --show-toplevel` reveals a linked worktree (the shared `.git` lives under the
main checkout, so `dirname(--git-common-dir)` differs from `--show-toplevel`). The line then
renders `project/worktree` — project grey linking the original folder, worktree white linking the
worktree — and each half carries its own VS Code glyph opening its own checkout.

**Dev-server ports** follow the branch segment, declared per project in `statusline-projects.json`
at the repo root (worktrees inherit their project's entry). Each renders as `:8100` hyperlinked
into the browser, green while something listens and dim while nothing does. Liveness comes from a
cache written by a detached `--warm-ports` child that probes each port with a short timeout; the
render never opens a socket. Which process belongs to which project is not auto-detected — a dev
server is usually a `node` grandchild whose working directory Windows will not cheaply reveal —
hence the config.

The probe decides the **scheme** as well as the state, both load-bearing:

- It dials `localhost`, not `127.0.0.1`, so Node's happy-eyeballs tries both address families. A
  server bound to `::1` only (which Vite does routinely) otherwise probes as down.
- Once connected it attempts a TLS handshake: completed → `https`, rejected → `http`. Getting this
  wrong is not graceful — an `http://` request to a TLS listener returns zero bytes and the browser
  reports `ERR_EMPTY_RESPONSE`, which looks like a broken server rather than a wrong URL. A down
  port has no known scheme and falls back to `http`.

A project with no entry renders a dim `pencil ports` hint in the same place, which is how a fresh
project discovers the feature.

**Editor and terminal links are indirect, because Windows Terminal opens a hyperlink only when its
scheme is `http`, `https` or `file`.** `vscode://` cannot be emitted directly, so the VS Code glyph
links to a generated `$TMPDIR/claude-open-<key>.url` shortcut holding the `vscode:` URL — opening a
`.url` hands its URL to the shell, which dispatches `vscode:` to VS Code. The file is inert data and
is rewritten every render so a format change cannot be shadowed by a stale file. The terminal glyph
has no URI scheme at all, so it links to a generated `$TMPDIR/claude-newtab-<key>.cmd` running
`start "" wt.exe -w 0 nt -p "<profile>" -d "<folder>"`:

- `-w 0` addresses the **most recently used** window, so the tab lands beside the session that drew
  the icon.
- `-p` carries `WT_PROFILE_ID` (inherited down to the renderer); without it the tab opens under the
  default profile. Outside Windows Terminal the variable is unset and the flag is dropped.
- A `%` in the path is doubled, or `cmd` reads it as a variable reference and swallows it.

**Links terminate with `BEL`, not `ESC \`.** Every line passes through `expandBackslashEscapes`,
which would pair a trailing backslash with the first character of the label (a folder named `code`
would truncate the line at `\c`).

## Branch signs and MR/PR block

```
mpx-claude-code <VS Code> <terminal> ·  main
    ≡ · +2 · !28 · ?9 · 2h ago

yoursafe-components <VS Code> <terminal> ·  martas/agentic-setup · :8100 · !252 draft · ci run · 💬 3
    ↑3 · +2 · 16m ago
```

Upstream relation (one state, mutually exclusive): `local` no upstream · `≡` in sync · `↑3` ahead ·
`↓2` behind · `↑3↓2` diverged · `remote deleted`. Then one segment per non-zero count — `+n` staged,
`!n` modified, `?n` untracked, `~n` conflicted (powerlevel10k vocabulary) — and fetch age, hidden
under 10m.

**The whole row is quiet by design**: indented under the location line and dim throughout, because
it restates work you already know about. Color survives only where git tells you something you might
not: WARN for diverged/conflicts/deleted remote, green/red for an unpushed/unpulled count, sand for
a branch that never left the machine.

**Untracked files are counted** — `git status --untracked-files=normal` walks the working tree.
`normal` (not `all`) collapses an untracked directory to one entry, so the count matches what a
human sees and a large unignored tree cannot inflate it.

**MR/PR**: `!N` (GitLab) or `#N` (GitHub) linking to the web URL, then one status token (`draft`,
`conflicts`, `changes-req`, `approved`, `N left/req approvals`, `mergeable`, or the raw merge
status), the pipeline state spelled out and colored (`ci ok/fail/run/skip`), `💬 N` comments, and a
dim age note when the cache is stale. The status token binds to the reference with a space
(`!252 draft` names one thing); everything after it is a separate fact fenced off by `·`. CI links
to the provider's list of runs (`<url>/checks` or `/pipelines`) — the tab is valid while a run is
still queued and shows earlier attempts.

The render path is **network-free**: it reads a `$TMPDIR` cache and, when stale, spawns
[`scripts/status-line-mr-refresh.sh`](../scripts/status-line-mr-refresh.sh) detached for one
`glab api graphql` (GitLab) or `gh pr list` (GitHub) call. Rate limits are a non-issue at this
call volume.

`in sync` is about *commits*, not files — porcelain-v2's `# branch.ab +0 -0`. Uncommitted work is
reported by the counts beside it, so `in sync · 28 modified` is consistent. Ahead/behind is measured
against the *local* copy of the remote ref, which is why the fetch age sits beside it.

## Sub-agent status line

[`scripts/subagent-status-line.mts`](../scripts/subagent-status-line.mts) (settings key
`subagentStatusLine`, toggled with **Ctrl+T**) renders one row per sub-agent plus a session-wide
tally. It answers "who is running now, on what model, at what effort, for how long".

```
●  haiku               0s 812 (0%)      haiku, inherited
●  sonnet ?◆◆◆◇◇       0s 25.0k (12%)   sonnet, inherited
✓  sonnet  ◆◆◇◇◇       0s 104.0k (52%)  sonnet, declared clean
●  opus   !◆◆◆◆◆       0s 152.0k (76%)  opus, declared max
    ^ effort above the high ceiling
●  opus    120.0k      0s 40.0k (20%)   opus, numeric budget
```

Columns: **status** (`●` running cyan, `✓` completed green, `×` failed/killed red) — **model** —
**effort** — **elapsed** — **context** — label. There is no marker column: a marker prefixes and
recolors the exact cell it accuses, so a row can carry one on the model *and* one on the effort cell.

- **Effort** draws the main bar's five-slot gauge, not the level's name, so filled slots compare
  down the column. A numeric token budget maps to no rank and stays the number.
- **Colors:** model — opus blue, sonnet yellow, haiku pink, fable orange. Effort — low green,
  medium yellow, high orange, xhigh red, max purple, cyan for a numeric budget. Context escalates
  yellow ≥50%, orange ≥70%, red ≥90% against *each row's own* `contextWindowSize`.
- **Label** is the agent's live progress summary, falling back to `description` — so the column
  tracks what the agent is doing now, not the static task title.

**No per-agent identity in the payload.** `.type` is always `"local_agent"` and `.name` is `null`
for Task-tool sub-agents (it is the `agentNameRegistry` entry, rendered when present). The real
`agentType` is recoverable off the payload — Claude Code writes
`<project>/<session>/subagents/agent-<id>.meta.json` at spawn, keyed by the same `task.id` — but
the panel does not read it, because its rows already have the label. The main bar does (below).

**Finished agents.** Terminal rows stay in the payload briefly and then vanish. To outlive that,
every task seen is accumulated into `~/.claude/subagent-statusline-state/<session_id>.tsv`, and the
`Σ` line reports the whole session: agent count, breakdown by model tier and effort level, total
tokens, and how many still run. A task's tokens and elapsed time freeze the first tick it is seen
terminal. Because the panel only renders rows for ids in the current payload, the `Σ` line hangs off
the last row and disappears with it. A row's `content` may hold newlines, which is what lets the
`Σ` line and the per-agent compaction rows sit under the right row.

To inspect the raw payload, `touch ~/.claude/subagent-statusline-debug` — every tick is then
appended to `~/.claude/subagent-statusline-debug.jsonl`; delete the marker to stop. (A file gate,
not an env var, because the panel runs from inside Claude Code where there is no shell to export
one.) Output is JSONL, one `{"id","content"}` per line, within a 5s timeout; ids left unemitted keep
the built-in row.

## Sub-agent history on the main bar

The tasks panel is a **live view**, never a ledger — it renders only agents still in the payload and
evicts a terminal task shortly after it ends. The main bar carries the ledger: a tally row, an
optional type roll-call row, then one row per agent for the handful worth spelling out.

```
Σ 8 agents · 5×Opus 612.4k 3×Sonnet 183.1k
4×mp-executor 2×Explore !fork
⠀ × fork           !fable ◆◆◆◇◇  1m09s   77.6k
⠀ ✓ mp-executor     opus   ◆◆◇◇◇  4m02s  231.4k  2×auto
⠀ ✓ Explore         sonnet ◆◇◇◇◇     12s   95.2k
⠀ +3 more
```

- **Tally row**: count — tier tally, each tier carrying its own tokens (charged per tier, not
  summed). Everything is dim except the tier counts, which keep the panel's palette because tier mix
  is the one comparison worth making at a glance.
- **Type roll-call row**: the agent types by count, heaviest group first — but *only* when the detail
  rows below cannot list every agent (`hiddenRows > 0`). While every agent has its own row, the names
  are already on screen and the roll-call is dropped as a restatement.
- **Row columns**: status — agent type — tier — effort gauge — elapsed — tokens — compaction counts.
  The name and tier columns size to the widest value on screen; the gauges start at one column so
  they compare down the block.
- **Pinned to the right** of the left column from the first row (see [Two-column
  layout](#two-column-layout)); it stacks below the quota bars only when the terminal is too narrow.
- **Which agents get a row.** `AGENT_DETAIL_ROWS`, plus *every* failure — a failed or killed agent
  is always spelled out and always first, however many there are. Within the cap, agents keep spawn
  order if they all fit, otherwise rank by tokens (largest first). The remainder become `+N more`.
- **Compactions are counted, not listed** (`2×auto` amber, `1×manual` grey; silent when it never
  compacted). Only agents with a row of their own are scanned.
- **Only finished agents.** A running agent is already on the panel with more detail, so the two
  renderers split cleanly: **panel = running, main bar = finished.**
- **`N×Name`, one idiom everywhere** — `2×Explore`, `1×Opus`, `2×High`, same meaning on both
  renderers, and the count is always shown, `1×` included, so the roll-call reads as counts and
  matches the tier tally's own `1×Opus`. `×` is U+00D7.

**Three files, none in the payload:**

| File | Supplies |
| --- | --- |
| `~/.claude/subagent-statusline-state/<session_id>.tsv` | tier, effort, tokens, elapsed, status — written by the panel, frozen on terminal |
| `<project>/<session>/subagents/agent-<id>.meta.json` | `agentType` — written by Claude Code at spawn |
| `<session>/subagents/agent-<id>.jsonl` | the run's compaction boundaries |

The TSV is the spine — the only source that knows an agent's status, and complete because the panel
ticks continuously while any agent runs. The sidecars are read by id (the TSV already names every
agent) and read fresh, being small and immutable. An agent whose sidecar cannot be read still counts
toward the tally; only its name goes `unknown`, so the count never disagrees with the panel.

**The `!` marker outlives the panel.** A type on the roll-call row is marked red when any of its
agents ran on a banned tier (`!fork` = the fork ran on fable); on a spelled-out row the marker sits
on the tier cell (`!fable`). Only the tier rule is reachable here — the state file records the *resolved* effort,
not whether it was declared, so flagging an inherited level would accuse an agent of a choice it
never made. Those effort rules stay with the panel, which knows the difference.

**Two links:** an agent **type** (on the roll-call or at a row head) opens `.claude/agents/<type>.md`,
the file that defines it (project-level over user-level; a built-in nobody overrode has no file and
no link); a row's **status glyph** opens that run's own transcript, because that cell belongs to one
run while a type name shared by four agents has four transcripts and no honest target.

Shared vocabulary — tier colors, status glyphs, the `N×` idiom, `formatDuration`, the state-file row
format, the drift rule — lives in
[`scripts/lib/subagent-history.mts`](../scripts/lib/subagent-history.mts) so the two renderers cannot
drift into two dialects.

## Sub-agent effort markers

The `effort` field in the `subagentStatusLine` payload is **present only when the agent's frontmatter
declares one** (via the per-task `effort` field). The Agent tool has no per-spawn `effort` parameter,
so an absent field means the agent inherits the session `effortLevel`; the renderer substitutes it
and marks the value `?`. A numeric budget renders as `120.0k`, having no rank a gauge could draw.

Both marked cells **reserve the marker slot on every row**, blank where there is no marker, so a mark
never shifts the value it is about — otherwise the gauges shift a column the moment a row is marked
and stop comparing.

| Marker | Cell | Meaning |
| --- | --- | --- |
| `!` red | model | a model-class violation identified by the caller. Carries a `^ reason` line. |
| `!` red | effort | a *declared* value violates a rule — above the `high` ceiling, or declared on haiku. Carries a `^ reason` line. |
| `?` amber | effort | the value was substituted from the session `effortLevel` because the agent declared none. No reason line — inheriting is routine. |
| unmarked | either | a declared value, no violation. |

**Haiku with no declared effort renders a blank effort cell** — the model-config docs list no effort
levels for haiku, so substituting one would be fiction, and the blank is excluded from the tally's
effort grouping. Haiku that *declares* an effort renders it as `!◆◇◇◇◇`, since blanking would hide
the very thing being flagged.

Effort drift checks only ever judge *declared* values; flagging a substituted one blames an agent for
a setting it never made. A resolved Fable tier is not independently a violation — the payload has no
record of whether a frontier selection was a deliberate manual escalation.

## Implementation

Both renderers are zero-dependency ESM TypeScript (`.mts`), run by Node's native type stripping — no
build step, no bundler. `settings.json` invokes them as `node "$HOME/.claude/scripts/<name>.mts"`.
Requires Node ≥ 22.18; type stripping means **erasable syntax only** (no `enum`, `namespace`, or
constructor parameter properties). A repo whose `.nvmrc` pins a pre-22.18 Node renders a *blank*
status line — Node exits with `ERR_UNKNOWN_FILE_EXTENSION` and Claude Code sees empty stdout. Raise
the pin.

Shared libraries keep the two renderers from drifting:

- [`scripts/lib/statusline-ansi.mts`](../scripts/lib/statusline-ansi.mts) — `RESET`, `BOLD`, the
  five-slot effort gauge, stdin reading, cache reads, the cache-key sanitizer, and the integer guard
  that rejects negatives, decimals, empty strings and `"null"` (nearly every numeric field is gated
  on it).
- [`scripts/lib/compaction.mts`](../scripts/lib/compaction.mts) — the incremental transcript reader,
  the limit math, and the row renderer; each renderer passes its own `CompactionStyle`.
- [`scripts/lib/subagent-history.mts`](../scripts/lib/subagent-history.mts) — everything both
  renderers say *about* a sub-agent. Rendering is **not** shared: the panel draws padded columns and
  the main bar draws a sentence.

**Background fills inside the payload do not work — don't try again.** `RESET` clears background as
well as foreground and every field closes with one; reaching the right margin needs `\x1b[K`, which
Claude Code strips before the row reaches the terminal (colors survive, other CSI sequences do not).
Foreground color is the only lever this script has. Painting the whole *window* background does work,
but only from the launch site — see [Account background](#account-background).

Two bash behaviors are reproduced deliberately, because on-disk cache formats and the numbers users
are used to depend on them: `basename` treating a Windows `\` as a separator, and `printf '%.0f'`
rounding half **to even** (`0.5`→`0`, `2.5`→`2`). `printf '%b'` escape expansion is also reproduced,
including `\c` truncating output — reachable from any branch or session name with a backslash. The
`0x1F` Unit Separator survives in the on-disk cache formats only.

The bash originals live in `deprecated/scripts/` (`status-line.sh`, `subagent-status-line.sh`), kept
as reference. `status-line-mr-refresh.sh` is **not** deprecated — it is still the detached child that
refreshes MR/PR data.

## Account background

Personal and work sessions run side by side in one Windows Terminal, and naming the account in the
bar was not enough — "which account is this" gets asked from across the room. The pane background
answers it.

`cc`/`ccd`/`ccw`/`ccwd` in `~/.bashrc` call [`scripts/account-color.mts`](../scripts/account-color.mts)
before handing off to `claude`, and an `EXIT` trap calls it again with `reset` so the profile's own
colors return however the session ends. The tints live in
[`statusline-accounts.json`](../statusline-accounts.json): personal dark red, work dark blue. Pi (the
third harness) uses a separate painter, `mpx-pi/scripts/terminal-color.mjs`, in a different repo.

- **OSC 11 sets the background, OSC 12 the cursor**; `reset` sends OSC 111/112. OSC 11 repoints the
  `DefaultBackground` alias, so a profile's configured `background` only *seeds* the value at startup
  and this overrides it.
- **Never set `unfocusedAppearance` or `useBackgroundImageForWindow`** on any profile or in
  `profiles.defaults`: each focus change then re-applies the profile's color scheme and wipes the
  tint. Pane dimming and this repaint are mutually exclusive in Windows Terminal — dimming would need
  a different terminal (WezTerm does both).
- **One OSC sequence per `write`.** Concatenating OSC 11 and OSC 12 into one string makes Windows
  Terminal drop the background sequence (the cursor still changes, so it looks like OSC 11 being
  unsupported). Split into two `process.stdout.write` calls, both are honored.
- **Node writes it, not `printf`, and node must not be aliased to `winpty`.** Git Bash's MSYS2 layer
  and winpty's hidden console both silently swallow OSC 11/12. `~/.bashrc` runs `unalias node` before
  the `cc`/`ccw` functions are parsed (aliases bake into function bodies at parse time). A native
  Windows writer bypasses the translation layer.
- **Not a Claude Code hook.** `SessionStart` hook stdout is captured as model context and never
  reaches the terminal. The launch site is the only place that knows the account *and* owns the tty.
- **Tab color stays free.** Profiles set `tabColor`, which beats VT, so the tab means *project* while
  the background means *account* — two identities, no collision.
- **Failures are loud, success is silent.** A tint that cannot be applied must never stop Claude Code
  from starting, so nothing throws — but an unreadable accounts file or unknown account name prints
  to stderr. `--verbose` reports the colors sent and whether stdout is a tty.

## Tab title

Left to Claude Code. It drives the title from its own status: the session summary, prefixed by an
animated spinner while a turn runs and by `✳` once the session stops and wants you. That is the one
signal with the session's real state behind it, so nothing here competes with it, and the account
stays readable from the pane tint above. Both glyphs are hardcoded in the bundle — `✳` (`U+2733`)
and a two-frame braille spinner (`⠂⠐`, one frame per 960ms) — with no setting or env var to restyle
them, so `/rename [P] project` is the supported way to put an account prefix in the tab: it sets the
text half while Claude Code keeps prefixing the state glyph, and `terminalTitleFromRename` (default
`true`) is what allows it.

A custom titler was built and reverted — `[P] worktree · project`, set by `cc`/`ccw` behind
`CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`, with the state glyph rebuilt from
`UserPromptSubmit`/`Stop`/`SessionStart` hooks driving a console-attaching C helper. It is kept,
unwired, under `deprecated/scripts/terminal-title.mts` and `deprecated/hooks/terminal-title-state.c`
for the Win32 console notes in them. What killed it: **hook events cannot reconstruct a session's
state**. Interrupting a turn fires no `Stop`, so the tab stayed spinning; `/compact` runs with no
event that separates a manual compaction from an automatic mid-turn one, so it was skipped and the
tab read idle while the session worked. The summary was lost outright — it lives in memory alone,
in no transcript or session file. Reviving it means a state source Claude Code does not currently
expose, not another hook.

## The derived palette

Palette indices 16–255 are constants a color scheme never remaps, so a bar painted in fixed indices
rendered identically on every scheme and *wrong* on a light one. [`scripts/lib/terminal-theme.mts`](../scripts/lib/terminal-theme.mts)
reads the scheme and emits 24-bit color instead, so all tones are *derived* from that scheme's own
colors.

- **The background it derives against** is whatever is actually on screen. The launchers export
  `CLAUDE_PANE_ACCOUNT`, the only evidence an OSC 11 was emitted; with it the account tint is the
  reference, without it (a bare `claude`) the scheme's background is.
- **The scheme is resolved** `WT_PROFILE_ID` → that profile's `colorScheme` →
  `profiles.defaults.colorScheme` → `Campbell`. Windows Terminal's settings.json is JSONC, so it is
  parsed by a string-aware stripper (a `//` inside a `startingDirectory` is data, not a comment).
- **The built-in schemes are vendored** into `statusline-schemes.json` rather than read from the
  installed `defaults.json`, which sits under a version-stamped WindowsApps directory that cannot be
  cheaply located. User-defined schemes in settings.json still win, matching Windows Terminal's
  precedence.
- **Neutrals are blends, not literals** — `gray`/`dim`/`barEmpty` mix the scheme's foreground toward
  the background, so every scheme gets the same *relationships* rather than fixed greys.
- **A contrast floor keeps scheme colors legible** on a background the scheme did not choose: anything
  under 4.5:1 is walked toward a lift color by binary search (the lift follows the background, which
  also inverts the palette on a light scheme). `white` is held to 7:1 so it stays ahead of `gray`;
  `dim` and `barEmpty` are exempt because they are meant to recede.
- **Two colors are mixed, not taken.** No scheme ships a true orange, so the context ramp's middle
  step is `mix(yellow, red, 0.5)`. `warn` and the ramp's top are both red, separated by lightness.

Resolution is memoized per process, which is safe because the process is torn down every tick — a
scheme change shows on the next render.

## Glyph vocabulary

The terminal font is the fallback pair **`Cascadia Mono, Symbols Nerd Font`** (`profiles.defaults.font.face`;
WT walks the comma list per glyph). Text comes from Cascadia Mono; the Private Use Area pictograms
fall through to Symbols Nerd Font — the git-branch glyph U+E725, VS Code U+F0A1E, console U+F018D and
pencil U+F03EB. The non-"Mono" Symbols Nerd Font is used deliberately: it keeps the icons' native
double-cell proportions (a terminal can only render a glyph bigger if the font draws it into more of
the cell), and the overflow paints into a space the layout guarantees to its right.

Everything else stays within **plain** Cascadia Mono's cmap (parsed from the TTF), so a fallback to
the non-NF font degrades exactly those pictograms and nothing else. Present: `≡ ◆ ◇ ● ○ ▪ ▫ ✓ • ◦ █ ░
↑ ↓ ±`. **Absent, must not be used**: `✗ ✔ ✖ ⚙ ⚡ ⏺ ✦` — a missing glyph falls back to Segoe UI Emoji,
which draws double-width into the single reserved cell and smears over neighboring text. Any new glyph
gets checked against the cmap first. Real emoji (`💬 ⚠`) come from the emoji font by design and are
fine once spaced.

| Glyph | Means |
| --- | --- |
| `◆◇` (five slots) | effort gauge: low `◆◇◇◇◇` → max `◆◆◆◆◆` |
| U+E725 branch | precedes the branch name |
| U+F0A1E VS Code | after each folder name; opens the editor there |
| U+F018D console | after the VS Code glyph; opens a terminal tab there |
| U+F03EB pencil | after the dev-server ports; opens `statusline-projects.json` |
| U+2800 braille blank | first character of every indented row |
| `≡` | branch in sync with upstream |
| `+n !n ?n ~n` | staged / modified / untracked / conflicted |
| `█ ░` | every bar: quota and context |

**The indent guard.** Claude Code trims whitespace off each row before rendering, so a plain-space
indent disappears. Every nested row leads with U+2800 — a braille pattern with no dots raised, which
draws as an empty cell but is not whitespace to any trim — and hides its ordinary spaces behind it.
The sub-agent status column keeps `✓`/`×` because it is one cell wide with no room for words.

## Verifying a change

```bash
node scripts/verify-statusline.mts   # end-to-end: real executables, real stdin, installed symlink
npx vitest run scripts/__tests__     # unit tests over the pure helpers
```

The harness runs each fixture through the real executable in a throwaway sandbox (`TMPDIR` +
`CLAUDE_CONFIG_DIR`), asserting a clean exit, valid JSONL with a row per task, no `undefined`/`NaN`
in a rendered line, and **no fallback-prone glyph**. A fixture may also assert `expect`/`reject`
substrings — the only way to cover the sub-agent history block, which is assembled from files nothing
in the payload mentions, so a fixture must seed a state file and its meta sidecars for it to render.

Two traps the harness exists to catch:

- **Previewing colors in a Git Bash terminal shows the wrong colors.** `node` writing to a Windows
  TTY sends its escapes through libuv's ANSI translation, which approximates 24-bit color to the
  16-color palette. Piping to `cat` should bypass it but Git Bash wraps `node` in `winpty`, which
  refuses a piped stdout. Redirect to a file and `cat` *that*: the redirect keeps libuv out and `cat`
  hands raw bytes to Windows Terminal. Claude Code renders on the untranslated path, so the file is
  the honest preview.
- **The installed path differs from the repo path.** Claude Code invokes these through
  `~/.claude/scripts`, a symlink to this repo. Node resolves `import.meta.url` to the link target
  while leaving `process.argv[1]` as the link path, so an entry-point guard comparing the two without
  `realpath` renders nothing at all — no error, just a blank line. Running fixtures from the repo path
  cannot catch it.
