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

get_oauth_token() {
    # 1) env var
    if [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
        echo "$CLAUDE_CODE_OAUTH_TOKEN"
        return
    fi

    # 2) credentials files (Linux/WSL)
    local f
    for f in "$HOME/.claude/.credentials.json" "$HOME/.claude/credentials.json"; do
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
USAGE_CACHE="$CACHE_DIR/claude-usage-cache.json"
USAGE_CACHE_TTL=120  # seconds — endpoint rate-limits at ~1 req/2min

fetch_usage_json() {
    local token="$1"
    [[ -z "$token" ]] && return 1

    # Return cached data if fresh enough
    if [[ -f "$USAGE_CACHE" ]]; then
        local now cache_mtime age
        now=$(date +%s)
        cache_mtime=$(stat -c %Y "$USAGE_CACHE" 2>/dev/null || stat -f %m "$USAGE_CACHE" 2>/dev/null)
        if [[ -n "$cache_mtime" ]]; then
            age=$((now - cache_mtime))
            if [[ $age -lt $USAGE_CACHE_TTL ]]; then
                cat "$USAGE_CACHE"
                return
            fi
        fi
    fi

    # Fetch fresh data
    local resp
    resp=$(curl -s --max-time 3 "https://api.anthropic.com/api/oauth/usage" \
        -H "Accept: application/json" \
        -H "Authorization: Bearer $token" \
        -H "anthropic-beta: oauth-2025-04-20" \
        -H "User-Agent: claude-code/2.1.69" 2>/dev/null)

    # Only cache successful responses (no error field)
    local err
    err=$(echo "$resp" | jq -r '.error.type // empty' 2>/dev/null)
    if [[ -z "$err" && -n "$resp" ]]; then
        echo "$resp" > "$USAGE_CACHE"
    elif [[ -f "$USAGE_CACHE" ]]; then
        # Rate-limited or error — return stale cache instead of nothing
        cat "$USAGE_CACHE"
        return
    fi

    echo "$resp"
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

aerr=$(echo "$USAGE_DATA" | jq -r '.error.type // empty' 2>/dev/null)
if [[ -z "$aerr" ]]; then
    five_raw=$(echo "$USAGE_DATA" | jq -r '.five_hour.utilization // empty' 2>/dev/null)
    seven_raw=$(echo "$USAGE_DATA" | jq -r '.seven_day.utilization // empty' 2>/dev/null)
    five_resets=$(echo "$USAGE_DATA" | jq -r '.five_hour.resets_at // empty' 2>/dev/null)
    seven_resets=$(echo "$USAGE_DATA" | jq -r '.seven_day.resets_at // empty' 2>/dev/null)

    five_pct=$(format_pct "$five_raw")
    seven_pct=$(format_pct "$seven_raw")

    if [[ -n "$five_pct" && "$five_pct" =~ ^[0-9]+$ ]]; then
        [[ $five_pct -gt 100 ]] && five_pct=100
        five_bar=$(progress_bar "$five_pct" 8)
        five_countdown=$(time_until "$five_resets")
        quota_line="${C_GRAY}5h ${five_bar} ${five_pct}%"
        [[ -n "$five_countdown" ]] && quota_line+=" ⏳${five_countdown}"

        if [[ -n "$seven_pct" && "$seven_pct" =~ ^[0-9]+$ ]]; then
            [[ $seven_pct -gt 100 ]] && seven_pct=100
            seven_bar=$(progress_bar "$seven_pct" 8)
            seven_countdown=$(time_until "$seven_resets")
            quota_line+="${C_GRAY} | 7d ${seven_bar} ${seven_pct}%"
            [[ -n "$seven_countdown" ]] && quota_line+=" ⏳${seven_countdown}"
        else
            quota_line+="${C_GRAY} | 7d n/a"
        fi
        quota_line+="${C_RESET}"
    fi
else
    # Keep it short; don't force any fake numbers.
    if [[ "$aerr" == "permission_error" ]]; then
        quota_line="${C_GRAY}5h n/a | 7d n/a${C_RESET}"
    else
        quota_line="${C_GRAY}5h n/a | 7d n/a${C_RESET}"
    fi
fi

# --- Build 3-line status output ---
line1="${C_ACCENT}${model}${C_GRAY} | 📁${dir}"
[[ -n "$branch" ]] && line1+=" | 🔀${branch}"
line1+="${C_RESET}"

line2="${C_GRAY}🔥 ${ctx_bar} ${pct_prefix}${pct}% of ${max_k}k tokens"
if [[ -n "$usd_disp" ]]; then
    line2+=" | \$${usd_disp}"
    [[ -n "$czk_disp" ]] && line2+=" | ${czk_disp}"
fi
line2+="${C_RESET}"

line3=""
if [[ -n "$quota_line" ]]; then
    line3="$quota_line"
fi

printf '%b
' "$line1"
printf '%b
' "$line2"
[[ -n "$line3" ]] && printf '%b
' "$line3"

# --- Last user message (text only) ---
if [[ -n "$transcript_path" && -f "$transcript_path" ]]; then
    plain_line1="${model} | ${dir}"
    [[ -n "$branch" ]] && plain_line1+=" | ${branch}"
    max_len=${#plain_line1}

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
