#!/bin/bash
# Creates a new git worktree for isolated development
# Usage: bash setup-worktree.sh <name> [--color <hex>]

set -e

# Colors
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'

NAME=""
WORKTREE_COLOR=""

usage() {
  echo -e "${RED}✗${RESET} Usage: bash setup-worktree.sh <name> [--color <hex>]"
  echo -e "${DIM}   Example: bash setup-worktree.sh feature-auth --color 7C3AED${RESET}"
}

normalize_hex_color() {
  local raw="$1"
  local normalized="${raw#\#}"
  normalized=$(echo "$normalized" | tr '[:lower:]' '[:upper:]')
  if [[ ! "$normalized" =~ ^[0-9A-F]{6}$ ]]; then
    return 1
  fi
  echo "#$normalized"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --color|-c)
      if [ -z "$2" ]; then
        usage
        exit 1
      fi
      WORKTREE_COLOR=$(normalize_hex_color "$2") || {
        echo -e "${RED}✗${RESET} Invalid color '$2'. Use 6-char hex like '${BOLD}7C3AED${RESET}' or '${BOLD}#7C3AED${RESET}'."
        exit 1
      }
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo -e "${RED}✗${RESET} Unknown option: $1"
      usage
      exit 1
      ;;
    *)
      if [ -z "$NAME" ]; then
        NAME="$1"
      else
        echo -e "${RED}✗${RESET} Unexpected argument: $1"
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$NAME" ]; then
  usage
  exit 1
fi

GIT_COMMON_DIR=$(git rev-parse --git-common-dir)
MAIN_REPO=$(dirname "$(cd "$GIT_COMMON_DIR" && pwd)")
SOURCE_DIR=$(pwd)
WORKTREE_DIR="$MAIN_REPO/../worktrees"
WORKTREE_PATH="$WORKTREE_DIR/$NAME"
CURRENT_BRANCH=$(git branch --show-current)

echo -e "${CYAN}→${RESET} Base repository: ${BOLD}$MAIN_REPO${RESET}"
echo -e "${CYAN}→${RESET} Checked-out base branch: ${BOLD}$CURRENT_BRANCH${RESET}"

copy_dir() {
  local source="$1"
  local target="$2"
  if [ -d "$source" ]; then
    [ -e "$target" ] && rm -rf "$target"
    cp -r "$source" "$target"
    echo -e "  ${DIM}Copied: $(basename "$source")/${RESET}"
  fi
}

copy_file() {
  local source="$1"
  local target="$2"
  if [ -f "$source" ]; then
    mkdir -p "$(dirname "$target")"
    cp "$source" "$target"
    echo -e "  ${DIM}Copied: $(basename "$source")${RESET}"
  fi
}

set_peacock_color() {
  local target_dir="$1"
  local color="$2"
  local vscode_dir="$target_dir/.vscode"
  local settings_file="$vscode_dir/settings.json"

  if [ -z "$color" ]; then
    return 0
  fi

  mkdir -p "$vscode_dir"

  if [ ! -f "$settings_file" ]; then
    printf '{\n  "peacock.color": "%s"\n}\n' "$color" > "$settings_file"
    echo -e "  ${DIM}Set Peacock color: $color${RESET}"
    return 0
  fi

  if grep -q '"peacock.color"' "$settings_file"; then
    perl -0777 -i.bak -pe "s/\"peacock\\.color\"\s*:\s*\"[^\"]*\"/\"peacock.color\": \"$color\"/g" "$settings_file"
    rm -f "$settings_file.bak"
    echo -e "  ${DIM}Updated Peacock color: $color${RESET}"
    return 0
  fi

  if grep -q '^\s*{\s*}\s*$' "$settings_file"; then
    printf '{\n  "peacock.color": "%s"\n}\n' "$color" > "$settings_file"
  else
    perl -0777 -i.bak -pe "s/\}\s*$/,\n  \"peacock.color\": \"$color\"\n}\n/s" "$settings_file"
    rm -f "$settings_file.bak"
  fi
  echo -e "  ${DIM}Added Peacock color: $color${RESET}"
}

mkdir -p "$WORKTREE_DIR"

while [ "$CURRENT_BRANCH" != "dev" ] && [ "$CURRENT_BRANCH" != "develop" ]; do
  echo -e "${RED}⚠${RESET} Current branch is '${BOLD}$CURRENT_BRANCH${RESET}', not '${BOLD}dev${RESET}' or '${BOLD}develop${RESET}'."
  if [ -t 0 ]; then
    read -r -p "Switch branches and retry, continue, or abort? [R(etry)/y/n]: " branch_choice
    case "$branch_choice" in
      y|Y|yes|YES)
        echo -e "${DIM}Continuing with base branch '$CURRENT_BRANCH'.${RESET}"
        break
        ;;
      n|N|no|NO)
        echo -e "${CYAN}→${RESET} Aborted. Switch to '${BOLD}dev${RESET}' or '${BOLD}develop${RESET}', then run again."
        exit 1
        ;;
      *)
        CURRENT_BRANCH=$(git branch --show-current)
        echo -e "${CYAN}→${RESET} Re-detected branch: ${BOLD}$CURRENT_BRANCH${RESET}"
        ;;
    esac
  else
    echo -e "${RED}✗${RESET} Non-interactive shell: refusing non-dev/develop base branch '$CURRENT_BRANCH'."
    exit 1
  fi
done

echo -e "${CYAN}→${RESET} Creating worktree '${BOLD}$NAME${RESET}' from '${BOLD}$CURRENT_BRANCH${RESET}'..."
git worktree add -b "$NAME" "$WORKTREE_PATH"

cd "$WORKTREE_PATH"

echo -e "${CYAN}→${RESET} Copying IDE configs..."
copy_dir "$SOURCE_DIR/.vscode" "$PWD/.vscode"
copy_dir "$SOURCE_DIR/.cursor" "$PWD/.cursor"
copy_dir "$SOURCE_DIR/.local" "$PWD/.local"

if [ -n "$WORKTREE_COLOR" ]; then
  echo -e "${CYAN}→${RESET} Applying Peacock color to workspace settings..."
  set_peacock_color "$PWD" "$WORKTREE_COLOR"
fi

echo -e "${CYAN}→${RESET} Copying Claude Code local settings..."
copy_file "$SOURCE_DIR/.claude/settings.local.json" "$PWD/.claude/settings.local.json"

echo -e "${CYAN}→${RESET} Copying .env files from source repo..."
find "$SOURCE_DIR" -name ".env" -not -path "*/node_modules/*" -not -path "*/.git/*" | while read -r envfile; do
  rel_path="${envfile#$SOURCE_DIR/}"
  target="$PWD/$rel_path"
  mkdir -p "$(dirname "$target")"
  cp "$envfile" "$target"
  echo -e "  ${DIM}Copied: $rel_path${RESET}"
done
# Fallback: create from .env.example if .env doesn't exist
find . -name ".env.example" | while read -r example; do
  target="${example%.example}"
  if [ ! -f "$target" ]; then
    cp "$example" "$target"
    echo -e "  ${DIM}Created: $target (from example)${RESET}"
  fi
done

# Copy .mpx if gitignored (local-only project system)
if git -C "$SOURCE_DIR" check-ignore -q .mpx 2>/dev/null && [ -d "$SOURCE_DIR/.mpx" ]; then
  echo -e "${CYAN}→${RESET} Copying .mpx/ (gitignored, local-only)..."
  copy_dir "$SOURCE_DIR/.mpx" "$PWD/.mpx"
elif [ -d "$SOURCE_DIR/.mpx" ]; then
  echo -e "${DIM}  Skipped .mpx/ (not gitignored in source repo — commit .gitignore first?)${RESET}"
fi

echo -e "${CYAN}→${RESET} Opening VSCode..."
code .

echo -e "${CYAN}→${RESET} Installing dependencies..."
if [ -f "pnpm-lock.yaml" ]; then
  pnpm install
elif [ -f "yarn.lock" ]; then
  yarn install
elif [ -f "package-lock.json" ]; then
  npm install
elif [ -f "package.json" ]; then
  npm install
fi

echo ""
echo -e "${GREEN}✓${RESET} Done! Worktree ready"
echo ""
DISPLAY_PATH=$(cd "$WORKTREE_PATH" && pwd)
echo "$DISPLAY_PATH" > "${TMPDIR:-/tmp}/worktree-cd-path"
echo -e "   ${BOLD}cd $DISPLAY_PATH${RESET}"
echo ""
