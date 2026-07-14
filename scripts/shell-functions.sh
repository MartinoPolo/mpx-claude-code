#!/bin/bash
# Shell wrapper functions for worktree scripts
# Source this in your .bashrc/.zshrc:
#
#   source /path/to/mpx-claude-code/scripts/shell-functions.sh

_MPX_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

setup-worktree() {
  bash "$_MPX_SCRIPTS_DIR/setup-worktree.sh" "$@"
  local target
  target=$(cat "${TMPDIR:-/tmp}/worktree-cd-path" 2>/dev/null)
  rm -f "${TMPDIR:-/tmp}/worktree-cd-path"
  if [ -n "$target" ] && [ -d "$target" ]; then
    cd "$target" || return
    claude
  fi
}

remove-worktree() {
  bash "$_MPX_SCRIPTS_DIR/remove-worktree.sh" "$@"
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
