#!/bin/bash

# Per-subagent status line: renders one row per agent in the tasks panel
# (Ctrl+T) showing status, model, effort, elapsed time and context consumption,
# flags any row whose model/effort violates the rules in instructions/AGENTS.md,
# and appends a session-wide tally of every subagent that has run — including
# ones the panel has already evicted.
#
# Contract (verified against the 2.1.220 bundle by capturing raw stdin): stdin
# is a JSON object {columns, session_id, cwd, prompt_id, transcript_path,
# tasks:[{id,name,type,status,description,label,startTime,model,effort,
# contextWindowSize,tokenCount,tokenSamples,cwd}]}; stdout is JSONL, one
# {"id","content"} object per row, 5s timeout. Rows whose id is not emitted keep
# the built-in "name · description · tokens" rendering.
#
# Field notes, all confirmed against captured payloads rather than the docs:
#   name    always null for Task-tool subagents. It is the agentNameRegistry
#           entry, which only teammates and named background agents get.
#   type    always the literal "local_agent", regardless of which subagent_type
#           was spawned. The task object carries a real `agentType` internally
#           (the bundle filters on it: `agentType!=="main-session"`), but it is
#           deliberately not copied into this payload.
#   status  one of running / completed / failed / killed. The three terminal
#           values are what the bundle's isTerminal check accepts.
#   label   the live progress summary when the agent has one, else description.
#   effort  the agent's declared frontmatter effort, or the per-invocation
#           override. Absent when the agent inherits the session effort, which
#           is why an inherited value is shown tilde-marked. Requires 2.1.214.
#   tokenSamples  a rolling history of tokenCount, one entry per refresh tick,
#           capped at the bundle's 16. Deliberately not rendered: a sparkline of
#           it has to be normalized against the row's own min/max, because
#           against a 1M context window every real subagent flatlines at the
#           bottom — and that normalization destroys scale, so +200 tokens and
#           +200k draw identically. The ten columns buy more as label text.
#
# Because no field carries the agent's identity, declared-vs-actual model drift
# stays uncheckable here; only the tier/effort rules that need no identity run.
#
# Terminal tasks stay in the payload for 30s (the bundle's eviction delay) and
# then vanish, so the session tally is accumulated in a state file keyed by
# session_id. A task's tokens and elapsed time freeze the first tick it is seen
# terminal, so a finished agent stops accruing time.

CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS_FILE="$CONFIG_DIR/settings.json"
STATE_DIR="$CONFIG_DIR/subagent-statusline-state"

C_RESET=$'\033[0m'
C_GRAY=$'\033[38;5;245m'
C_DIM=$'\033[38;5;240m'

# Model tier colors. Shared with the effort scale where the hue means the same
# thing, so the two columns read as one palette rather than two.
C_MODEL_OPUS=$'\033[38;5;74m'      # blue
C_MODEL_SONNET=$'\033[38;5;220m'   # yellow
C_MODEL_HAIKU=$'\033[38;5;211m'    # pink
C_MODEL_FABLE=$'\033[38;5;208m'    # orange

C_EFFORT_LOW=$'\033[38;5;71m'      # green
C_EFFORT_MEDIUM=$'\033[38;5;220m'  # yellow
C_EFFORT_HIGH=$'\033[38;5;208m'    # orange
C_EFFORT_XHIGH=$'\033[38;5;196m'   # red
C_EFFORT_MAX=$'\033[38;5;141m'     # purple
C_EFFORT_BUDGET=$'\033[38;5;80m'   # cyan: a numeric token budget, not a level

C_STATUS_RUNNING=$'\033[38;5;80m'  # cyan
C_STATUS_DONE=$'\033[38;5;71m'     # green
C_STATUS_FAILED=$'\033[38;5;196m'  # red

# Context escalation mirrors status-line.sh, but keyed to percentage rather than
# absolute tokens: subagent windows vary by model, so the main bar's fixed
# 100k/140k/180k cut-offs would mean different things on different rows.
C_CTX_YELLOW=$'\033[38;5;220m'     # >=50%
C_CTX_ORANGE=$'\033[38;5;208m'     # >=70%
C_CTX_RED=$'\033[38;5;196m'        # >=90%

C_DRIFT=$'\033[38;5;196m'          # red: the ! marker
C_DRIFT_REASON=$'\033[38;5;203m'   # coral: the explanation beneath it

# Field separator for packing rows into `read`. ASCII Unit Separator never
# appears in the data, so empty fields survive (see status-line.sh for the
# IFS-whitespace trap this avoids).
US=$'\037'
# Stands in for a newline inside a row's content, so rows stay one-per-line
# through the pipeline; swapped back to a real newline in the final jq pass.
NL_MARKER=$'\002'

input=$(cat)

# Raw-payload capture, gated on a marker file rather than an env var: the panel
# runs this from inside Claude Code, so there is no shell in which to export one.
# `touch ~/.claude/subagent-statusline-debug` to record, delete it to stop.
if [[ -f "$CONFIG_DIR/subagent-statusline-debug" ]]; then
    printf '%s\n' "$input" >> "$CONFIG_DIR/subagent-statusline-debug.jsonl"
fi

# Single jq call for the whole payload — spawning jq per task made the main bar
# miss its render budget under Windows Git Bash, and this runs on every tick.
# tokenSamples is pre-joined with commas so it survives as one field.
payload=$(printf '%s' "$input" | jq -j --arg us "$US" '
    ([[(.columns // 100), (.session_id // "nosession")] | map(tostring) | join($us)]
     + [ .tasks[]? | [
        (.id // ""),
        (.model // ""),
        (.effort // ""),
        (.status // ""),
        (.startTime // 0),
        (.tokenCount // 0),
        (.contextWindowSize // 0),
        (.name // ""),
        ((.label // .description // "") | gsub("[\n\r\t]"; " "))
    ] | map(tostring) | join($us) ]) | join("\n")' 2>/dev/null | tr -d '\r')
# jq writes stdout in text mode under Windows, turning the join("\n") into CRLF;
# without this the CR survives into the last field and trails every description.

# Columns and session id ride along on the first line rather than costing a
# second jq spawn — this runs on every panel tick, and jq startup dominates the
# render cost here.
[[ "$payload" != *$'\n'* ]] && exit 0   # header line only == no tasks
header=${payload%%$'\n'*}
tasks_raw=${payload#*$'\n'}
IFS="$US" read -r columns session_id <<< "$header"
[[ "$columns" =~ ^[0-9]+$ ]] || columns=100
[[ -n "$session_id" ]] || session_id="nosession"

session_effort=$(jq -r '.effortLevel // "medium"' "$SETTINGS_FILE" 2>/dev/null)
[[ -z "$session_effort" || "$session_effort" == "null" ]] && session_effort="medium"

now_ms=$(( $(printf '%(%s)T' -1) * 1000 ))

state_file="$STATE_DIR/$session_id.tsv"
if [[ ! -f "$state_file" ]]; then
    mkdir -p "$STATE_DIR" 2>/dev/null
    # Prune on first tick of a session only; a find on every tick would be paid
    # several times a second for a directory that changes once per session.
    find "$STATE_DIR" -name '*.tsv' -mtime +7 -delete 2>/dev/null
fi

model_tier() {
    # Normalizes either an alias ("sonnet") or a full id ("claude-sonnet-5").
    case "$1" in
        *opus*)   echo "opus" ;;
        *sonnet*) echo "sonnet" ;;
        *haiku*)  echo "haiku" ;;
        *fable*)  echo "fable" ;;
        *)        echo "" ;;
    esac
}

format_tokens() {
    # 25032 -> 25.0k ; below 1000 stays exact.
    if [[ "$1" =~ ^[0-9]+$ && $1 -ge 1000 ]]; then
        printf '%d.%dk' $(( ($1 + 50) / 1000 )) $(( (($1 + 50) % 1000) / 100 ))
    else
        printf '%s' "${1:-0}"
    fi
}

format_duration() {
    local total_seconds=$(( $1 / 1000 ))
    (( total_seconds < 0 )) && total_seconds=0
    if (( total_seconds < 60 )); then
        printf '%ds' "$total_seconds"
    elif (( total_seconds < 3600 )); then
        printf '%dm%02ds' $(( total_seconds / 60 )) $(( total_seconds % 60 ))
    else
        printf '%dh%02dm' $(( total_seconds / 3600 )) $(( (total_seconds % 3600) / 60 ))
    fi
}

rows=""
current_records=""
last_task_id=""

while IFS="$US" read -r task_id model effort status start_time token_count \
                        context_size task_name description; do
    [[ -z "$task_id" ]] && continue
    last_task_id="$task_id"

    case "$status" in
        running)   status_glyph="●"; status_color="$C_STATUS_RUNNING" ;;
        completed) status_glyph="✓"; status_color="$C_STATUS_DONE" ;;
        failed)    status_glyph="✗"; status_color="$C_STATUS_FAILED" ;;
        killed)    status_glyph="✗"; status_color="$C_STATUS_FAILED" ;;
        *)         status_glyph="○"; status_color="$C_GRAY" ;;
    esac

    tier=$(model_tier "$model")
    case "$tier" in
        opus)   model_color="$C_MODEL_OPUS" ;;
        sonnet) model_color="$C_MODEL_SONNET" ;;
        haiku)  model_color="$C_MODEL_HAIKU" ;;
        fable)  model_color="$C_MODEL_FABLE" ;;
        *)      model_color="$C_GRAY" ;;
    esac
    model_display="${tier:-${model:-?}}"

    # An absent effort means the agent inherited the session's, which is the one
    # case where the value shown is not the agent's own — hence the tilde.
    effort_is_numeric_budget=0
    if [[ -z "$effort" ]]; then
        effort="$session_effort"
        effort_display="~$effort"
    elif [[ "$effort" =~ ^[0-9]+$ ]]; then
        effort_is_numeric_budget=1
        effort_display=$(format_tokens "$effort")
    else
        effort_display="$effort"
    fi

    if (( effort_is_numeric_budget )); then
        effort_color="$C_EFFORT_BUDGET"
    else
        case "$effort" in
            low)    effort_color="$C_EFFORT_LOW" ;;
            medium) effort_color="$C_EFFORT_MEDIUM" ;;
            high)   effort_color="$C_EFFORT_HIGH" ;;
            xhigh)  effort_color="$C_EFFORT_XHIGH" ;;
            max)    effort_color="$C_EFFORT_MAX" ;;
            *)      effort_color="$C_GRAY" ;;
        esac
    fi

    elapsed_ms=0
    [[ "$start_time" =~ ^[0-9]+$ && $start_time -gt 0 ]] && elapsed_ms=$(( now_ms - start_time ))

    ctx_pct=0
    if [[ "$context_size" =~ ^[0-9]+$ && $context_size -gt 0 && "$token_count" =~ ^[0-9]+$ ]]; then
        ctx_pct=$(( token_count * 100 / context_size ))
    fi
    if   [[ $ctx_pct -ge 90 ]]; then ctx_color="$C_CTX_RED"
    elif [[ $ctx_pct -ge 70 ]]; then ctx_color="$C_CTX_ORANGE"
    elif [[ $ctx_pct -ge 50 ]]; then ctx_color="$C_CTX_YELLOW"
    else ctx_color="$C_GRAY"
    fi
    tokens_display="$(format_tokens "$token_count") (${ctx_pct}%)"

    # Drift checks, each mapped to a rule in instructions/AGENTS.md. Model drift
    # (declared vs. actual) is unreachable here — no field carries which agent a
    # task is — so only the tier/effort rules that need no identity run. A
    # numeric budget is exempt: it maps to no named level, so no ceiling applies.
    drift_reasons=()
    [[ "$tier" == "fable" ]] && drift_reasons+=("fable is never allowed")
    if (( ! effort_is_numeric_budget )); then
        [[ "$effort" == "xhigh" || "$effort" == "max" ]] && \
            drift_reasons+=("effort above the high ceiling")
        [[ "$tier" == "sonnet" && "$effort" == "high" ]] && \
            drift_reasons+=("sonnet never pairs with high")
    fi

    drift_marker="  "
    [[ ${#drift_reasons[@]} -gt 0 ]] && drift_marker="${C_DRIFT}!${C_RESET} "

    row=$(printf '%b%s%b %b%-7s%b %b%-8s%b %b%7s%b %b%-13s%b' \
        "$status_color" "$status_glyph" "$C_RESET" \
        "$model_color" "$model_display" "$C_RESET" \
        "$effort_color" "$effort_display" "$C_RESET" \
        "$C_DIM" "$(format_duration "$elapsed_ms")" "$C_RESET" \
        "$ctx_color" "$tokens_display" "$C_RESET")
    used_width=$(( 1 + 1 + 7 + 1 + 8 + 1 + 7 + 1 + 13 + 1 ))

    row+=" $drift_marker"
    used_width=$(( used_width + 3 ))

    # `name` is null for every Task-tool subagent, so this only ever renders for
    # a teammate or a named background agent — worth showing when it is there.
    [[ -n "$task_name" ]] && description="$task_name · $description"

    description_width=$(( columns - used_width ))
    [[ $description_width -lt 10 ]] && description_width=10
    row+="${C_GRAY}${description:0:$description_width}${C_RESET}"

    if [[ ${#drift_reasons[@]} -gt 0 ]]; then
        reason_text=$(IFS='; '; echo "${drift_reasons[*]}")
        row+="${NL_MARKER}${C_DRIFT_REASON}    ^ ${reason_text}${C_RESET}"
    fi

    rows+="${task_id}${US}${row}"$'\n'
    current_records+="${task_id}"$'\t'"${tier:-unknown}"$'\t'"${effort_display#\~}"$'\t'"${token_count:-0}"$'\t'"${elapsed_ms}"$'\t'"${status}"$'\n'
done <<< "$tasks_raw"

[[ -z "$rows" ]] && exit 0

# Merge this tick's tasks into the session state and emit the tally in one awk
# pass. A task already recorded terminal keeps its frozen tokens and elapsed
# time; everything else is overwritten with the fresh reading.
#
# The state path travels through the environment rather than `-v`: awk runs
# backslash escape processing over -v values, and CLAUDE_CONFIG_DIR is a native
# Windows path here, so `C:\Users\snapy` arrives as `C:Userssnapy`.
summary=$(printf '%s' "$current_records" | state_file="$state_file" awk -F'\t' '
    function is_terminal(s) { return s == "completed" || s == "failed" || s == "killed" }
    BEGIN {
        state = ENVIRON["state_file"]
        while ((getline line < state) > 0) {
            split(line, f, "\t")
            if (f[1] == "") continue
            order[++count] = f[1]
            record[f[1]] = line
            frozen[f[1]] = is_terminal(f[6])
        }
        close(state)
    }
    {
        if (!($1 in record)) order[++count] = $1
        if (!frozen[$1]) {
            record[$1] = $0
            frozen[$1] = is_terminal($6)
        }
    }
    END {
        # Written to a temp file and renamed by the caller: a tick that is
        # cancelled mid-write (the panel kills in-flight scripts when a new
        # update arrives) would otherwise truncate the session tally. The rename
        # is left to bash because awk`s system() would hand the Windows path to
        # sh, which eats the backslashes.
        tmp = ENVIRON["state_file"] ".tmp"
        total_tokens = 0; running = 0; agents = 0
        for (i = 1; i <= count; i++) {
            id = order[i]
            if (id in seen) continue
            seen[id] = 1
            print record[id] > tmp
            split(record[id], f, "\t")
            agents++
            by_tier[f[2]]++
            by_effort[f[3]]++
            total_tokens += f[4]
            if (!is_terminal(f[6])) running++
        }
        close(tmp)

        tier_text = ""
        split("opus sonnet haiku fable unknown", tier_order, " ")
        for (i = 1; i <= 5; i++)
            if (by_tier[tier_order[i]] > 0)
                tier_text = tier_text (tier_text == "" ? "" : " ") tier_order[i] " " by_tier[tier_order[i]]

        effort_text = ""
        split("low medium high xhigh max", effort_order, " ")
        for (i = 1; i <= 5; i++)
            if (by_effort[effort_order[i]] > 0)
                effort_text = effort_text (effort_text == "" ? "" : " ") effort_order[i] " " by_effort[effort_order[i]]

        printf "%d\t%s\t%s\t%d\t%d", agents, tier_text, effort_text, total_tokens, running
    }')
[[ -s "$state_file.tmp" ]] && mv -f "$state_file.tmp" "$state_file" 2>/dev/null

IFS=$'\t' read -r total_agents tier_text effort_text total_tokens running_count <<< "$summary"
if [[ -n "$total_agents" && -n "$last_task_id" ]]; then
    summary_line="Σ ${total_agents} agents this session"
    [[ -n "$tier_text" ]] && summary_line+=" · $tier_text"
    [[ -n "$effort_text" ]] && summary_line+=" · $effort_text"
    summary_line+=" · $(format_tokens "$total_tokens") tokens"
    (( running_count > 0 )) && summary_line+=" · $running_count running"

    # The panel only renders rows for ids present in this tick's payload, so a
    # session-wide line has nowhere of its own to live; it hangs off the last
    # row. It therefore disappears with the last row, 30s after the final agent.
    #
    # Appended by trimming the trailing newline rather than by sed-matching the
    # last row's id: that made rendering depend on task ids never containing
    # regex metacharacters, which nothing guarantees.
    rows="${rows%$'\n'}"
    rows+="${NL_MARKER}${C_DIM}  ${summary_line}${C_RESET}"$'\n'
fi

# One jq pass does the JSON escaping (ANSI escapes included) and emits the
# required one-object-per-line output.
printf '%s' "$rows" | jq -Rc --arg us "$US" --arg nl "$NL_MARKER" '
    select(length > 0)
    | split($us)
    | {id: .[0], content: (.[1] | gsub($nl; "\n"))}'
