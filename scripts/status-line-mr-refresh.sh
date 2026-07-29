#!/bin/bash
# Background refresher for the status line's MR/PR block. One network call, one
# atomic cache write, exit. Never invoked inline: Claude Code cancels a status
# line that blocks, and the API call costs ~0.7s.
#
# Usage: status-line-mr-refresh.sh <cwd> <branch> <cache_path>

cwd="$1"
branch="$2"
cache="$3"
[[ -z "$cwd" || -z "$branch" || -z "$cache" ]] && exit 1

US=$'\037'

# host + owner/project from the origin remote. Handles ssh, ssh://, https.
parse_remote() {
    local url="$1" host path
    case "$url" in
        git@*)   host="${url#git@}"; host="${host%%:*}"; path="${url#*:}" ;;
        ssh://*) url="${url#ssh://}"; url="${url#*@}"; host="${url%%/*}"; host="${host%%:*}"; path="${url#*/}" ;;
        https://*|http://*)
                 url="${url#*://}"; url="${url#*@}"; host="${url%%/*}"; path="${url#*/}" ;;
        *)       return 1 ;;
    esac
    path="${path%.git}"
    [[ -z "$host" || -z "$path" ]] && return 1
    printf '%s\t%s' "$host" "$path"
}

# Epoch mtime of FETCH_HEAD. --git-common-dir keeps a linked worktree pointed at
# the main repo, which is where FETCH_HEAD actually lives; --path-format=absolute
# is required because the plain form prints a bare ".git" that would resolve
# against this script's cwd, not the target repo's.
fetch_head_epoch() {
    local common_dir
    common_dir=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return
    [[ -f "$common_dir/FETCH_HEAD" ]] || return
    stat -c %Y "$common_dir/FETCH_HEAD" 2>/dev/null
}

# 13 US-delimited fields: ts provider iid draft conflicts approved appr_req
# appr_left status notes pipeline url fetch_epoch. Written atomically so a
# concurrent render never reads a half-written line.
write_cache() {
    printf '%s\n' "$1" > "$cache.tmp" 2>/dev/null && mv "$cache.tmp" "$cache" 2>/dev/null
}

fetch_epoch=$(fetch_head_epoch)

IFS=$'\t' read -r host project < <(parse_remote "$(git -C "$cwd" remote get-url origin 2>/dev/null)")

provider=""
case "$host" in
    *gitlab*) provider="gitlab" ;;
    *github*) provider="github" ;;
esac

# Non-GitLab/GitHub repos still want fetch_epoch cached, so always write.
if [[ -z "$provider" ]]; then
    write_cache "${EPOCHSECONDS}${US}${US}${US}${US}${US}${US}${US}${US}${US}${US}${US}${US}${fetch_epoch}"
    exit 0
fi

fields=""
if [[ "$provider" == "gitlab" ]]; then
    command -v glab >/dev/null 2>&1 || exit 0
    query='query($p:ID!,$b:[String!]){project(fullPath:$p){mergeRequests(state:opened,sourceBranches:$b){nodes{
        iid draft conflicts approved approvalsRequired approvalsLeft detailedMergeStatus
        userNotesCount webUrl headPipeline{status} }}}}'
    response=$(GITLAB_HOST="$host" timeout 10 glab api graphql \
        -f query="$query" -f p="$project" -f b="$branch" 2>/dev/null) || exit 1
    [[ -z "$response" ]] && exit 1
    fields=$(printf '%s' "$response" | jq -j --arg sep "$US" '
        if .data.project == null then error("no project") else . end
        | (.data.project.mergeRequests.nodes[0] // null) as $mr
        | if $mr == null then ["","","","","0","0","","0","",""]
          else
            [ ($mr.iid|tostring), ($mr.draft|tostring), ($mr.conflicts|tostring),
              ($mr.approved|tostring), ($mr.approvalsRequired // 0|tostring),
              ($mr.approvalsLeft // 0|tostring), ($mr.detailedMergeStatus // ""),
              ($mr.userNotesCount // 0|tostring),
              ((($mr.headPipeline.status // "") | ascii_upcase) as $p
               | if ["PENDING","CREATED","WAITING_FOR_RESOURCE","PREPARING"] | index($p) then "RUNNING"
                 elif ["SUCCESS","FAILED","RUNNING","CANCELED","SKIPPED"] | index($p) then $p
                 else "" end),
              ($mr.webUrl // "") ]
          end
        | join($sep)' 2>/dev/null) || exit 1
else
    command -v gh >/dev/null 2>&1 || exit 0
    # `pr list` returns [] with no PR; `pr view` errors instead.
    response=$(timeout 10 gh pr list -R "$project" --head "$branch" --state open --limit 1 \
        --json number,isDraft,mergeable,reviewDecision,statusCheckRollup,url,comments 2>/dev/null) || exit 1
    [[ -z "$response" ]] && exit 1
    fields=$(printf '%s' "$response" | jq -j --arg sep "$US" '
        (.[0] // null) as $pr
        | if $pr == null then ["","","","","0","0","","0","",""]
          else
            [ ($pr.number|tostring), ($pr.isDraft|tostring),
              (($pr.mergeable == "CONFLICTING")|tostring),
              (($pr.reviewDecision == "APPROVED")|tostring), "0", "0",
              (if $pr.reviewDecision == "CHANGES_REQUESTED" then "CHANGES_REQUESTED"
               else ($pr.mergeable // "") end),
              (($pr.comments // []) | length | tostring),
              # statusCheckRollup is an array of individual checks: check-runs
              # carry .conclusion with a null .state, legacy contexts only .state.
              (($pr.statusCheckRollup // []) as $checks
               | [$checks[] | (.conclusion // .state // "") | ascii_upcase] as $states
               | if ($states | map(select(. == "FAILURE" or . == "FAILED" or . == "TIMED_OUT" or . == "ERROR" or . == "CANCELLED")) | length) > 0 then "FAILED"
                 elif ([$checks[] | select(.status != null and .status != "COMPLETED")] | length) > 0 then "RUNNING"
                 elif ($checks | length) > 0 then "SUCCESS"
                 else "" end),
              ($pr.url // "") ]
          end
        | join($sep)' 2>/dev/null) || exit 1
fi

[[ -z "$fields" ]] && exit 1

# An empty iid is a valid result ("no open MR/PR on this branch") and gets
# cached too, otherwise every render re-spawns a refresher on such branches.
write_cache "${EPOCHSECONDS}${US}${provider}${US}${fields}${US}${fetch_epoch}"
