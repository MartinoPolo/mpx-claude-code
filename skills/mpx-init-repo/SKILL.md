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

4. **Create `.mpx/` structure**: Create the local planning directory:

   ```
   .mpx/REQUIREMENTS.md      # Persistent requirements (empty template)
   .mpx/LESSONS_LEARNED.md   # Architectural knowledge (empty template)
   ```

   `REQUIREMENTS.md` template:
   ```markdown
   # Requirements

   Persistent project requirements. Updated via `/mp-grill-requirements`.
   GitHub issues track execution state; this file tracks the full requirement set.
   ```

   `LESSONS_LEARNED.md` template:
   ```markdown
   # Lessons Learned

   Architectural insights and hard-won knowledge. Prevents re-learning mistakes.
   ```

5. **Report results**: Show the user what was created.

## What Gets Created

```
project/
├── .git/
├── .gitignore              # Comprehensive multi-language
├── .claude/
│   └── CLAUDE.md           # Project context template
└── .mpx/
    ├── REQUIREMENTS.md     # Persistent requirements
    └── LESSONS_LEARNED.md  # Architectural knowledge
```

## Notes

- `.gitignore` is copied from `templates/gitignore.template` — deterministic, no LLM generation
- Project-specific ignores (e.g., Obsidian's `main.js`, `data.json`) should be appended after init
- `.mpx/` is intentionally NOT ignored — requirements and lessons should be versioned
- Creates `.claude/CLAUDE.md` template for project context
- Creates `.mpx/REQUIREMENTS.md` and `.mpx/LESSONS_LEARNED.md` as empty templates
- Makes an initial commit with message "Initial project setup"
