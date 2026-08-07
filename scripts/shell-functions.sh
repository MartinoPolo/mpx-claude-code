#!/bin/bash
# Shell wrapper functions for worktree scripts
# Source this in your .bashrc/.zshrc:
#
#   source /path/to/mpx-claude-code/scripts/shell-functions.sh

_MPX_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

setup-worktree() {
  # Show the live output while capturing it, then cd into the worktree the hub
  # reports on its final `WORKTREE_PATH=` line (a stdout marker avoids Windows
  # temp-path translation between Git Bash and Node).
  local out
  out=$(node "$_MPX_SCRIPTS_DIR/setup-worktree.mts" "$@" | tee /dev/tty)
  local target
  target=$(printf '%s\n' "$out" | sed -n 's/^WORKTREE_PATH=//p' | tail -1)
  if [ -n "$target" ] && [ -d "$target" ]; then
    cd "$target" || return
    claude
  fi
}

remove-worktree() {
  node "$_MPX_SCRIPTS_DIR/remove-worktree.mts" "$@"
}

# Project-scoped herdr. Bare `herdr` attaches a per-project named session
# derived from the MAIN repo, so every worktree of that repo shares one session
# (each worktree can be opened as a space inside it, wherever it lives on disk).
# Non-repo folders fall back to the directory name. Any explicit args
# (e.g. `herdr session list`, `herdr --session x`, `herdr -V`) pass through.
herdr() {
  if [ $# -gt 0 ]; then command herdr "$@"; return; fi
  local proj
  if proj=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
    proj=$(basename "$(dirname "$proj")")   # main repo folder, shared by all its worktrees
  else
    proj=$(basename "$PWD")                  # not a git repo -> use the folder name
  fi
  proj=${proj//[^A-Za-z0-9._-]/-}
  command herdr --session "$proj"
}
