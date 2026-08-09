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
