#!/bin/bash
# Remove worktree script
# Usage: bash remove-worktree.sh [--skip-confirmation] [name...]

set -e

# Colors
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'

GIT_COMMON_DIR=$(git rev-parse --git-common-dir)
MAIN_REPO=$(dirname "$(cd "$GIT_COMMON_DIR" && pwd)")
WORKTREE_DIR="$MAIN_REPO/../worktrees"

# Parse arguments
NAMES=()
SKIP_CONFIRMATION=false
for arg in "$@"; do
  if [ "$arg" = "--skip-confirmation" ]; then
    SKIP_CONFIRMATION=true
    continue
  fi

  normalized="${arg//,/ }"
  for word in $normalized; do
    NAMES+=("$word")
  done
done

# If no names provided, list and prompt
if [ ${#NAMES[@]} -eq 0 ]; then
  echo -e "${CYAN}→${RESET} Usage: bash remove-worktree.sh [name...]"
  echo ""

  mapfile -t worktrees < <(git worktree list | grep "worktrees" | awk '{print $1}' | xargs -I{} basename {})

  if [ ${#worktrees[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠${RESET} No worktrees found."
    exit 0
  fi

  echo "Available worktrees:"
  for i in "${!worktrees[@]}"; do
    echo -e "  ${DIM}$((i+1)))${RESET} ${worktrees[$i]}"
  done
  echo ""

  read -r -p "Enter numbers or names to remove (space/comma separated, q to quit): " selection

  if [ "$selection" = "q" ] || [ -z "$selection" ]; then
    exit 0
  fi

  selection="${selection//,/ }"

  for item in $selection; do
    if [[ "$item" =~ ^[0-9]+$ ]]; then
      index=$((item - 1))
      if [ $index -ge 0 ] && [ $index -lt ${#worktrees[@]} ]; then
        NAMES+=("${worktrees[$index]}")
      else
        echo -e "${RED}✗${RESET} Invalid selection: $item"
        exit 1
      fi
    else
      NAMES+=("$item")
    fi
  done
fi

# Validate all worktrees exist
PATHS=()
for NAME in "${NAMES[@]}"; do
  WORKTREE_PATH="$WORKTREE_DIR/$NAME"
  if [ ! -d "$WORKTREE_PATH" ]; then
    echo -e "${RED}✗${RESET} Worktree '$NAME' not found at $WORKTREE_PATH"
    exit 1
  fi
  PATHS+=("$WORKTREE_PATH")
done

# Show confirmation
if [ "$SKIP_CONFIRMATION" != "true" ]; then
  echo ""
  echo -e "${YELLOW}⚠${RESET} Remove the following worktrees?"
  for i in "${!NAMES[@]}"; do
    echo -e "  ${DIM}-${RESET} ${NAMES[$i]} (${PATHS[$i]})"
  done
  echo ""
  read -r -p "Confirm (Y/n): " confirm
  if [ "$confirm" = "n" ] || [ "$confirm" = "N" ]; then
    echo -e "${YELLOW}⚠${RESET} Cancelled"
    exit 0
  fi
fi

# Remove each worktree
for i in "${!NAMES[@]}"; do
  NAME="${NAMES[$i]}"
  WORKTREE_PATH="${PATHS[$i]}"

  echo ""
  echo -e "${CYAN}→${RESET} Removing worktree '${BOLD}$NAME${RESET}'..."

  if ! git worktree remove --force "$WORKTREE_PATH" 2>/dev/null; then
    echo -e "  ${DIM}Git worktree remove failed, unregistering manually...${RESET}"

    GIT_COMMON=$(git rev-parse --git-common-dir)
    WORKTREE_ADMIN="$GIT_COMMON/worktrees/$NAME"
    if [ -d "$WORKTREE_ADMIN" ]; then
      rm -rf "$WORKTREE_ADMIN"
      echo -e "  ${DIM}Worktree unregistered.${RESET}"
    fi
  fi

  echo -e "${CYAN}→${RESET} Deleting branch..."
  git branch -D "$NAME" 2>/dev/null || echo -e "  ${DIM}Branch already deleted or not found${RESET}"

  echo -e "${CYAN}→${RESET} Removing folder..."
  if [ -d "$WORKTREE_PATH" ]; then
    rm -rf "$WORKTREE_PATH" 2>/dev/null || true

    if [ -d "$WORKTREE_PATH" ]; then
      echo ""
      echo -e "${YELLOW}⚠${RESET} Branch deleted, but folder removal failed (files are locked)."
      echo ""
      echo -e "  ${DIM}Manually delete after closing programs using it:${RESET}"
      echo -e "  ${BOLD}$WORKTREE_PATH${RESET}"
      echo ""
      echo -e "  ${DIM}Common causes:${RESET}"
      echo -e "  ${DIM}- VSCode/IDE with the folder open${RESET}"
      echo -e "  ${DIM}- Terminal cd'd into the folder${RESET}"
      echo -e "  ${DIM}- File explorer browsing the folder${RESET}"
      echo -e "  ${DIM}- Node process (dev server, watchers)${RESET}"
      continue
    fi
  fi

  echo -e "${GREEN}✓${RESET} Removed '$NAME'"
done

git worktree prune

echo ""
echo -e "${GREEN}✓${RESET} All worktrees removed."
