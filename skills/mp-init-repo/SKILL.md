---
name: mp-init-repo
description: 'Initialize git repo, push to GitHub, set up branch protection. Use when starting a new project.'
disable-model-invocation: true
allowed-tools: Bash, Write, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.2"
  category: setup
---

# Initialize Repository

Initialize a new git repository with comprehensive .gitignore, Claude Code project structure, GitHub remote, and branch protection.

## Instructions

1. **Check for existing git repo**: If `.git/` already exists, inform the user and abort.

2. **Run the init script**: Execute the initialization script:

   ```bash
   bash $HOME/.claude/skills/mp-init-repo/scripts/init-repo.sh
   ```

3. **Create `.mpx/` structure**: Create the local planning directory:

   ```
   .mpx/REQUIREMENTS.md      # Persistent requirements (empty template)
   ```

   `REQUIREMENTS.md` template:
   ```markdown
   # Requirements

   Persistent project requirements. Updated via `/mp-grill-requirements`.
   GitHub issues track execution state; this file tracks the full requirement set.
   ```

   Commit the `.mpx/` files.

4. **Ask repo visibility**: Ask the user whether the GitHub repo should be **private** (default/recommended) or **public**.

5. **Create GitHub repo and push**:
   - Rename default branch to `main`: `git branch -m master main` (if needed)
   - Create GitHub repo using the current directory name:
     ```bash
     gh repo create <repo-name> --private|--public --source=. --push
     ```
   - Create and push `dev` branch:
     ```bash
     git checkout -b dev && git push -u origin dev
     ```
   - Set `dev` as the default branch:
     ```bash
     gh api repos/{owner}/{repo} -X PATCH --field default_branch=dev
     ```

6. **Set up branch protection** on both `main` and `dev`:
   ```bash
   gh api repos/{owner}/{repo}/branches/{branch}/protection -X PUT --input - <<'EOF'
   {
     "required_status_checks": {"strict": false, "contexts": ["checks"]},
     "enforce_admins": true,
     "required_pull_request_reviews": {"required_approving_review_count": 0},
     "restrictions": null
   }
   EOF
   ```
   - If protection fails with HTTP 403 (GitHub Free plan limitation on private repos), **warn the user** but continue without aborting. Suggest they upgrade to Pro or make the repo public to enable branch protection later.

7. **Report results**: Show the user what was created:
   - Local structure (`.git/`, `.gitignore`, `.claude/`, `.mpx/`)
   - GitHub repo URL
   - Branch setup (`main` + `dev`, default = `dev`)
   - Branch protection status (applied or skipped)

## What Gets Created

```
project/
├── .git/
├── .gitignore              # Comprehensive multi-language
├── .claude/
│   └── CLAUDE.md           # Project context template
└── .mpx/
    └── REQUIREMENTS.md     # Persistent requirements

GitHub:
├── Remote repo (private or public)
├── Branches: main, dev (default)
└── Branch protection on main + dev (if plan supports it)
```

## Notes

- `.gitignore` is copied from `templates/gitignore.template` — deterministic, no LLM generation
- Project-specific ignores (e.g., Obsidian's `main.js`, `data.json`) should be appended after init
- `.mpx/` is intentionally NOT ignored — requirements and decisions should be versioned
- Branch protection requires GitHub Pro for private repos; skill degrades gracefully on Free plan
- `dev` is always the default branch — development happens there, `main` is for stable/releases
- Required status check `checks` is a placeholder; actual CI workflow added separately
