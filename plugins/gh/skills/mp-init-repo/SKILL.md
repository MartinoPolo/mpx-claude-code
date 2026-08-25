---
name: init-repo
description: "Initializes a git repo, pushes it to GitHub, and sets up branch protection."
disable-model-invocation: true
allowed-tools: Bash, Read, Write, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.6"
  category: setup
---

# Initialize Repository

Initialize a new git repository with comprehensive .gitignore, root shared agent instructions, GitHub remote, and branch protection.

Usually run automatically from `mp-project-register` step 3 (read-and-follow) when a
project has no `.git/` yet.

## Instructions

1. **Check for existing git repo**: If `.git/` already exists, inform the user and abort.

2. **Run the init script**: Execute the initialization script:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/../mp/scripts/init-repo.mjs
   ```

3. **Create `.mpx/` structure**: Use `${CLAUDE_PLUGIN_ROOT}/../mp/skills/shared/PROJECT_DOC_TEMPLATES.md` as the single source for `.mpx/CONTEXT.md` and `.mpx/DECISIONS.md`. Preserve any existing file that already contains substantive planning, research, or prior grilling output. Create only files that are missing or still untouched placeholders, reproducing the canonical scaffold exactly and replacing the project-name placeholder in newly created files. Before committing, verify that each file contains either preserved substantive content or a newly created canonical scaffold. Then run exactly:

   ```bash
   git add .mpx/CONTEXT.md .mpx/DECISIONS.md
   git commit -m "docs: initialize project documentation"
   ```

   This separate commit is needed because `init-repo.mjs` commits before `.mpx/` exists.

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

7. **Report results**: Show the user what was created or preserved:
   - Local structure (`.git/`, `.gitignore`, `.gitattributes`, `.editorconfig`, `AGENTS.md` when absent and otherwise preserved, `CLAUDE.md` when absent and otherwise preserved, `.mpx/`)
   - GitHub repo URL
   - Branch setup (`main` + `dev`, default = `dev`)
   - Branch protection status (applied or skipped)

## What Gets Created

```
project/
├── .git/
├── .gitignore              # Comprehensive multi-language
├── .gitattributes          # Line ending normalization
├── .editorconfig           # Editor consistency settings
├── AGENTS.md               # Created when absent; otherwise preserved
├── CLAUDE.md               # Created when absent; otherwise preserved
└── .mpx/
    ├── CONTEXT.md          # Domain language, feature index, constraints
    └── DECISIONS.md        # Settled architectural decisions

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
