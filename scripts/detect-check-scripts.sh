#!/bin/bash
# Detect package manager and check scripts from package.json
# Outputs key=value pairs for use by /mp-check-fix skill
# Usage: bash $HOME/.claude/scripts/detect-check-scripts.sh [project_dir]

set -euo pipefail

PROJECT_DIR="${1:-.}"
cd "$PROJECT_DIR"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# --- Package manager detection (priority: bun > yarn > pnpm > npm) ---
detect_package_manager() {
  if [ -f "bun.lockb" ] || [ -f "bun.lock" ]; then
    echo "bun"
  elif [ -f "yarn.lock" ]; then
    echo "yarn"
  elif [ -f "pnpm-lock.yaml" ]; then
    echo "pnpm"
  elif [ -f "package-lock.json" ] || [ -f "npm-shrinkwrap.json" ]; then
    echo "npm"
  else
    echo ""
  fi
}

# --- Check if a script exists in a package.json ---
# Args: $1=package.json path, $2=script name
has_script() {
  local pkg_json="$1"
  local script_name="$2"
  if [ -f "$pkg_json" ]; then
    # Use node if available, else grep fallback
    if command -v node &>/dev/null; then
      node -e "
        const pkg = JSON.parse(require('fs').readFileSync('$pkg_json', 'utf8'));
        process.exit(pkg.scripts && pkg.scripts['$script_name'] ? 0 : 1);
      " 2>/dev/null
    else
      grep -q "\"$script_name\"" "$pkg_json" 2>/dev/null
    fi
  else
    return 1
  fi
}

# --- Find first matching script from candidates ---
# Args: $1=package.json path, $2+=candidate script names
find_script() {
  local pkg_json="$1"
  shift
  for candidate in "$@"; do
    if has_script "$pkg_json" "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

# --- Detect workspace (monorepo) ---
is_workspace() {
  if [ -f "package.json" ]; then
    if command -v node &>/dev/null; then
      node -e "
        const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
        process.exit(pkg.workspaces ? 0 : 1);
      " 2>/dev/null
    else
      grep -q '"workspaces"' package.json 2>/dev/null
    fi
  else
    return 1
  fi
}

# --- Scan a single package.json and output findings ---
# Args: $1=package.json path, $2=package manager, $3=prefix (empty for root)
scan_package() {
  local pkg_json="$1"
  local pm="$2"
  local prefix="$3"
  local dir
  dir=$(dirname "$pkg_json")

  local build_script check_all_script lint_script typecheck_script format_script
  local key_prefix=""
  [ -n "$prefix" ] && key_prefix="${prefix}_"

  # Build detection (always independent)
  build_script=$(find_script "$pkg_json" "build") || true
  if [ -n "$build_script" ]; then
    echo "${key_prefix}BUILD=${pm} run ${build_script}"
    echo "${key_prefix}BUILD_DIR=${dir}"
  fi

  # Parent check detection — covers lint + typecheck + more
  check_all_script=$(find_script "$pkg_json" "check:all" "check-all") || true
  if [ -n "$check_all_script" ]; then
    echo "${key_prefix}CHECK_ALL=${pm} run ${check_all_script}"
    echo "${key_prefix}CHECK_ALL_DIR=${dir}"
    return
  fi

  # Individual detection (fallback when no parent check found)

  # Typecheck detection
  typecheck_script=$(find_script "$pkg_json" "check" "typecheck" "type-check" "tsc" "check:types") || true
  if [ -n "$typecheck_script" ]; then
    echo "${key_prefix}TYPECHECK=${pm} run ${typecheck_script}"
    echo "${key_prefix}TYPECHECK_DIR=${dir}"
  fi

  # Lint detection
  lint_script=$(find_script "$pkg_json" "lint" "eslint" "lint:eslint" "lint:check") || true
  if [ -n "$lint_script" ]; then
    echo "${key_prefix}LINT=${pm} run ${lint_script}"
    echo "${key_prefix}LINT_DIR=${dir}"
  fi

  # Format detection
  format_script=$(find_script "$pkg_json" "format" "fmt" "format:check" "prettier") || true
  if [ -n "$format_script" ]; then
    echo "${key_prefix}FORMAT=${pm} run ${format_script}"
    echo "${key_prefix}FORMAT_DIR=${dir}"
  fi
}

# --- Main ---

if [ ! -f "package.json" ]; then
  echo -e "${RED}No package.json found in ${PROJECT_DIR}${NC}" >&2
  echo "NO_PROJECT=true"
  exit 0
fi

PM=$(detect_package_manager)
if [ -z "$PM" ]; then
  # No lock file found — accept PM as second arg (set by skill after asking user)
  if [ -n "${2:-}" ]; then
    PM="$2"
    echo "PM=${PM}"
  else
    echo "PM_UNKNOWN=true"
    echo -e "${YELLOW}No lock file found. Cannot determine package manager.${NC}" >&2
    exit 0
  fi
else
  echo "PM=${PM}"
fi

echo -e "${CYAN}${BOLD}Scanning project...${NC}" >&2

# Scan root
scan_package "package.json" "$PM" ""

# Monorepo: scan workspace packages
if is_workspace; then
  echo "MONOREPO=true"
  echo -e "${CYAN}Workspace detected, scanning packages...${NC}" >&2

  for workspace_dir in packages apps; do
    if [ -d "$workspace_dir" ]; then
      for pkg_json in "$workspace_dir"/*/package.json; do
        [ -f "$pkg_json" ] || continue
        # Derive prefix from directory name (e.g., packages/ui -> packages_ui)
        local_dir=$(dirname "$pkg_json")
        prefix=$(echo "$local_dir" | tr '/' '_' | tr '-' '_')
        scan_package "$pkg_json" "$PM" "$prefix"
      done
    fi
  done
fi

echo -e "${GREEN}Detection complete.${NC}" >&2
