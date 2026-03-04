---
name: mpx-init-repo
description: Initialize git repository with comprehensive .gitignore. Use when starting a new project.
disable-model-invocation: true
allowed-tools: Bash, Write
metadata:
  author: MartinoPolo
  version: "0.1"
  category: setup
---

# Initialize Repository

Initialize a new git repository with a comprehensive .gitignore and Claude Code project structure.

## Instructions

1. **Check for existing git repo**: If `.git/` already exists, inform the user and abort.

2. **Run the init script**: Execute the initialization script:

   ```bash
   bash $HOME/.claude/skills/mpx-init-repo/scripts/init-repo.sh
   ```

3. **Report results**: Show the user what was created:
   - `.git/` directory
   - `.gitignore` file
   - `.claude/` folder structure
   - Initial commit

## What Gets Created

```
project/
├── .git/
├── .gitignore              # Comprehensive multi-language
└── .claude/
   └── CLAUDE.md           # Project context template
```

## Notes

- `.gitignore` is copied from `templates/gitignore.template` — deterministic, no LLM generation
- Project-specific ignores (e.g., Obsidian's `main.js`, `data.json`) should be appended after init
- `.mpx/` is intentionally NOT ignored — it contains plans/roadmap that should be versioned
- Creates `.claude/CLAUDE.md` template for project context
- Makes an initial commit with message "Initial project setup"
