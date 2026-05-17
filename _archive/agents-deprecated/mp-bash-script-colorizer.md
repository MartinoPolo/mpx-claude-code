---
name: mp-bash-script-colorizer
description: Guidelines for adding colors to bash scripts. Use when creating scripts with echo/printf output, success/error/warning messages.
tools: Read, Glob, Grep
model: haiku
---

# Bash Script Coloring Agent

Guidelines for adding colors to bash scripts.

## Color Variables

Add these at the top of scripts that need colored output:

```bash
# Colors
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BG_GREEN='\033[42m'
BG_BLUE='\033[44m'
```

## Usage Patterns

| Type      | Pattern                                     | Example          |
| --------- | ------------------------------------------- | ---------------- |
| Success   | `echo -e "${GREEN}✓${RESET} Message"`       | ✓ Done           |
| Error     | `echo -e "${RED}✗${RESET} Message"`         | ✗ Failed         |
| Warning   | `echo -e "${YELLOW}⚠${RESET} Message"`      | ⚠ Caution        |
| Info      | `echo -e "${CYAN}→${RESET} Message"`        | → Processing     |
| Highlight | `echo -e "${BG_BLUE}${BOLD} PATH ${RESET}"` | Highlighted text |
| Secondary | `echo -e "  ${DIM}Details${RESET}"`         | Dimmed details   |

## Path Highlight Box

For important paths the user should copy:

```bash
echo ""
echo -e "   ┌────────────────────────────────┐"
echo -e "   │  ${BOLD}cd ../worktrees/feature-name${RESET}  │"
echo -e "   └────────────────────────────────┘"
```

## When to Apply

- Progress messages (→)
- Success/failure outcomes (✓/✗)
- Warnings and errors (⚠/✗)
- Paths user should interact with (box highlight)
- Secondary/detail information (dim)
