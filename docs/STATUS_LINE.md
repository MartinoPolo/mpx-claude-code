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
  alone means no glyph or box drawing has to carry it.
- **Dim grey is for context, not signal.** Fetch age, MR cache age, quota reset countdowns, the
  quota cache age note and the session cost all render dim. They answer "how much do I trust the
  number beside me" or "what is the running total"; coloring them coral trains the eye to ignore
  coral everywhere else. The one exception is a quota cache old enough that the percentages
  themselves are wrong.
- A row with nothing to say is dropped rather than emitted blank — outside a repo the branch
  state has no content at all, so the rows below it move up.

## Data sources

All values come straight from Claude Code's stdin JSON — model, session name/id, effort, context
(`context_window.used_percentage` + `total_input_tokens`), cost, and quota (`rate_limits`).
Lines added/removed (`cost.total_lines_*`) used to close the usage row as `+120 -34` and was
dropped as noise — a session-wide edit total never changed a decision. `buildUsageLine` carries a
comment saying how to restore it.

Quota reads from stdin `rate_limits` (no network call) with a cached last-known value, plus a
background `/api/oauth/usage` fallback only for session cold-start — so the endpoint's aggressive
rate limit is never hit during normal use. Cached readings older than 15m show a muted age note;
older than 30m are flagged coral.

## Clickable directory and IDE

The directory name and the `IDE` token beside it are OSC-8 hyperlinks. Clicking the name opens
Explorer in the working directory; clicking `IDE` opens VS Code there.

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
📁 mpx-claude-code · IDE · 🔀 main
in sync · 2 staged · 28 modified · 9 untracked · 2h ago

📁 yoursafe-components · IDE · 🔀 martas/agentic-setup · !252 draft · ci run · 💬 3
↑3 · 2 staged · 16m ago
```

Upstream relation (one state, mutually exclusive): `local` no upstream · `in sync` · `↑3` ahead ·
`↓2` behind · `↑3↓2` diverged · `remote deleted` for an upstream that is configured but whose
remote branch is gone. Then one segment per non-zero count — `n staged`, `n modified`,
`n untracked`, `n conflicted` — and the age since the last fetch, hidden under 10m and always dim.

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
row, 30s after the final agent.

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
stdin reading, and the integer guard that reproduces bash's `[[ $x =~ ^[0-9]+$ ]]`. That
predicate rejects negatives, decimals, empty strings and `"null"` — it stays because nearly
every numeric field is gated on it, and a looser check would start rendering values the old line
silently dropped.

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

States are spelled as **words**, not dingbats, and every emoji is followed by a space. Two
distinct reasons, worth keeping apart:

**Correctness.** A character the terminal font lacks falls back to Segoe UI Emoji, which draws
double-width into the single cell the terminal reserved and smears over the text beside it.
Measured against Cascadia Mono — Windows Terminal's default when no `"face"` is set — exactly
five of the original glyphs were absent and had to go:

| Glyph | Was used for |
| --- | --- |
| `✎` U+270E | unstaged file count, MR draft |
| `⟳` U+27F3 | fetch age |
| `⊘` U+2298 | upstream deleted |
| `⇅` U+21C5 | branch diverged |
| `✗` U+2717 | changes requested; sub-agent `failed`/`killed` |

Real emoji (`📁 🔀 🔥 💬 ⚠`) come from the emoji font by design and are fine once spaced.

**Legibility.** `≡ ● ◐ ⬤ ⌂ ✓` do render in Cascadia Mono but were replaced anyway — none of them
says what it means, and the four CI states were the same `⬤` separated only by color, which a
screenshot or a colorblind reader loses entirely. Consolas is additionally missing `◐ ⬤ ✓`, so
dropping them buys portability against a face change. The sub-agent status column keeps `✓`/`×`
because it is one cell wide and has no room for words.

## Verifying a change

```bash
node scripts/verify-statusline.mts   # end-to-end: real executables, real stdin, installed symlink
npx vitest run scripts/__tests__     # 153 unit tests over the pure helpers
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
