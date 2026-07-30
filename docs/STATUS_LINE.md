# Status Lines — Design & Implementation

Deep-dive for [`scripts/status-line.mts`](../scripts/status-line.mts) (main bar) and
[`scripts/subagent-status-line.mts`](../scripts/subagent-status-line.mts) (tasks panel).
The README carries only the feature overview; every design decision and mechanic lives here.

## Main status line — layout decisions

- **One separator, at every level.** `|` is gone: it drew a wall between fields that are merely
  adjacent. ` · ` (U+00B7, present in both Cascadia Mono and Consolas) means "next field"
  everywhere, rather than two glyphs meaning two ranks of the same thing.
- **Branch state has its own row** because those counts grow without bound during a working
  session and used to push the MR reference off the right edge of the location row.
- **The directory name is the one white field.** It answers "where am I", the question asked most
  often and from the furthest away; every other field on that row stays grey. Emphasis by color
  alone means no glyph or box drawing has to carry it. In a worktree the white moves to the
  worktree half of `project/worktree`, because that is the actual location.
- **The first line is account · title · id** — whose session, what it is about, how to refer to
  it — so switching between a Personal and a Work terminal is answered before anything else.
- **Effort is a gauge, not a word.** `◆◆◆◇◇` (high) reads at a glance where `<high>` had to be
  parsed; five slots for the five levels `low medium high xhigh max`, and anything unrecognized
  falls back to the old `<level>` spelling.
- **Dim grey is for context, not signal.** Fetch age, MR cache age, quota reset countdowns, the
  quota cache age note, the session cost and a compaction's wall clock all render dim. They answer
  "how much do I trust the number beside me" or "what is the running total"; coloring them coral
  trains the eye to ignore coral everywhere else. The one exception is a quota cache old enough
  that the percentages themselves are wrong.
- **The session name is the only field with weight.** Bold magenta `fg(213)`, where every other
  rank on the bar is hue alone. It is the title of the thing you are looking at, so it is found
  before anything else is read. It was lavender `fg(141)`, which sat close enough to the panel's
  `max` effort purple that neither read as a heading.
- A row with nothing to say is dropped rather than emitted blank — outside a repo the branch
  state has no content at all, so the rows below it move up.

## Data sources

All values come straight from Claude Code's stdin JSON — model, session name/id, effort, context
(`context_window.used_percentage` + `total_input_tokens`), cost, and quota (`rate_limits`).
Lines added/removed (`cost.total_lines_*`) used to close the usage row as `+120 -34` and was
dropped as noise — a session-wide edit total never changed a decision. `buildUsageLine` carries a
comment saying how to restore it.

Compaction history is the one value not in the payload — it is read from the transcript at
`transcript_path`, which the payload does carry. See [Compaction history](#compaction-history).

Quota reads from stdin `rate_limits` (no network call) with a cached last-known value, plus a
background `/api/oauth/usage` fallback only for session cold-start — so the endpoint's aggressive
rate limit is never hit during normal use. Cached readings older than 15m show a muted age note;
older than 30m are flagged coral.

## Compaction history

Claude Code writes one line into a session's transcript every time that session compacts:

```json
{ "type": "system", "subtype": "compact_boundary", "timestamp": "2026-07-16T06:26:17.738Z",
  "compactMetadata": { "trigger": "auto", "preTokens": 227148, "postTokens": 11300,
                       "cumulativeDroppedTokens": 215848, "durationMs": 87407 } }
```

Only `trigger` and `preTokens` are documented; the rest are real but undocumented, and
`docs/sessions` warns the transcript format changes between versions. `parseCompactionEvent`
therefore defaults every field it cannot read rather than dropping the event.

**Sub-agents compact independently** and each writes its own transcript at
`<session>/subagents/agent-<id>.jsonl`, where `<id>` is the panel payload's `task.id`. That
identity is what lets a row show its own history. Confirmed against a captured payload —
`task.id` `a77f7ecdb4b8f2a5c` names `agent-a77f7ecdb4b8f2a5c.jsonl`.

**The read is incremental.** A transcript reaches tens of megabytes and both renderers run on
every tick, so `$TMPDIR/claude-compact-<key>.tsv` holds the byte offset already scanned plus the
events found so far; each tick parses only the bytes appended since. A cold start on a 16 MB
transcript is one pass (~36 ms measured); every tick after it is the few hundred bytes a turn
adds. Three details carry that:

- The offset is **bytes**, not characters — one emoji in a tool result would otherwise drift it
  permanently.
- A tick can land midway through a line Claude Code is still writing, so the trailing partial is
  left unconsumed and re-read next time instead of being parsed and lost.
- A cache offset *ahead* of the file means the transcript was replaced or truncated (a resumed
  session forks a new file), which restarts the scan from zero.

Unlike the MR block this spawns nothing and touches no network — the file is already on disk.

**Layout.** One indented row per event, oldest first, directly under the context line that owns
them; the tasks panel indents two spaces deeper so its rows nest under an agent rather than the
tally. Only the last `COMPACTION_ROWS` (3) are spelled out and the rest collapse into
`N earlier` — the recent ones are what tell you whether the session you came back to is still the
session you left. `auto` is the only field with a color of its own (amber, the same hue the panel
uses to qualify an inherited effort level) because it is the only thing on the row you did not
decide; `manual`, the token change and the tree glyphs stay at reading weight, and the clock is
dim.

## The context bar and `autoCompactWindow`

The bar fills toward the **auto-compaction limit**, not the model window. A bar creeping toward
1M said nothing, because nothing happens at 1M — which is why the bar was dropped from this row
in the first place. A full bar now means compaction is about to fire, the only threshold on the
line anyone acts on.

The limit is `min(context_window_size, autoCompactWindow) - 33000`. That reserve is
`min(maxOutputTokens, 20000) + 13000`, read off the 2.1.220 bundle and confirmed against a real
boundary: a 213,000 window tripped at `preTokens: 181,106`. **It is an offset, not a fraction** —
moving the trigger by 20k means moving `autoCompactWindow` by 20k, not scaling it. `settings.json`
carries `autoCompactWindow: 233000`, which puts the trigger at 200,000.

Context escalation is now a fraction of that limit (50% / 70% / 90%) rather than the old absolute
100k/140k/180k. At a 200,000 limit the cut-offs land on exactly those numbers, so nothing moved on
screen — but they follow `autoCompactWindow` instead of silently meaning less every time it is
raised. The bar takes the same escalating color, so bar and token count can never disagree.

The percentage in `118k (11%)` still reads against the **model window**, deliberately: the bar
answers "how close am I to losing history", the percentage answers "how much of the window am I
using". Two questions, two denominators.

## Click targets

Almost every identifier on the line is an OSC-8 hyperlink to the thing it names:

| Click | Opens |
| --- | --- |
| project / worktree name | Explorer in that folder |
| VS Code glyph (U+F0A1E) beside a name | VS Code in that folder |
| branch name | the branch on its remote host (`.../tree/<branch>`, GitLab `/-/tree/`) |
| `:8100` port | `localhost:8100` in the browser, over the scheme the probe saw it speak |
| pencil glyph (U+F03EB) after the ports | `statusline-projects.json`, where the ports live |
| `#01b054bb` session id | the session's transcript `.jsonl` |
| `5h` / `7d` quota labels | <https://claude.ai/settings/usage> |

The branch URL comes from `git remote get-url origin` (one more fast git call per render),
normalised from any of the three remote spellings — scp-like `git@host:owner/repo.git`,
`ssh://`, plain `https://` — with `.git` stripped and the tree-path style picked by host:
GitLab nests it under `/-/`, GitHub and everything else serve `/tree/<branch>` directly. No
parseable remote, no link — the branch renders as plain text.

**Worktrees are split into two click targets.** `git rev-parse --path-format=absolute
--git-common-dir --show-toplevel` (one extra ~10ms call, made only when the cwd is already known
to be a repo) reveals a linked worktree: the shared `.git` lives under the *main* checkout, so
when `dirname(--git-common-dir)` differs from `--show-toplevel` the line renders
`project/worktree` — project gray linking the original folder, worktree white linking the
worktree, because the worktree is what answers "where am I". Each half carries its own VS Code
glyph — the project's opens the original checkout, the worktree's opens the worktree — so both
editors are one click away. In the main checkout the line is just the cwd name with a single
glyph, as before.

**Dev-server ports** follow the branch segment: `statusline-projects.json` at the repo root maps a
main project folder name to its localhost ports (worktrees inherit their project's entry, since
the config is keyed by the resolved main project). Each port renders as `:8100` hyperlinked into
the browser — Windows Terminal opens http and https links in the default browser — green while
something is listening, DIM while nothing is. Liveness comes from a cache written by a detached
`--warm-ports` child (same pattern as the quota/FX warmers) that probes each port with a
400ms timeout, at most every 15s; the render itself never opens a socket. Which process belongs
to which project is *not* auto-detected — a dev server is usually a `node` grandchild whose
working directory Windows will not cheaply reveal — hence the one-time config.

The probe decides the **scheme** as well as the state, and both halves are load-bearing:

- It dials `localhost`, not `127.0.0.1`, so Node's happy-eyeballs (`autoSelectFamily`, on by
  default since Node 20) tries both address families. A dev server bound to `::1` only — which
  Vite does routinely — otherwise probes as down while serving perfectly well.
- Once connected it attempts a TLS handshake over the same socket: completed means the port is
  recorded `https`, rejected or ignored means `http`. The link then carries the scheme the server
  actually speaks. Getting this wrong is not a graceful failure — an `http://` request to a TLS
  listener is answered with zero bytes, and the browser reports `ERR_EMPTY_RESPONSE`, which looks
  like a broken dev server rather than a wrong URL. A port that is down has no known scheme and
  falls back to `http`.

A dim pencil (U+F03EB) linking to that config closes the port list, so a wrong or new port is
one click from its declaration; a project with no entry at all renders a dim `pencil ports`
hint in the same place instead, which is also how a fresh project discovers the feature.

Both are `file:` URLs, because Windows Terminal opens a hyperlink only when its scheme is `http`,
`https` or `file` (`TerminalPage::_IsUriSupported`) — anything else raises an error dialog
instead of reaching the registered handler, so `vscode://file/...` cannot be emitted directly.
The workaround is a generated `$TMPDIR/claude-open-<key>.url` shortcut holding that `vscode:`
URL: `.url` is bound to `InternetShortcut` on every Windows install, and opening one hands its
URL back to the shell, which dispatches `vscode:` to `Code.exe --open-url`. The file is inert
data — no script runs on click — and is rewritten every render, so a change of format cannot be
shadowed by a stale file left in the temp directory.

A `.code-workspace` shim was tried first and silently opened whatever folder VS Code had open
last: its ProgID is registered but no extension is bound to it, so the click had no handler at
all.

The links terminate with `BEL` rather than the usual `ESC \`. Every line is emitted through
`expandBackslashEscapes`, which would pair that trailing backslash with the first character of
the label — a directory named `trace` would render as a tab followed by `race`, and one named
`code` would truncate the whole line at `\c`.

## Branch signs and MR/PR block

```
mpx-claude-code <VS Code glyph> ·  main
    ≡ · +2 · !28 · ?9 · 2h ago

yoursafe-components <VS Code glyph> ·  martas/agentic-setup · :8100 · :8101 · !252 draft · ci run · 💬 3
    ↑3 · +2 · 16m ago
```

Upstream relation (one state, mutually exclusive): `local` no upstream · `≡` in sync · `↑3`
ahead · `↓2` behind · `↑3↓2` diverged · `remote deleted` for an upstream that is configured but
whose remote branch is gone. Then one compact segment per non-zero count — `+n` staged, `!n`
modified, `?n` untracked, `~n` conflicted — and the age since the last fetch, hidden under 10m.

**The whole row is quiet by design**: indented four columns under the location line (a detail *of*
it, the way compaction rows nest under the usage line) and DIM throughout, because it restates
work you already know about — you made those edits. Color survives only where git is telling you
something you might not: WARN for diverged/conflicts/deleted remote, green/red for an
unpushed/unpulled count, sand for a branch that never left the machine. The symbols follow the
powerlevel10k vocabulary (`+` staged, `!` modified, `?` untracked, `~` conflicted), so they read
as git shorthand rather than a private code.

**Untracked files are counted.** `git status` runs with `--untracked-files=normal` rather than
the index-only `=no`, which walks the working tree: measured at 98ms against 92ms on this repo,
for the one class of uncommitted change the line could not otherwise show. `normal` (not `all`)
collapses an untracked directory to a single entry, so the count matches what `git status` shows
a human and a large unignored tree cannot inflate it.

MR/PR: `!N` (GitLab) or `#N` (GitHub), an OSC-8 hyperlink to the web URL, followed by one status
token — `draft`, `conflicts`, `changes-req`, `approved`, `left/req approvals` outstanding,
`mergeable`, or the raw merge status lowercased — then the pipeline state spelled out (`ci ok`,
`ci fail`, `ci run`, `ci skip`) and colored, `💬 N` comments, and a dim `Nm ago` when the cached
data is over 10m old.

**The status token binds to the reference, everything after it takes a separator.** `!252 draft`
names one thing the way `📁 repo` does, so a space holds it together; CI, comments and the age
note are separate facts about the branch and are fenced off by `·` like any other field.

**CI links to the provider's list of runs** — `<mr-url>/checks` on GitHub, `<mr-url>/pipelines`
on GitLab. Both are paths under the MR/PR URL already in the cache, so the link costs no extra
field and no extra API call. It targets the tab rather than the newest run: the tab is a valid
destination while the run is still queued, and it shows the earlier attempts, which is what
"why did this break" needs.

The render path is network-free: it reads a `$TMPDIR` cache and, when that cache is stale,
spawns `scripts/status-line-mr-refresh.sh` detached to make one `glab api graphql` (GitLab) or
`gh pr list` (GitHub) call. TTL 90s with a 30s floor between attempts. Measured: cache read
~0.5ms, the single `git status --porcelain=v2 --branch --untracked-files=normal` call ~98ms, the
background API call ~0.7s. Rate limits are a non-issue — GitLab.com allows 2000 req/min and
GitHub 5000 req/hour, against ~40 calls/hour/repo.

`in sync` is about *commits*, not files: it is porcelain-v2's `# branch.ab +0 -0`, meaning the
branch's committed history matches its upstream tracking ref. Uncommitted work is reported
separately by the counts beside it, so `in sync · 28 modified` is a normal, consistent reading.

Caveat: ahead/behind is measured against the *local* copy of the remote ref, so `in sync` stays
true-looking until something fetches — which is exactly why the fetch age sits beside it.

## Sub-agent status line

`scripts/subagent-status-line.mts` (settings key `subagentStatusLine`) renders one row per
sub-agent in the tasks panel — toggled with **Ctrl+T** — plus a session-wide tally. It answers
"who is running right now, on what model, at what effort, for how long", which the main status
line cannot show.

```
● haiku                 0s 812 (0%)      haiku, inherited
● sonnet  ?high         0s 25.0k (12%)   sonnet, inherited
✓ sonnet  medium        0s 104.0k (52%)  sonnet, declared clean
● opus    !max          0s 152.0k (76%)  opus, declared max
    ^ effort above the high ceiling
● opus    120.0k        0s 40.0k (20%)   opus, numeric budget
× !fable  !max          0s 3.0k (1%)     fable, declared max
    ^ fable is never allowed;effort above the high ceiling
```

Columns: **status** (`●` running cyan, `✓` completed green, `×` failed/killed red) — **model** —
**effort** — **elapsed** — **context** — label. There is no marker column: a marker prefixes and
recolors the exact cell it accuses, which is why a `fable` row can carry two of them. Hanging a
bare `?` or `!` off the end put every mark as far from its value as the layout allowed, and
reading it as noise about the task label was the usual result; prefixing also hands those three
columns back to the description.

Colors: **model** — opus blue, sonnet yellow, haiku pink, fable orange. **Effort** — low green,
medium yellow, high orange, xhigh red, max purple, and cyan for a numeric token budget.
**Context** — escalates yellow ≥50%, orange ≥70%, red ≥90%, using each row's own
`contextWindowSize` (the main bar's absolute token cut-offs would mean different things on rows
with different windows).

The **label** is the agent's live progress summary when it has one, falling back to
`description` — so the column tracks what the agent is doing now, not the static task title it
was spawned with.

`tokenSamples` (a rolling history of `tokenCount`, one entry per refresh tick, capped at 16) is
**deliberately not rendered.** A sparkline of it has to be normalized against the row's own
min/max, because against a 1M context window every real sub-agent flatlines at the bottom — and
that normalization destroys scale, so `+200` tokens and `+200k` draw identically. Its real
information content is close to binary (moving vs. flat), which is not worth ten columns that
the label uses better.

**Finished agents.** Terminal rows stay in the payload for 30s (the bundle's eviction delay) and
then vanish. To outlive that, every task seen is accumulated into
`~/.claude/subagent-statusline-state/<session_id>.tsv`, and the `Σ` line reports the whole
session: agent count, breakdown by model tier and effort level, total tokens, and how many are
still running. A task's tokens and elapsed time freeze the first tick it is seen terminal, so a
finished agent stops accruing time. State files are pruned after 7 days, on the first tick of a
new session. Because the panel only renders rows for ids present in the current payload, the `Σ`
line has nowhere of its own to live and hangs off the last row — so it disappears with the last
row, 30s after the final agent. A row's `content` may hold newlines, which is what makes that
trick work and what the per-agent compaction rows reuse; they are appended to the agent's own row
so that *which* agent lost its history is what the panel says, and the `Σ` line stays last.

**Compaction rows are usually absent, correctly so.** Across 806 sub-agent transcripts on this
machine, zero contained a `compact_boundary` — no sub-agent had ever hit the limit. The largest
observed peaked at 320,628 tokens on 16 July, eleven days before `autoCompactWindow` was set at
all. The display is therefore correct by construction but unexercised by real data; the synthetic
fixture in `scripts/__tests__/compaction.test.ts` is what covers it.

**No per-agent identity — a hard limit of the data, not a bug.** `.type` is always the literal
string `"local_agent"`, and `.name` is always `null` for Task-tool sub-agents (it is the
`agentNameRegistry` entry, which only teammates and named background agents get; it is rendered
when present). Both verified by capturing raw stdin payloads. The task object carries a real
`agentType` internally — the bundle filters on `agentType !== "main-session"` — but it is
deliberately not copied into this payload, and OTEL doesn't fill the gap either: its
`gen_ai.turn.subagent_type` attribute is defined but never populated
([anthropics/claude-code#14784](https://github.com/anthropics/claude-code/issues/14784)), and
OTEL is push-based batch export to an external collector regardless, unusable inside a
synchronous 5s tick. So *declared-vs-actual model drift* stays uncheckable here; only the
tier/effort rules that need no identity run.

To inspect the raw payload yourself, `touch ~/.claude/subagent-statusline-debug` — every tick is
then appended to `~/.claude/subagent-statusline-debug.jsonl`. Delete the marker file to stop.
The gate is a file rather than an env var because the panel runs the script from inside Claude
Code, where there is no shell in which to export one.

Output is JSONL, one `{"id","content"}` object per line, within a 5s timeout; ids left unemitted
keep the built-in `name · description · tokens` row. For history that survives the session
entirely, use `scripts/analyze-subagent-models.py`, which reads the same data from
`~/.claude/projects/**/*.jsonl` after the fact.

## Sub-agent effort markers

The `effort` field in the `subagentStatusLine` payload is **present only when the agent's
frontmatter declares one** — via the per-task `effort` field added in Claude Code **2.1.214**.
The Agent tool has no per-spawn `effort` parameter (unlike `model`), so frontmatter is the only
source; an absent field means the agent inherits the session `effortLevel`, and the renderer
substitutes it and marks the value `?`. A numeric budget renders as `120.0k`.

Markers prefix and recolor the cell they accuse — there is no separate marker column, and a row
can carry one on each cell independently (`!fable` plus `?high` on the same row, which the old
single-slot design could not show because `!` outranked `?`).

| Marker | Cell | Meaning |
| --- | --- | --- |
| `!` red (fg 196) | model | `fable`, which is never allowed. Carries a `^ reason` line. |
| `!` red (fg 196) | effort | a *declared* value violates a rule — above the `high` ceiling, or declared on haiku. Carries a `^ reason` line. |
| `?` amber (fg 214) | effort | the value was substituted from the session `effortLevel` because the agent declared none. No reason line: inheriting is routine for `general-purpose`, `claude`, `Plan` and `fork`, and one per row would bury the real `!` rows. |
| unmarked | either | a declared value, no violation. |

Haiku with no declared effort renders a **blank** effort cell:
[the model-config table](https://code.claude.com/docs/en/model-config) lists effort levels per
model and states that models not listed do not support effort — no Haiku appears, so
substituting one would be fiction, and the blank is excluded from the session tally's effort
grouping. Haiku that *declares* an effort renders it as `!low`: blanking would hide the very
thing being flagged, and it counts toward the `Σ` tally like any other declared value.

Effort drift checks only ever judge *declared* values. Flagging a substituted one blames an
agent for a setting it never made, which is how every `general-purpose` row used to acquire a
violation it had no way to cause. The `fable` check is independent of effort and needs no
declared value, since the model is always reported.

## Implementation

Both renderers are zero-dependency ESM TypeScript (`.mts`), run by Node's native type
stripping — no build step, no bundler, no `dist/`. `settings.json` invokes them as
`node "$HOME/.claude/scripts/<name>.mts"`. Requires Node ≥ 22.18; type stripping means
**erasable syntax only** (no `enum`, no `namespace`, no constructor parameter properties).

That `node` resolves per-directory under a version manager, so a repo whose `.nvmrc` pins a
pre-22.18 version renders a blank status line: Node exits with `ERR_UNKNOWN_FILE_EXTENSION:
Unknown file extension ".mts"` and Claude Code sees empty stdout. Raise the project's pin.

They were bash until the process-spawn cost stopped being tolerable. Under Windows Git Bash
every `jq`, `awk`, `date`, `stat`, `git` and subshell is a full fork emulation, and both scripts
run on every render tick:

| Renderer | bash | TypeScript |
| --- | --- | --- |
| `status-line` | ~697 ms/render | ~198 ms/render |
| `subagent-status-line` | ~545 ms/render | ~144 ms/render |

The port also deleted a layer of workarounds that only existed to survive bash: packing 15
fields through one `jq` call with an ASCII Unit Separator so `read` would not collapse empty
ones, `awk` for float formatting, `stat -c %Y` for cache mtimes, and manual `curl -i`
header/body splitting. The `0x1F` separator survives in the *on-disk cache formats* only,
because existing caches use it.

`scripts/lib/statusline-ansi.mts` holds the small shared surface: the 256-color escape helper,
`BOLD`, stdin reading, best-effort cache reads, the cache-key sanitizer, and the integer guard
that reproduces bash's `[[ $x =~ ^[0-9]+$ ]]`. That predicate rejects negatives, decimals, empty
strings and `"null"` — it stays because nearly every numeric field is gated on it, and a looser
check would start rendering values the old line silently dropped.

`scripts/lib/compaction.mts` holds everything about compaction: the transcript reader with its
incremental byte-offset cache, the limit math, and the row renderer. Both renderers pass their own
`CompactionStyle` into one `buildCompactionLines`, so a compaction row means the same thing
wherever it appears rather than drifting into two dialects.

Two bash behaviors are reproduced deliberately, because the on-disk cache formats and the
numbers users have grown used to both depend on them: `basename` under Git Bash treats a Windows
`\` as a path separator, and `printf '%.0f'` rounds half **to even**, so `0.5`→`0` and `2.5`→`2`
where `toFixed` would give `1` and `3`. (`printf '%b'` escape expansion is also reproduced,
including `\c` truncating the rest of the output — it is reachable from any branch or session
name containing a backslash.)

The bash originals live in `deprecated/scripts/` (`status-line.sh`, `subagent-status-line.sh`) —
kept as the byte-parity reference the port was validated against, archived once the renderers
diverged deliberately. `status-line-mr-refresh.sh` is **not** deprecated — it is still the
detached child that refreshes MR/PR data.

## Glyph vocabulary

The terminal font is the fallback pair **`Cascadia Mono, Symbols Nerd Font`** (set via
`profiles.defaults.font.face` in Windows Terminal's settings.json; WT walks the comma list
per glyph). Text comes from the bundled Cascadia Mono; every Private Use Area glyph falls
through to Symbols Nerd Font (the symbols-only nerd-fonts build, installed per-user
2026-07-30), which licenses the two pictograms on the location line: the git-branch glyph
U+E725 (devicons), the VS Code logo U+F0A1E and the pencil U+F03EB (both Material Design set).

That pair is the third iteration, each driven by a live look. Cascadia Mono NF (Microsoft's
official NF build, still installed) came first, but it scales every symbol down into a single
cell — the VS Code devicon U+E70C read as a speck, and the powerline branch U+E0A0 as a
full-height hairline. Swapping codepoints (U+E725, U+F0A1E) helped but stayed capped at one
cell. The non-"Mono" Symbols Nerd Font keeps the icons' native double-cell proportions, which
is the only way a terminal ever renders a glyph bigger — the renderer cannot scale one glyph,
only the font can draw it into more of the cell. The double-width overflow paints into the
cell to the icon's right, so the layout guarantees a plain space there.

Everything else stays within the set verified against **plain** Cascadia Mono's cmap (parsed
directly from the TTF), so a fallback to the non-NF font degrades exactly two icons and nothing
else: `≡ ◆ ◇ ● ○ ▪ ▫ ✓ • ◦ █ ░ ↑ ↓ ±` are present; `✗ ✔ ✖ ⚙ ⚡ ⏺ ✦` are **absent** and must not
be used. A character the font lacks falls back to Segoe UI Emoji, which draws double-width into
the single cell the terminal reserved and smears over the text beside it — that fallback is why
`✎ ⟳ ⊘ ⇅ ✗` were purged from the original design, and why any new glyph gets checked against the
cmap before use. Real emoji (`💬 ⚠`) come from the emoji font by design and are fine once
spaced; the once-load-bearing `📁 🔀 🔥` were dropped in the 2026-07 redesign as the loudest
things on their rows.

Current symbol assignments:

| Glyph | Means |
| --- | --- |
| `◆◇` (five slots) | effort gauge: low `◆◇◇◇◇` → max `◆◆◆◆◆` |
| U+E725 branch | precedes the branch name |
| U+F0A1E VS Code | after each folder name; opens the editor there (was the word `IDE`) |
| U+F03EB pencil | after the dev-server ports; opens `statusline-projects.json` |
| U+2800 braille blank | first character of every indented row (branch state, compaction) |
| `≡` | branch in sync with upstream |
| `+n !n ?n ~n` | staged / modified / untracked / conflicted (powerlevel10k vocabulary) |
| `█ ░` | every bar: quota and context |

**The indent guard.** Claude Code trims whitespace off each status-line row before rendering
it, so an indent made of plain spaces silently disappears. Every nested row therefore leads
with U+2800 — a braille pattern with no dots raised, which draws as an empty cell but is not
whitespace to any trim — and hides its ordinary spaces behind it. It lives in base Cascadia
Mono, so no fallback is involved.

The sub-agent status column keeps `✓`/`×` because it is one cell wide and has no room for words.

## Verifying a change

```bash
node scripts/verify-statusline.mts   # end-to-end: real executables, real stdin, installed symlink
npx vitest run scripts/__tests__     # 249 unit tests over the pure helpers
```

The harness began as a byte-parity golden diff against the bash originals, which is how the port
was validated. That contract ended deliberately once the renderers started spelling states as
words and gating effort drift on declared values — the originals moved to `deprecated/scripts/`
and the diff went with them. What remains is what unit tests structurally cannot reach: each
fixture runs through the real executable in a throwaway sandbox (`TMPDIR` +
`CLAUDE_CONFIG_DIR`), asserting a clean exit, valid JSONL with a row per task, no
`undefined`/`NaN` leaking into a rendered line, and **no fallback-prone glyph** — that last
guard caught `✗` still sitting in the sub-agent status column.

It also smoke-tests the **installed** path, and that check earns its place: Claude Code invokes
these through `~/.claude/scripts`, a symlink to this repo. Node resolves `import.meta.url` to
the link target while leaving `process.argv[1]` as the link path, so an entry-point guard
comparing the two without `realpath` renders **nothing at all** — no error, no output, just a
blank status line. Running fixtures from the repo path cannot catch it.
