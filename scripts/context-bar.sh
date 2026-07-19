#!/bin/bash

# Color theme: gray, orange, blue, teal, green, lavender, rose, gold, slate, cyan
COLOR="blue"

# Color codes
C_RESET='[0m'
C_GRAY='[38;5;245m'  # explicit gray for default text
C_BAR_EMPTY='[38;5;238m'
case "$COLOR" in
    orange)   C_ACCENT='[38;5;173m' ;;
    blue)     C_ACCENT='[38;5;74m' ;;
    teal)     C_ACCENT='[38;5;66m' ;;
    green)    C_ACCENT='[38;5;71m' ;;
    lavender) C_ACCENT='[38;5;139m' ;;
    rose)     C_ACCENT='[38;5;132m' ;;
    gold)     C_ACCENT='[38;5;136m' ;;
    slate)    C_ACCENT='[38;5;60m' ;;
    cyan)     C_ACCENT='[38;5;37m' ;;
    *)        C_ACCENT="$C_GRAY" ;;  # gray: all same color
esac

# Warning color for stale/unreliable data (coral red). Uses \033 escape form —
# interpreted by the final printf '%b'. Kept ESC-free here so it round-trips.
C_WARN=$'\033[38;5;203m'

input=$(cat)


# Extract model, directory, and cwd
model=$(echo "$input" | jq -r '.model.display_name // .model.id // "?"')
cwd=$(echo "$input" | jq -r '.cwd // empty')
dir=$(basename "$cwd" 2>/dev/null || echo "?")

# Git branch (compact)
branch=""
if [[ -n "$cwd" && -d "$cwd" ]]; then
    branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
fi

# Transcript path for context + last message
transcript_path=$(echo "$input" | jq -r '.transcript_path // empty')

# Context window size (accurate)
max_context=$(echo "$input" | jq -r '.context_window.context_window_size // 200000')
max_k=$((max_context / 1000))

# --- Context % + bar (based on transcript; baseline fallback) ---
baseline=20000
bar_width=10
pct_prefix=""

if [[ -n "$transcript_path" && -f "$transcript_path" ]]; then
    context_length=$(jq -s '
        map(select(.message.usage and .isSidechain != true and .isApiErrorMessage != true)) |
        last |
        if . then
            (.message.usage.input_tokens // 0) +
            (.message.usage.cache_read_input_tokens // 0) +
            (.message.usage.cache_creation_input_tokens // 0)
        else 0 end
    ' < "$transcript_path" 2>/dev/null)

    if [[ "$context_length" -gt 0 ]]; then
        pct=$((context_length * 100 / max_context))
        pct_prefix=""
    else
        pct=$((baseline * 100 / max_context))
        pct_prefix="~"
    fi
else
    pct=$((baseline * 100 / max_context))
    pct_prefix="~"
fi

[[ $pct -gt 100 ]] && pct=100

ctx_bar=""
for ((i=0; i<bar_width; i++)); do
    bar_start=$((i * 10))
    progress=$((pct - bar_start))
    if [[ $progress -ge 8 ]]; then
        ctx_bar+="${C_ACCENT}█${C_RESET}"
    elif [[ $progress -ge 3 ]]; then
        ctx_bar+="${C_ACCENT}▄${C_RESET}"
    else
        ctx_bar+="${C_BAR_EMPTY}░${C_RESET}"
    fi
done

# --- Helpers ---
progress_bar() {
    # usage: progress_bar <pct-int-0-100> [width]
    local pct="$1"
    local width="${2:-10}"
    local filled=$((pct * width / 100))
    local out=""

    for ((i=0; i<width; i++)); do
        if [[ $i -lt $filled ]]; then
            out+="${C_ACCENT}█${C_RESET}"
        else
            out+="${C_BAR_EMPTY}░${C_RESET}"
        fi
    done
    printf '%b' "$out"
}

format_pct() {
    local raw="$1"
    if [[ -z "$raw" || "$raw" == "null" ]]; then
        echo ""
        return
    fi
    printf '%.0f' "$raw" 2>/dev/null
}

round_n() {
    # round_n <number> <decimals>
    local num="$1"
    local dec="$2"
    LC_ALL=C awk -v n="$num" -v d="$dec" 'BEGIN{ if(n=="" || n=="null") exit 1; printf("%.*f", d, n+0) }' 2>/dev/null
}

time_until() {
    local iso="$1"
    [[ -z "$iso" || "$iso" == "null" ]] && return
    local reset_epoch now_epoch diff
    reset_epoch=$(date -d "$iso" +%s 2>/dev/null) || return
    now_epoch=$(date +%s)
    diff=$((reset_epoch - now_epoch))
    [[ $diff -le 0 ]] && return
    local days=$((diff / 86400))
    local hours=$(((diff % 86400) / 3600))
    local mins=$(((diff % 3600) / 60))
    if [[ $days -gt 0 ]]; then
        printf '%dd %dh' "$days" "$hours"
    elif [[ $hours -gt 0 ]]; then
        printf '%dh %dm' "$hours" "$mins"
    else
        printf '%dm' "$mins"
    fi
}

human_age() {
    # human_age <seconds> -> compact age like "2h", "7m", "45s"
    local s="$1"
    [[ "$s" =~ ^[0-9]+$ ]] || { printf '?'; return; }
    if [[ $s -ge 86400 ]]; then printf '%dd' $((s / 86400))
    elif [[ $s -ge 3600 ]]; then printf '%dh' $((s / 3600))
    elif [[ $s -ge 60 ]]; then printf '%dm' $((s / 60))
    else printf '%ds' "$s"; fi
}

get_oauth_token() {
    # 1) env var
    if [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
        echo "$CLAUDE_CODE_OAUTH_TOKEN"
        return
    fi

    # 2) credentials files — respect CLAUDE_CONFIG_DIR so each account
    #    (personal ~/.claude vs work ~/.claude-work) reads its own token.
    local cfg_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
    local f
    for f in "$cfg_dir/.credentials.json" "$cfg_dir/credentials.json"; do
        if [[ -f "$f" ]]; then
            local tok
            tok=$(jq -r '.claudeAiOauth.accessToken // empty' "$f" 2>/dev/null)
            if [[ -n "$tok" ]]; then
                echo "$tok"
                return
            fi
        fi
    done

    # 3) macOS Keychain
    if command -v security >/dev/null 2>&1; then
        local creds
        creds=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null)
        if [[ -n "$creds" && "$creds" != "null" ]]; then
            local tok
            tok=$(echo "$creds" | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
            if [[ -n "$tok" ]]; then
                echo "$tok"
                return
            fi
        fi
    fi

}

CACHE_DIR="${TMPDIR:-/tmp}"
# Key the usage cache to the active config dir so personal and work accounts
# don't read each other's cached quota (they share one TMPDIR).
_cfg_tag="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
_cfg_tag="${_cfg_tag//[^A-Za-z0-9]/_}"
USAGE_CACHE="$CACHE_DIR/claude-usage-cache-${_cfg_tag}.json"
USAGE_ATTEMPT="$CACHE_DIR/claude-usage-attempt-${_cfg_tag}"
USAGE_LOCK="$CACHE_DIR/claude-usage-lock-${_cfg_tag}"
USAGE_RETRY_FILE="$CACHE_DIR/claude-usage-retry-${_cfg_tag}"  # epoch until which the server (Retry-After) forbids fetching
# The /oauth/usage endpoint has a low hourly request budget. Polling every ~2min
# (~30 req/hr) sits OVER it, so each cooldown expiry gets re-tripped for another
# ~1h — a permanent lockout. Poll every 4min (~15 req/hr) to stay under budget.
USAGE_CACHE_TTL=240  # seconds between fetch attempts
USAGE_STALE_SECS=300 # seconds — data older than this is flagged stale on-screen
USAGE_RETRY_CAP=3600 # seconds — clamp for a server Retry-After we honor

fetch_usage_json() {
    local token="$1"
    [[ -z "$token" ]] && return 1

    local now cache_mtime age
    now=$(date +%s)

    # 1) Return cached data if fresh enough (no network).
    if [[ -f "$USAGE_CACHE" ]]; then
        cache_mtime=$(stat -c %Y "$USAGE_CACHE" 2>/dev/null || stat -f %m "$USAGE_CACHE" 2>/dev/null)
        if [[ -n "$cache_mtime" ]]; then
            age=$((now - cache_mtime))
            if [[ $age -lt $USAGE_CACHE_TTL ]]; then
                cat "$USAGE_CACHE"
                return
            fi
        fi
    fi

    # 2) Honor the server's Retry-After. During the cooldown we make ZERO
    #    requests so the rolling-hour budget drains and the endpoint recovers
    #    cleanly at the deadline instead of being re-tripped by our polling.
    if [[ -f "$USAGE_RETRY_FILE" ]]; then
        local retry_until
        retry_until=$(cat "$USAGE_RETRY_FILE" 2>/dev/null)
        if [[ "$retry_until" =~ ^[0-9]+$ && $now -lt $retry_until ]]; then
            [[ -f "$USAGE_CACHE" ]] && cat "$USAGE_CACHE"
            return
        fi
    fi

    # 3) Gate on last ATTEMPT (success or failure), not just last success —
    #    otherwise a persistent error never advances the backoff clock and
    #    every status line render re-fires a request with no cooldown.
    if [[ -f "$USAGE_ATTEMPT" ]]; then
        local attempt_mtime attempt_age
        attempt_mtime=$(stat -c %Y "$USAGE_ATTEMPT" 2>/dev/null || stat -f %m "$USAGE_ATTEMPT" 2>/dev/null)
        if [[ -n "$attempt_mtime" ]]; then
            attempt_age=$((now - attempt_mtime))
            if [[ $attempt_age -lt $USAGE_CACHE_TTL ]]; then
                [[ -f "$USAGE_CACHE" ]] && cat "$USAGE_CACHE"
                return
            fi
        fi
    fi

    # 4) Serialize concurrent sessions so they don't all fetch at once. Stale
    #    locks (>10s, i.e. a prior fetch that never cleaned up) are reclaimed.
    if ! mkdir "$USAGE_LOCK" 2>/dev/null; then
        local lock_mtime lock_age
        lock_mtime=$(stat -c %Y "$USAGE_LOCK" 2>/dev/null || stat -f %m "$USAGE_LOCK" 2>/dev/null)
        lock_age=$((now - ${lock_mtime:-$now}))
        if [[ $lock_age -lt 10 ]]; then
            [[ -f "$USAGE_CACHE" ]] && cat "$USAGE_CACHE"
            return
        fi
        rmdir "$USAGE_LOCK" 2>/dev/null
        mkdir "$USAGE_LOCK" 2>/dev/null
    fi

    : > "$USAGE_ATTEMPT"

    # 5) Fetch fresh data (headers + body, so we can read Retry-After on 429).
    local resp http retry_after body err
    resp=$(curl -s -i --max-time 3 "https://api.anthropic.com/api/oauth/usage" \
        -H "Accept: application/json" \
        -H "Authorization: Bearer $token" \
        -H "anthropic-beta: oauth-2025-04-20" \
        -H "User-Agent: claude-code/2.1.69" 2>/dev/null)
    http=$(printf '%s' "$resp" | head -1 | tr -d '\r' | awk '{print $2}')
    retry_after=$(printf '%s' "$resp" | grep -i '^retry-after:' | head -1 | tr -d '\r' | awk '{print $2}')
    body=$(printf '%s' "$resp" | awk 'b{print} /^\r?$/{b=1}')

    err=$(printf '%s' "$body" | jq -r '.error.type // empty' 2>/dev/null)

    if [[ "$http" == "200" && -z "$err" && -n "$body" ]]; then
        printf '%s\n' "$body" > "$USAGE_CACHE"
        rm -f "$USAGE_RETRY_FILE"  # recovered — clear any cooldown
        rmdir "$USAGE_LOCK" 2>/dev/null
        printf '%s\n' "$body"
        return
    fi

    # Failure. If the server told us when to retry, record the deadline so every
    # session stops fetching until it passes (see step 2).
    if [[ "$retry_after" =~ ^[0-9]+$ && $retry_after -gt 0 ]]; then
        [[ $retry_after -gt $USAGE_RETRY_CAP ]] && retry_after=$USAGE_RETRY_CAP
        echo $((now + retry_after)) > "$USAGE_RETRY_FILE"
    fi

    rmdir "$USAGE_LOCK" 2>/dev/null
    # Serve stale cache if we have it; otherwise surface the error body.
    if [[ -f "$USAGE_CACHE" ]]; then
        cat "$USAGE_CACHE"
    else
        printf '%s\n' "$body"
    fi
}

CZK_CACHE="$CACHE_DIR/claude-czk-cache.txt"
CZK_CACHE_TTL=3600  # 1 hour

fetch_usd_czk_rate() {
    if [[ -f "$CZK_CACHE" ]]; then
        local now cache_mtime age
        now=$(date +%s)
        cache_mtime=$(stat -c %Y "$CZK_CACHE" 2>/dev/null || stat -f %m "$CZK_CACHE" 2>/dev/null)
        if [[ -n "$cache_mtime" ]]; then
            age=$((now - cache_mtime))
            if [[ $age -lt $CZK_CACHE_TTL ]]; then
                cat "$CZK_CACHE"
                return
            fi
        fi
    fi

    local rate
    rate=$(curl -s --max-time 2 "https://api.frankfurter.dev/v1/latest?base=USD&symbols=CZK" 2>/dev/null | jq -r '.rates.CZK // empty' 2>/dev/null)
    if [[ -n "$rate" ]]; then
        echo "$rate" > "$CZK_CACHE"
    elif [[ -f "$CZK_CACHE" ]]; then
        cat "$CZK_CACHE"
        return
    fi
    echo "$rate"
}

# --- Session token + cost (from statusLine JSON) ---
session_tokens_in=$(echo "$input" | jq -r '.context_window.total_input_tokens // empty' 2>/dev/null)
session_tokens_out=$(echo "$input" | jq -r '.context_window.total_output_tokens // empty' 2>/dev/null)
session_cost_usd_raw=$(echo "$input" | jq -r '.cost.total_cost_usd // empty' 2>/dev/null)

session_tokens_total=""
if [[ -n "$session_tokens_in" && -n "$session_tokens_out" ]]; then
    if [[ "$session_tokens_in" =~ ^[0-9]+$ && "$session_tokens_out" =~ ^[0-9]+$ ]]; then
        session_tokens_total=$((session_tokens_in + session_tokens_out))
    fi
fi

usd_disp=""
czk_disp=""
if [[ -n "$session_cost_usd_raw" && "$session_cost_usd_raw" != "null" ]]; then
    usd_disp=$(round_n "$session_cost_usd_raw" 3)
    if [[ -n "$usd_disp" ]]; then
        rate=$(fetch_usd_czk_rate)
        if [[ -n "$rate" && "$rate" != "null" ]]; then
            czk_val=$(LC_ALL=C awk -v u="$usd_disp" -v r="$rate" 'BEGIN{ printf("%.2f", (u+0)*(r+0)) }' 2>/dev/null)
            if [[ -n "$czk_val" ]]; then
                czk_disp="${czk_val}Kč"
            fi
        fi
    fi
fi

# --- Quota utilization (5h + 7d) ---
quota_line=""
TOKEN=$(get_oauth_token)
USAGE_DATA=""
if [[ -n "$TOKEN" ]]; then
    USAGE_DATA=$(fetch_usage_json "$TOKEN")
fi

# Age of the numbers on screen = time since the cache last held a SUCCESSFUL
# fetch (its mtime). The endpoint rate-limits us (HTTP 429), and on failure we
# serve the stale cache — so this age is how we know the reading is frozen.
usage_age=""
if [[ -f "$USAGE_CACHE" ]]; then
    _cm=$(stat -c %Y "$USAGE_CACHE" 2>/dev/null || stat -f %m "$USAGE_CACHE" 2>/dev/null)
    [[ -n "$_cm" ]] && usage_age=$(( $(date +%s) - _cm ))
fi
is_stale=0
if [[ -n "$usage_age" && "$usage_age" =~ ^[0-9]+$ && $usage_age -gt $USAGE_STALE_SECS ]]; then
    is_stale=1
fi

aerr=$(echo "$USAGE_DATA" | jq -r '.error.type // empty' 2>/dev/null)
if [[ -z "$aerr" ]]; then
    five_raw=$(echo "$USAGE_DATA" | jq -r '.five_hour.utilization // empty' 2>/dev/null)
    seven_raw=$(echo "$USAGE_DATA" | jq -r '.seven_day.utilization // empty' 2>/dev/null)
    five_resets=$(echo "$USAGE_DATA" | jq -r '.five_hour.resets_at // empty' 2>/dev/null)
    seven_resets=$(echo "$USAGE_DATA" | jq -r '.seven_day.resets_at // empty' 2>/dev/null)

    five_pct=$(format_pct "$five_raw")
    seven_pct=$(format_pct "$seven_raw")

    # Fresh: keep the original look. Stale: paint labels + numbers coral red and
    # bracket the line with ⚠ + age, so a frozen reading is unmistakable.
    lbl="$C_GRAY"; txt=""
    if [[ $is_stale -eq 1 ]]; then lbl="$C_WARN"; txt="$C_WARN"; fi

    if [[ -n "$five_pct" && "$five_pct" =~ ^[0-9]+$ ]]; then
        [[ $five_pct -gt 100 ]] && five_pct=100
        five_bar=$(progress_bar "$five_pct" 8)
        five_countdown=$(time_until "$five_resets")
        [[ $is_stale -eq 1 ]] && quota_line="${C_WARN}⚠ " || quota_line=""
        quota_line+="${lbl}5h ${five_bar}${txt} ${five_pct}%"
        [[ -n "$five_countdown" ]] && quota_line+="${txt} ⏳${five_countdown}"

        if [[ -n "$seven_pct" && "$seven_pct" =~ ^[0-9]+$ ]]; then
            [[ $seven_pct -gt 100 ]] && seven_pct=100
            seven_bar=$(progress_bar "$seven_pct" 8)
            seven_countdown=$(time_until "$seven_resets")
            quota_line+="${lbl} | 7d ${seven_bar}${txt} ${seven_pct}%"
            [[ -n "$seven_countdown" ]] && quota_line+="${txt} ⏳${seven_countdown}"
        else
            quota_line+="${lbl} | 7d n/a"
        fi

        if [[ $is_stale -eq 1 ]]; then
            quota_line+="${C_WARN} · $(human_age "$usage_age") old ⚠${C_RESET}"
        else
            quota_line+="${C_RESET}"
        fi
    fi
else
    # Endpoint errored AND no cached numbers to fall back on — say so plainly in
    # warning color rather than showing a fabricated reading.
    quota_line="${C_WARN}5h n/a | 7d n/a (usage endpoint unavailable)${C_RESET}"
fi

# --- Build 4-line status output ---
line1="${C_ACCENT}${model}${C_RESET}"

line2="${C_GRAY}📁${dir}"
[[ -n "$branch" ]] && line2+=" | 🔀${branch}"
line2+="${C_RESET}"

line3="${C_GRAY}🔥 ${ctx_bar} ${pct_prefix}${pct}% of ${max_k}k tokens"
if [[ -n "$usd_disp" ]]; then
    line3+=" | \$${usd_disp}"
    [[ -n "$czk_disp" ]] && line3+=" | ${czk_disp}"
fi
line3+="${C_RESET}"

line4=""
if [[ -n "$quota_line" ]]; then
    line4="$quota_line"
fi

printf '%b
' "$line1"
printf '%b
' "$line2"
printf '%b
' "$line3"
[[ -n "$line4" ]] && printf '%b
' "$line4"

# --- Last user message (text only) ---
if [[ -n "$transcript_path" && -f "$transcript_path" ]]; then
    plain_line2="${dir}"
    [[ -n "$branch" ]] && plain_line2+=" | ${branch}"
    max_len=${#plain_line2}

    last_user_msg=$(jq -rs '
        def is_unhelpful:
            startswith("[Request interrupted") or
            startswith("[Request cancelled") or
            . == "";

        [.[] | select(.type == "user") |
         select(.message.content | type == "string" or
                (type == "array" and any(.[]; .type == "text")))] |
        reverse |
        map(.message.content |
            if type == "string" then .
            else [.[] | select(.type == "text") | .text] | join(" ") end |
            gsub("\n"; " ") | gsub("  +"; " ")) |
        map(select(is_unhelpful | not)) |
        first // ""
    ' < "$transcript_path" 2>/dev/null)

    if [[ -n "$last_user_msg" ]]; then
        if [[ ${#last_user_msg} -gt $max_len ]]; then
            echo "💬 ${last_user_msg:0:$((max_len - 3))}..."
        else
            echo "💬 ${last_user_msg}"
        fi
    fi
fi
