#!/bin/bash

# Per-subagent status line: renders one row per live agent in the tasks panel
# (Ctrl+T), showing model, effort and context consumption, and flagging any row
# whose model/effort violates the rules in instructions/AGENTS.md.
#
# Contract (verified against the 2.1.212 bundle): stdin is a JSON object
# {columns, tasks:[{id,name,type,status,description,label,startTime,model,
# contextWindowSize,tokenCount,tokenSamples,cwd}], ...session fields}; stdout is
# JSONL, one {"id","content"} object per row, 5s timeout. Rows whose id is not
# emitted keep the built-in "name · description · tokens" rendering.
#
# `.type` is always the literal string "local_agent" for every task, regardless
# of which custom subagent_type (e.g. "mp-reviewer-security") was actually
# spawned — confirmed by capturing raw stdin payloads. No field in this contract
# carries the real agent identity, and OTEL doesn't either (gen_ai.turn.subagent_type
# is defined but never populated — github.com/anthropics/claude-code#14784 — and
# OTEL is push-based batch export to a collector anyway, unusable within a 5s
# sync tick). So per-agent declared model/effort from frontmatter is NOT
# resolvable here; every row's effort is the inherited session effortLevel.

CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS_FILE="$CONFIG_DIR/settings.json"

C_RESET=$'\033[0m'
C_GRAY=$'\033[38;5;245m'

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

# Context escalation mirrors context-bar.sh, but keyed to percentage rather than
# absolute tokens: subagent windows vary by model, so the main bar's fixed
# 100k/140k/180k cut-offs would mean different things on different rows.
C_CTX_YELLOW=$'\033[38;5;220m'     # >=50%
C_CTX_ORANGE=$'\033[38;5;208m'     # >=70%
C_CTX_RED=$'\033[38;5;196m'        # >=90%

C_DRIFT=$'\033[38;5;196m'          # red: the ! marker
C_DRIFT_REASON=$'\033[38;5;203m'   # coral: the explanation beneath it

# Field separator for packing rows into `read`. ASCII Unit Separator never
# appears in the data, so empty fields survive (see context-bar.sh for the
# IFS-whitespace trap this avoids).
US=$'\037'
# Stands in for a newline inside a row's content, so rows stay one-per-line
# through the pipeline; swapped back to a real newline in the final jq pass.
NL_MARKER=$'\002'

input=$(cat)

# Single jq call for the whole payload — spawning jq per task made the main bar
# miss its render budget under Windows Git Bash, and this runs on every tick.
payload=$(printf '%s' "$input" | jq -j --arg us "$US" '
    ([(.columns // 100) | tostring] + [ .tasks[]? | [
        (.id // ""),
        (.model // ""),
        (.status // ""),
        (.tokenCount // 0),
        (.contextWindowSize // 0),
        ((.label // .description // "") | gsub("[\n\r\t]"; " "))
    ] | map(tostring) | join($us) ]) | join("\n")' 2>/dev/null | tr -d '\r')
# jq writes stdout in text mode under Windows, turning the join("\n") into CRLF;
# without this the CR survives into the last field and trails every description.

# Columns rides along on the first line rather than costing a second jq spawn —
# this runs on every panel tick, and jq startup dominates the render cost here.
[[ "$payload" != *$'\n'* ]] && exit 0   # first line only == no tasks
columns=${payload%%$'\n'*}
tasks_raw=${payload#*$'\n'}
[[ "$columns" =~ ^[0-9]+$ ]] || columns=100

session_effort=$(jq -r '.effortLevel // "medium"' "$SETTINGS_FILE" 2>/dev/null)
[[ -z "$session_effort" || "$session_effort" == "null" ]] && session_effort="medium"

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

rows=""
while IFS="$US" read -r task_id model status token_count context_size description; do
    [[ -z "$task_id" ]] && continue

    tier=$(model_tier "$model")
    case "$tier" in
        opus)   model_color="$C_MODEL_OPUS" ;;
        sonnet) model_color="$C_MODEL_SONNET" ;;
        haiku)  model_color="$C_MODEL_HAIKU" ;;
        fable)  model_color="$C_MODEL_FABLE" ;;
        *)      model_color="$C_GRAY" ;;
    esac
    model_display="${tier:-${model:-?}}"

    # There's no field anywhere (stdin or OTEL) carrying which custom agent
    # this is, so per-agent declared effort can never be resolved — every row
    # shows the inherited session effort, tilde-marked as such.
    effort="$session_effort"
    case "$effort" in
        low)    effort_color="$C_EFFORT_LOW" ;;
        medium) effort_color="$C_EFFORT_MEDIUM" ;;
        high)   effort_color="$C_EFFORT_HIGH" ;;
        xhigh)  effort_color="$C_EFFORT_XHIGH" ;;
        max)    effort_color="$C_EFFORT_MAX" ;;
        *)      effort_color="$C_GRAY" ;;
    esac
    effort_display="~$effort"

    ctx_pct=0
    if [[ "$context_size" =~ ^[0-9]+$ && $context_size -gt 0 && "$token_count" =~ ^[0-9]+$ ]]; then
        ctx_pct=$(( token_count * 100 / context_size ))
    fi
    if   [[ $ctx_pct -ge 90 ]]; then ctx_color="$C_CTX_RED"
    elif [[ $ctx_pct -ge 70 ]]; then ctx_color="$C_CTX_ORANGE"
    elif [[ $ctx_pct -ge 50 ]]; then ctx_color="$C_CTX_YELLOW"
    else ctx_color="$C_GRAY"
    fi
    if [[ "$token_count" =~ ^[0-9]+$ && $token_count -ge 1000 ]]; then
        tokens_display="$(( (token_count + 50) / 1000 )).$(( ((token_count + 50) % 1000) / 100 ))k"
    else
        tokens_display="${token_count:-0}"
    fi
    [[ $ctx_pct -gt 0 ]] && tokens_display+=" (${ctx_pct}%)"

    # Drift checks, each mapped to a rule in instructions/AGENTS.md. Model drift
    # (declared vs. actual) is unreachable here — no field on stdin or OTEL
    # carries which custom agent a task is, so it can't be checked from this
    # data source; only tier/effort-ceiling rules that don't need identity.
    drift_reasons=()
    [[ "$tier" == "fable" ]] && drift_reasons+=("fable is never allowed")
    [[ "$effort" == "xhigh" || "$effort" == "max" ]] && \
        drift_reasons+=("effort above the high ceiling")
    [[ "$tier" == "sonnet" && "$effort" == "high" ]] && \
        drift_reasons+=("sonnet never pairs with high")

    drift_marker=""
    [[ ${#drift_reasons[@]} -gt 0 ]] && drift_marker="${C_DRIFT}!${C_RESET}"

    # Fixed-width leading columns so the model/effort of every row line up; the
    # description absorbs whatever width is left.
    row=$(printf '%b%-7s%b %b%-8s%b %b%-13s%b' \
        "$model_color" "$model_display" "$C_RESET" \
        "$effort_color" "$effort_display" "$C_RESET" \
        "$ctx_color" "$tokens_display" "$C_RESET")
    [[ -n "$drift_marker" ]] && row+="$drift_marker " || row+="  "

    used_width=$(( 7 + 1 + 8 + 1 + 13 + 2 ))
    description_width=$(( columns - used_width ))
    [[ $description_width -lt 10 ]] && description_width=10
    row+="${C_GRAY}${description:0:$description_width}${C_RESET}"

    if [[ ${#drift_reasons[@]} -gt 0 ]]; then
        reason_text=$(IFS='; '; echo "${drift_reasons[*]}")
        row+="${NL_MARKER}${C_DRIFT_REASON}    ^ ${reason_text}${C_RESET}"
    fi

    rows+="${task_id}${US}${row}"$'\n'
done <<< "$tasks_raw"

[[ -z "$rows" ]] && exit 0

# One jq pass does the JSON escaping (ANSI escapes included) and emits the
# required one-object-per-line output.
printf '%s' "$rows" | jq -Rc --arg us "$US" --arg nl "$NL_MARKER" '
    select(length > 0)
    | split($us)
    | {id: .[0], content: (.[1] | gsub($nl; "\n"))}'
