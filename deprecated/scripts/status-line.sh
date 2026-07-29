#!/bin/bash

# Color theme: gray, orange, blue, teal, green, lavender, rose, gold, slate, cyan
COLOR="blue"

# Color codes — all use the $'\033[...' form so the file stays ASCII (no raw ESC
# bytes to corrupt in an editor). The final printf '%b' emits them unchanged.
C_RESET=$'\033[0m'
C_GRAY=$'\033[38;5;245m'       # explicit gray for default text
C_BAR_EMPTY=$'\033[38;5;238m'
case "$COLOR" in
    orange)   C_ACCENT=$'\033[38;5;173m' ;;
    blue)     C_ACCENT=$'\033[38;5;74m' ;;
    teal)     C_ACCENT=$'\033[38;5;66m' ;;
    green)    C_ACCENT=$'\033[38;5;71m' ;;
    lavender) C_ACCENT=$'\033[38;5;139m' ;;
    rose)     C_ACCENT=$'\033[38;5;132m' ;;
    gold)     C_ACCENT=$'\033[38;5;136m' ;;
    slate)    C_ACCENT=$'\033[38;5;60m' ;;
    cyan)     C_ACCENT=$'\033[38;5;37m' ;;
    *)        C_ACCENT="$C_GRAY" ;;  # gray: all same color
esac

# Warning color for stale/unreliable data (coral red).
C_WARN=$'\033[38;5;203m'

# Context-consumption escalation (absolute input tokens): the 🔥 token count
# shifts yellow -> orange -> red as context fills, so a heavy session is
# obvious at a glance. Thresholds in the line-4 build below.
C_CTX_YELLOW=$'\033[38;5;220m'   # >=100k tokens
C_CTX_ORANGE=$'\033[38;5;208m'   # >=140k tokens
C_CTX_RED=$'\033[38;5;196m'      # >=180k tokens

# Account colors — distinct from C_ACCENT and from each other, so
# model/account/work-vs-personal all read as separate signals at a glance.
C_PERSONAL=$'\033[38;5;71m'   # green
C_WORK=$'\033[38;5;173m'      # orange

# Line-edit colors: green additions, red deletions.
C_ADD=$'\033[38;5;71m'        # green: + lines added
C_DEL=$'\033[38;5;167m'       # red: - lines removed

# Git/MR colors: sand for "never left this machine" (local branch, draft MR),
# blue for the MR/PR reference itself.
C_LOCAL=$'\033[38;5;180m'
C_DRAFT=$'\033[38;5;180m'
C_MR=$'\033[38;5;74m'

# Session name (line 1): lavender — distinct from the blue model line.
C_SESSION=$'\033[38;5;141m'

input=$(cat)

# Field separator for packing jq output into `read`. Must be a NON-whitespace
# byte: `read` with an IFS-whitespace delimiter (space/tab/newline) collapses
# consecutive delimiters and strips leading/trailing ones, which silently drops
# empty fields and shifts every later field. ASCII Unit Separator (0x1F) never
# appears in the data, so empty fields are preserved and columns stay aligned.
US=$'\037'

# --- Single-pass extraction of every stdin field (one jq call) ---------------
# Spawning jq ~18× under Windows Git Bash cost ~2s/render and made Claude Code
# kill the status line mid-work. One jq call keeps the whole render well under
# the render budget. rate_limits (Claude Code >= 2.1.80) carries the 5h/7d quota
# straight to us — no network, so no /api/oauth/usage 429s.
IFS="$US" read -r session_name session_id model cwd max_context \
    session_tokens_in context_used_pct session_cost_usd_raw lines_added lines_removed \
    effort_level five_raw five_resets seven_raw seven_resets \
    < <(printf '%s' "$input" | jq -j '[
        (.session_name // ""),
        (.session_id // ""),
        (.model.display_name // .model.id // "?"),
        (.cwd // ""),
        (.context_window.context_window_size // 200000),
        (.context_window.total_input_tokens // ""),
        (.context_window.used_percentage // ""),
        (.cost.total_cost_usd // ""),
        (.cost.total_lines_added // ""),
        (.cost.total_lines_removed // ""),
        (.effort.level // ""),
        (.rate_limits.five_hour.used_percentage // ""),
        (.rate_limits.five_hour.resets_at // ""),
        (.rate_limits.seven_day.used_percentage // ""),
        (.rate_limits.seven_day.resets_at // "")
    ] | map(tostring | gsub("[\n\r]"; " ")) | join("\u001f")' 2>/dev/null)

[[ -z "$model" ]] && model="?"
[[ "$max_context" =~ ^[0-9]+$ ]] || max_context=200000
short_id="${session_id:0:8}"

dir=$(basename "$cwd" 2>/dev/null || echo "?")

# Account (work vs personal). `.claude-work` = work account (ccw/ccwd aliases);
# anything else (default ~/.claude via cc/ccd) = personal. Used for the quota
# cache key too, so the two accounts never read each other's numbers.
account_cfg_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
case "$account_cfg_dir" in
    *.claude-work*|*claude-work*) account_label="Work"; account_color="$C_WORK" ;;
    *)                            account_label="Personal"; account_color="$C_PERSONAL" ;;
esac

# Git branch + sync signs. ONE git call (~52ms) carries branch name, upstream,
# ahead/behind and dirty state; --untracked-files=no keeps it O(index) instead
# of walking the tree.
branch=""
git_signs=""
git_dirt=""
if [[ -n "$cwd" && -d "$cwd" ]]; then
    has_upstream=0; has_ab=0; ahead=0; behind=0; staged=0; unstaged=0; conflicts=0
    while IFS= read -r git_line; do
        case "$git_line" in
            '# branch.head '*)     branch="${git_line#\# branch.head }" ;;
            '# branch.upstream '*) has_upstream=1 ;;
            '# branch.ab '*)
                has_ab=1
                read -r _ _ ahead_field behind_field <<< "$git_line"
                ahead="${ahead_field#+}"; behind="${behind_field#-}"
                ;;
            '1 '*|'2 '*)
                read -r _ xy _ <<< "$git_line"
                [[ "${xy:0:1}" != "." ]] && ((staged++))
                [[ "${xy:1:1}" != "." ]] && ((unstaged++))
                ;;
            'u '*) ((conflicts++)) ;;
        esac
    done < <(git -C "$cwd" status --porcelain=v2 --branch --untracked-files=no 2>/dev/null)
    [[ "$branch" == "(detached)" ]] && branch="detached"

    if [[ -n "$branch" ]]; then
        if   [[ $has_upstream -eq 0 ]];         then git_signs="${C_LOCAL}⌂local${C_RESET}"
        # An upstream with no branch.ab line is exactly how git reports a
        # deleted remote branch.
        elif [[ $has_ab -eq 0 ]];               then git_signs="${C_WARN}⊘gone${C_RESET}"
        elif [[ $ahead -gt 0 && $behind -gt 0 ]]; then git_signs="${C_WARN}⇅${ahead}/${behind}${C_RESET}"
        elif [[ $ahead -gt 0 ]];                then git_signs="${C_ADD}↑${ahead}${C_RESET}"
        elif [[ $behind -gt 0 ]];               then git_signs="${C_DEL}↓${behind}${C_RESET}"
        else                                         git_signs="${C_ADD}≡${C_RESET}"
        fi
        [[ $staged    -gt 0 ]] && git_dirt+=" ${C_ADD}●${staged}${C_RESET}"
        [[ $unstaged  -gt 0 ]] && git_dirt+=" ${C_DEL}✎${unstaged}${C_RESET}"
        [[ $conflicts -gt 0 ]] && git_dirt+=" ${C_WARN}⚠${conflicts}${C_RESET}"
    fi
fi

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
    # Accepts either a Unix epoch (stdin rate_limits.*.resets_at) or an ISO-8601
    # string (endpoint fallback .*.resets_at). Prints a compact "1h 21m" / "5d 5h".
    local v="$1"
    [[ -z "$v" || "$v" == "null" ]] && return
    local reset_epoch now_epoch diff
    if [[ "$v" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
        reset_epoch="${v%.*}"                       # epoch seconds
    else
        reset_epoch=$(date -d "$v" +%s 2>/dev/null) || return   # ISO string
    fi
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
# Quota cache keyed by account (Personal/Work), NOT by config-dir path — the path
# arrives in two forms (C:\Users\... vs /c/Users/...) which used to split one
# account across two caches and double the fetch rate. TSV: five  five_resets  seven  seven_resets.
USAGE_CACHE="$CACHE_DIR/claude-usage-${account_label}.tsv"
USAGE_ATTEMPT="$CACHE_DIR/claude-usage-attempt-${account_label}"
USAGE_RETRY_FILE="$CACHE_DIR/claude-usage-retry-${account_label}"
USAGE_STALE_SECS=900    # 15 min: cached quota older than this gets a muted age note
USAGE_WARN_SECS=1800    # 30 min: older than this is flagged coral (genuinely outdated)
WARM_MIN_INTERVAL=300   # min seconds between background endpoint warm-fetches
USAGE_RETRY_CAP=3600    # clamp for a server Retry-After we honor

# Endpoint fetch -> cache. Runs ONLY in the background (never blocks/kills the
# render) and ONLY as a cold-start fallback when stdin has no rate_limits yet.
warm_usage_cache() {
    local token; token=$(get_oauth_token)
    [[ -z "$token" ]] && return
    local resp http body retry_after fr frs sr srs
    resp=$(curl -s -i --max-time 4 "https://api.anthropic.com/api/oauth/usage" \
        -H "Accept: application/json" \
        -H "Authorization: Bearer $token" \
        -H "anthropic-beta: oauth-2025-04-20" \
        -H "User-Agent: claude-code/2.1.206" 2>/dev/null)
    http=$(printf '%s' "$resp" | head -1 | tr -d '\r' | awk '{print $2}')
    body=$(printf '%s' "$resp" | awk 'b{print} /^\r?$/{b=1}')
    if [[ "$http" == "200" ]]; then
        IFS="$US" read -r fr frs sr srs < <(printf '%s' "$body" | jq -j --arg sep "$US" '[
            (.five_hour.utilization // ""),(.five_hour.resets_at // ""),
            (.seven_day.utilization // ""),(.seven_day.resets_at // "")]
            | map(tostring) | join($sep)' 2>/dev/null)
        if [[ -n "$fr" ]]; then
            printf '%s%s%s%s%s%s%s\n' "$fr" "$US" "$frs" "$US" "$sr" "$US" "$srs" > "$USAGE_CACHE"
            rm -f "$USAGE_RETRY_FILE"
        fi
    else
        # Honor a server Retry-After if present so we stay off the endpoint.
        retry_after=$(printf '%s' "$resp" | grep -i '^retry-after:' | head -1 | tr -d '\r' | awk '{print $2}')
        if [[ "$retry_after" =~ ^[0-9]+$ && $retry_after -gt 0 ]]; then
            [[ $retry_after -gt $USAGE_RETRY_CAP ]] && retry_after=$USAGE_RETRY_CAP
            echo $(( $(date +%s) + retry_after )) > "$USAGE_RETRY_FILE"
        fi
    fi
}

# Spawn a background warm-fetch, rate-limited to WARM_MIN_INTERVAL and gated by
# any server cooldown. Disowned so it outlives this render's process.
maybe_warm_usage() {
    local now; now=$(date +%s)
    if [[ -f "$USAGE_RETRY_FILE" ]]; then
        local ru; ru=$(cat "$USAGE_RETRY_FILE" 2>/dev/null)
        [[ "$ru" =~ ^[0-9]+$ && $now -lt $ru ]] && return
    fi
    if [[ -f "$USAGE_ATTEMPT" ]]; then
        local am; am=$(stat -c %Y "$USAGE_ATTEMPT" 2>/dev/null)
        [[ -n "$am" && $((now - am)) -lt $WARM_MIN_INTERVAL ]] && return
    fi
    : > "$USAGE_ATTEMPT"
    ( warm_usage_cache & ) 2>/dev/null
}

CZK_CACHE="$CACHE_DIR/claude-czk-cache.txt"
CZK_CACHE_TTL=3600  # 1 hour

fetch_usd_czk_rate() {
    # Network-free in steady state: serve cache immediately, refresh in the
    # background when stale so the render never blocks on the FX call.
    local now cache_mtime age
    now=$(date +%s)
    if [[ -f "$CZK_CACHE" ]]; then
        cache_mtime=$(stat -c %Y "$CZK_CACHE" 2>/dev/null)
        age=$((now - ${cache_mtime:-0}))
        cat "$CZK_CACHE"
        if [[ $age -ge $CZK_CACHE_TTL ]]; then
            ( curl -s --max-time 3 "https://api.frankfurter.dev/v1/latest?base=USD&symbols=CZK" 2>/dev/null \
                | jq -r '.rates.CZK // empty' 2>/dev/null | tr -d '\r' > "$CZK_CACHE.tmp" \
                && mv "$CZK_CACHE.tmp" "$CZK_CACHE" 2>/dev/null ) & disown 2>/dev/null
        fi
        return
    fi
    # No cache yet — fetch once synchronously (rare).
    local rate
    rate=$(curl -s --max-time 3 "https://api.frankfurter.dev/v1/latest?base=USD&symbols=CZK" 2>/dev/null | jq -r '.rates.CZK // empty' 2>/dev/null | tr -d '\r')
    [[ -n "$rate" ]] && echo "$rate" > "$CZK_CACHE"
    echo "$rate"
}

# --- Session cost (USD + CZK) ---
usd_disp=""
czk_disp=""
if [[ -n "$session_cost_usd_raw" && "$session_cost_usd_raw" != "null" ]]; then
    usd_disp=$(round_n "$session_cost_usd_raw" 3)
    if [[ -n "$usd_disp" ]]; then
        rate=$(fetch_usd_czk_rate)
        if [[ -n "$rate" && "$rate" != "null" ]]; then
            czk_val=$(LC_ALL=C awk -v u="$usd_disp" -v r="$rate" 'BEGIN{ printf("%.2f", (u+0)*(r+0)) }' 2>/dev/null)
            [[ -n "$czk_val" ]] && czk_disp="${czk_val}Kč"
        fi
    fi
fi

# --- Quota utilization (5h + 7d) ---------------------------------------------
# Source order: (1) stdin rate_limits — live, no network; (2) cached last-known
# (covers the seconds before a fresh session's first API response). The endpoint
# is only ever touched by a background warm when we have neither.
usage_src=""
usage_age=0
if [[ -n "$five_raw" ]]; then
    usage_src="live"
    printf '%s%s%s%s%s%s%s\n' "$five_raw" "$US" "$five_resets" "$US" "$seven_raw" "$US" "$seven_resets" > "$USAGE_CACHE" 2>/dev/null
elif [[ -f "$USAGE_CACHE" ]]; then
    IFS="$US" read -r five_raw five_resets seven_raw seven_resets < "$USAGE_CACHE"
    usage_src="cache"
    _cm=$(stat -c %Y "$USAGE_CACHE" 2>/dev/null)
    [[ -n "$_cm" ]] && usage_age=$(( $(date +%s) - _cm ))
fi

# Cold start (no live data and no fresh cache) -> warm the cache in the background.
if [[ "$usage_src" != "live" ]]; then
    if [[ -z "$five_raw" || ( "$usage_age" =~ ^[0-9]+$ && $usage_age -gt $USAGE_STALE_SECS ) ]]; then
        maybe_warm_usage
    fi
fi

# Staleness applies only to the cache path; live stdin data is always current.
is_stale=0   # muted age note
is_old=0     # coral + ⚠ (genuinely outdated)
if [[ "$usage_src" == "cache" && "$usage_age" =~ ^[0-9]+$ ]]; then
    [[ $usage_age -gt $USAGE_STALE_SECS ]] && is_stale=1
    [[ $usage_age -gt $USAGE_WARN_SECS ]] && is_old=1
fi

quota_line=""
five_pct=$(format_pct "$five_raw")
seven_pct=$(format_pct "$seven_raw")

if [[ -n "$five_pct" && "$five_pct" =~ ^[0-9]+$ ]]; then
    lbl="$C_GRAY"; txt=""
    if [[ $is_old -eq 1 ]]; then lbl="$C_WARN"; txt="$C_WARN"; fi

    [[ $five_pct -gt 100 ]] && five_pct=100
    five_bar=$(progress_bar "$five_pct" 8)
    five_countdown=$(time_until "$five_resets")
    [[ $is_old -eq 1 ]] && quota_line="${C_WARN}⚠ " || quota_line=""
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

    if [[ $is_old -eq 1 ]]; then
        quota_line+="${C_WARN} · $(human_age "$usage_age") old ⚠${C_RESET}"
    elif [[ $is_stale -eq 1 ]]; then
        quota_line+="${C_GRAY} · $(human_age "$usage_age")${C_RESET}"
    else
        quota_line+="${C_RESET}"
    fi
fi

# --- Context tokens + %: from stdin (no transcript math), fall back to tokens/max ---
ctx_pct=$(format_pct "$context_used_pct")
if ! [[ "$ctx_pct" =~ ^[0-9]+$ ]] && [[ "$session_tokens_in" =~ ^[0-9]+$ ]]; then
    ctx_pct=$(( session_tokens_in * 100 / max_context ))
fi
[[ "$ctx_pct" =~ ^[0-9]+$ && $ctx_pct -gt 100 ]] && ctx_pct=100
tokens_k=""
[[ "$session_tokens_in" =~ ^[0-9]+$ ]] && tokens_k=$(( (session_tokens_in + 500) / 1000 ))

# --- MR/PR block + fetch age -------------------------------------------------
# Pure cache read (~0.5ms) plus a possible detached spawn: the render itself
# never touches the network, since Claude Code cancels a status line that blocks.
MR_TTL=90            # refetch cached MR/PR data past this
MR_ATTEMPT_MIN=30    # floor between refresh attempts (also covers failures / no-MR)
MR_STALE_NOTE=600    # show an age note past this

mr_block=""
fetch_age=""
if [[ -n "$branch" ]]; then
    # sha1sum would cost a process; sanitizing the path is enough for a key.
    # `${var: -N}` yields "" when N exceeds the length, hence the length guard.
    mr_key="${cwd}|${branch}"
    mr_key="${mr_key//[^a-zA-Z0-9]/_}"
    (( ${#mr_key} > 100 )) && mr_key="${mr_key: -100}"
    mr_cache="$CACHE_DIR/claude-mr-$mr_key.tsv"
    mr_attempt="$CACHE_DIR/claude-mr-attempt-$mr_key"

    mr_ts=""; mr_provider=""; mr_iid=""; mr_draft=""; mr_conflicts=""; mr_approved=""
    mr_appr_req=""; mr_appr_left=""; mr_status=""; mr_notes=""; mr_pipeline=""
    mr_url=""; mr_fetch_epoch=""
    [[ -f "$mr_cache" ]] && IFS="$US" read -r mr_ts mr_provider mr_iid mr_draft mr_conflicts \
        mr_approved mr_appr_req mr_appr_left mr_status mr_notes mr_pipeline mr_url \
        mr_fetch_epoch < "$mr_cache"

    mr_cache_age=999999
    [[ "$mr_ts" =~ ^[0-9]+$ ]] && mr_cache_age=$(( EPOCHSECONDS - mr_ts ))

    if [[ $mr_cache_age -ge $MR_TTL ]]; then
        # The marker's own mtime would need `stat`, so it carries its timestamp
        # as its contents instead.
        mr_attempt_ts=""
        [[ -f "$mr_attempt" ]] && read -r mr_attempt_ts < "$mr_attempt"
        mr_attempt_age=999999
        [[ "$mr_attempt_ts" =~ ^[0-9]+$ ]] && mr_attempt_age=$(( EPOCHSECONDS - mr_attempt_ts ))
        if [[ $mr_attempt_age -ge $MR_ATTEMPT_MIN ]]; then
            printf '%s' "$EPOCHSECONDS" > "$mr_attempt" 2>/dev/null
            ( "${BASH_SOURCE[0]%/*}/status-line-mr-refresh.sh" "$cwd" "$branch" "$mr_cache" >/dev/null 2>&1 & ) 2>/dev/null
        fi
    fi

    # Ahead/behind compares against the local copy of the remote ref, so `≡`
    # silently lies until a fetch happens; the age says how far to trust it.
    if [[ "$mr_fetch_epoch" =~ ^[0-9]+$ ]]; then
        fetch_secs=$(( EPOCHSECONDS - mr_fetch_epoch ))
        if   [[ $fetch_secs -ge 86400 ]]; then fetch_age=" ${C_WARN}⟳$((fetch_secs / 86400))d${C_RESET}"
        elif [[ $fetch_secs -ge 3600 ]];  then fetch_age=" ${C_GRAY}⟳$((fetch_secs / 3600))h${C_RESET}"
        elif [[ $fetch_secs -ge 600 ]];   then fetch_age=" ${C_GRAY}⟳$((fetch_secs / 60))m${C_RESET}"
        fi
    fi

    if [[ -n "$mr_iid" ]]; then
        [[ "$mr_provider" == "github" ]] && mr_ref="#${mr_iid}" || mr_ref="!${mr_iid}"
        # OSC-8 hyperlink: Windows Terminal makes the reference clickable.
        if [[ -n "$mr_url" ]]; then
            mr_block="${C_MR}"$'\033]8;;'"${mr_url}"$'\033\\'"${mr_ref}"$'\033]8;;'$'\033\\'"${C_RESET}"
        else
            mr_block="${C_MR}${mr_ref}${C_RESET}"
        fi

        if   [[ "$mr_draft" == "true" ]];              then mr_block+=" ${C_DRAFT}✎draft${C_RESET}"
        elif [[ "$mr_conflicts" == "true" ]];          then mr_block+=" ${C_WARN}⚠conflicts${C_RESET}"
        elif [[ "$mr_status" == "CHANGES_REQUESTED" ]]; then mr_block+=" ${C_WARN}✗changes${C_RESET}"
        elif [[ "$mr_approved" == "true" ]];           then mr_block+=" ${C_ADD}✓approved${C_RESET}"
        elif [[ "$mr_appr_left" =~ ^[0-9]+$ && $mr_appr_left -gt 0 ]]; then
                                                            mr_block+=" ${C_GRAY}◐${mr_appr_left}/${mr_appr_req}${C_RESET}"
        elif [[ "$mr_status" == "MERGEABLE" ]];        then mr_block+=" ${C_ADD}✓mergeable${C_RESET}"
        elif [[ -n "$mr_status" ]];                    then mr_block+=" ${C_GRAY}${mr_status,,}${C_RESET}"
        fi

        case "$mr_pipeline" in
            SUCCESS)          mr_block+=" ${C_ADD}⬤ci${C_RESET}" ;;
            FAILED)           mr_block+=" ${C_WARN}⬤ci${C_RESET}" ;;
            RUNNING)          mr_block+=" ${C_CTX_YELLOW}⬤ci${C_RESET}" ;;
            CANCELED|SKIPPED) mr_block+=" ${C_GRAY}⬤ci${C_RESET}" ;;
        esac

        [[ "$mr_notes" =~ ^[0-9]+$ && $mr_notes -gt 0 ]] && mr_block+=" ${C_GRAY}💬${mr_notes}${C_RESET}"
        [[ $mr_cache_age -ge $MR_STALE_NOTE ]] && mr_block+=" ${C_GRAY}·$((mr_cache_age / 60))m${C_RESET}"
    fi
fi

# --- Build status output -----------------------------------------------------
# Line 1: session name + short session id
line1=""
[[ -n "$session_name" ]] && line1="${C_SESSION}${session_name}${C_RESET}"
if [[ -n "$short_id" ]]; then
    [[ -n "$line1" ]] && line1+=" "
    line1+="${C_GRAY}#${short_id}${C_RESET}"
fi

# Line 2: model <effort> · account
line2="${C_ACCENT}${model}${C_RESET}"
[[ -n "$effort_level" ]] && line2+=" ${C_GRAY}<${effort_level}>${C_RESET}"
line2+=" ${C_GRAY}·${C_RESET} ${account_color}${account_label}${C_RESET}"

# Line 3: worktree dir + branch
line3="${C_GRAY}📁${dir}"
if [[ -n "$branch" ]]; then
    line3+=" | 🔀${branch}"
    [[ -n "$git_signs" ]] && line3+=" ${git_signs}${C_GRAY}"
    line3+="${git_dirt}${fetch_age}${C_GRAY}"
fi
[[ -n "$mr_block" ]] && line3+=" | ${mr_block}${C_GRAY}"
line3+="${C_RESET}"

# Line 4: context tokens (%), session cost, line edits (green +/red -)
# Context color escalates by absolute input tokens: >=100k yellow, >=140k
# orange, >=180k red — else the default gray.
ctx_color="$C_GRAY"
if [[ "$session_tokens_in" =~ ^[0-9]+$ ]]; then
    if   [[ $session_tokens_in -ge 180000 ]]; then ctx_color="$C_CTX_RED"
    elif [[ $session_tokens_in -ge 140000 ]]; then ctx_color="$C_CTX_ORANGE"
    elif [[ $session_tokens_in -ge 100000 ]]; then ctx_color="$C_CTX_YELLOW"
    fi
fi
line4="${ctx_color}🔥 "
if [[ -n "$tokens_k" ]]; then
    line4+="${tokens_k}k"
    [[ "$ctx_pct" =~ ^[0-9]+$ ]] && line4+=" (${ctx_pct}%)"
elif [[ "$ctx_pct" =~ ^[0-9]+$ ]]; then
    line4+="${ctx_pct}%"
fi
line4+="${C_RESET}"
if [[ -n "$usd_disp" ]]; then
    line4+="${C_GRAY} | \$${usd_disp}"
    [[ -n "$czk_disp" ]] && line4+=" | ${czk_disp}"
fi
if [[ "$lines_added" =~ ^[0-9]+$ || "$lines_removed" =~ ^[0-9]+$ ]]; then
    line4+="${C_GRAY} |"
    [[ "$lines_added" =~ ^[0-9]+$ ]] && line4+=" ${C_ADD}+${lines_added}${C_RESET}"
    [[ "$lines_removed" =~ ^[0-9]+$ ]] && line4+=" ${C_DEL}-${lines_removed}${C_RESET}"
fi
line4+="${C_RESET}"

printf '%b\n' "$line1"
printf '%b\n' "$line2"
printf '%b\n' "$line3"
printf '%b\n' "$line4"
[[ -n "$quota_line" ]] && printf '%b\n' "$quota_line"
