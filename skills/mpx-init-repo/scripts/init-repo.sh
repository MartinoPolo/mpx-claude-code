#!/bin/bash
# Initialize a new project with git and Claude Code structure
# Usage: bash init-repo.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Initializing project...${NC}"

# Check if .git already exists
if [ -d ".git" ]; then
    echo -e "${YELLOW}Git repository already exists. Skipping git init.${NC}"
else
    echo "Initializing git repository..."
    git init
fi

# Copy .gitignore from template
echo "Creating .gitignore..."
TEMPLATE_DIR="$(dirname "$0")/../templates"
if [ ! -f "$TEMPLATE_DIR/gitignore.template" ]; then
    TEMPLATE_DIR="$HOME/.claude/templates"
fi
if [ ! -f "$TEMPLATE_DIR/gitignore.template" ]; then
    echo -e "${RED}Error: gitignore.template not found in scripts/../templates/ or ~/.claude/templates/${NC}"
    exit 1
fi
cp "$TEMPLATE_DIR/gitignore.template" .gitignore

# Create .gitattributes for cross-platform line ending normalization
echo "Creating .gitattributes..."
cat > .gitattributes << 'EOF'
# Normalize all text to LF in git and working tree
* text=auto eol=lf

# Shell scripts - always LF (CRLF breaks shebangs)
*.sh text eol=lf

# Common text
*.md text eol=lf
*.json text eol=lf
*.txt text eol=lf
*.yaml text eol=lf
*.yml text eol=lf
*.toml text eol=lf
*.css text eol=lf
*.js text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.jsx text eol=lf
*.html text eol=lf
*.py text eol=lf
*.rs text eol=lf
*.go text eol=lf

# Binary - no conversion
*.png binary
*.jpg binary
*.gif binary
*.ico binary
*.woff binary
*.woff2 binary
*.ttf binary
*.eot binary
*.pdf binary
*.zip binary
EOF

# Create .editorconfig for editor consistency
echo "Creating .editorconfig..."
cat > .editorconfig << 'EOF'
root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[*.{png,jpg,gif,ico,woff,woff2,ttf,eot,pdf,zip}]
end_of_line = unset
insert_final_newline = unset
charset = unset
trim_trailing_whitespace = unset
EOF

# Create .claude directory structure
echo "Creating .claude/ directory..."
mkdir -p .claude

# Create CLAUDE.md template
if [ ! -f ".claude/CLAUDE.md" ]; then
    echo "Creating .claude/CLAUDE.md template..."
    cat > .claude/CLAUDE.md << 'EOF'
# Project Context

## Overview
[Brief description of what this project does]

## Tech Stack
- Language: [e.g., TypeScript, Python]
- Framework: [e.g., React, FastAPI]
- Database: [e.g., PostgreSQL, SQLite, None]
- Package Manager: [e.g., npm, yarn, pip]

## Project Structure
```
[Add key directories and their purposes]
```

## Development Commands
```bash
# Install dependencies
[command]

# Run development server
[command]

# Run tests
[command]

# Build for production
[command]
```

## Key Files
- `[file]`: [purpose]

## Notes
[Any important context for Claude to know]
EOF
fi

# Stage and commit
echo "Creating initial commit..."
git add .gitignore .gitattributes .editorconfig .claude/

# Check if there's anything to commit
if git diff --cached --quiet; then
    echo -e "${YELLOW}No changes to commit.${NC}"
else
    git commit -m "Initial project setup

- Add comprehensive .gitignore
- Add .gitattributes for line ending normalization
- Add .editorconfig for editor consistency
- Add .claude/ project structure
- Add CLAUDE.md template"
fi

echo ""
echo -e "${GREEN}Project initialized successfully!${NC}"
echo ""
echo "Created:"
echo "  .gitignore          - Comprehensive ignore patterns"
echo "  .gitattributes      - Line ending normalization"
echo "  .editorconfig       - Editor consistency settings"
echo "  .claude/CLAUDE.md   - Project context template"
echo ""
echo "Next steps:"
echo "  1. Run /mpx-add-requirements to create/update .mpx/SPEC.md"
echo "  2. Run /mpx-parse-spec only if you manually edited SPEC.md"
