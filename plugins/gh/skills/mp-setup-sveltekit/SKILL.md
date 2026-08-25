---
name: setup-sveltekit
description: "Creates a SvelteKit project from template, with GitHub repo, branch protection, and CI."
argument-hint: "<project-name>"
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Bash(pnpm *), Bash(npx *), Write, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.6"
  category: setup
---

# SvelteKit Project Setup

Create a new SvelteKit project from `template-sveltekit` with GitHub repo, branching strategy, branch protection, and CI verification. $ARGUMENTS

## Flow

### Step 1: Gather inputs

If `$ARGUMENTS` does not contain a project name, ask the user.

Ask for GitHub visibility: `public` or `private`.

### Step 2: Create repo from template

Resolve the GitHub username:

```bash
gh api user --jq '.login'
```

Clone from template:

```bash
gh repo create <project-name> --template <user>/template-sveltekit --public|--private --clone
```

If the template repo does not exist, inform the user they need to create `template-sveltekit` first and stop.

### Step 3: Create dev branch and set as default

```bash
git -C <path> checkout -b dev
git -C <path> push -u origin dev
gh repo edit <owner>/<project-name> --default-branch dev
```

### Step 4: Branch protection

Apply protection to both `main` and `dev`:

```bash
gh api repos/{owner}/{repo}/branches/main/protection -X PUT \
  --input - <<'EOF'
{
  "required_status_checks": {"strict": false, "contexts": ["checks"]},
  "enforce_admins": true,
  "required_pull_request_reviews": {"required_approving_review_count": 0},
  "restrictions": null
}
EOF
```

Repeat for `dev`. If protection fails (e.g., free plan limitations), record the failing branch, complete `gh` error, and resulting unprotected state for the final report, then continue with the remaining setup.

### Step 5: Verify template works

```bash
pnpm -C <path> install
pnpm -C <path> run check:all
pnpm -C <path> run test
```

If checks fail, preserve every failing command and its complete output, confirm whether the failure prevents setup, and add all failures to the final report.

**Gate:** Continue only when all checks pass or every failure is recorded and confirmed not to prevent setup.

### Step 6: Optional Svelte MCP setup

Ask user: "Do you want to add Svelte MCP support?"

If yes:

```bash
npx -C <path> sv add mcp
```

### Step 7: Initialize .mpx structure

Read `${CLAUDE_PLUGIN_ROOT}/../mp/skills/shared/PROJECT_DOC_TEMPLATES.md` and reproduce its two canonical scaffolds exactly in `.mpx/CONTEXT.md` and `.mpx/DECISIONS.md`, replacing the project-name placeholder.

### Step 8: Verify Framework Rules

Svelte rules are loaded from user-level `~/.claude/rules/svelte.md` (symlinked from mpx-claude-code). No per-project rule setup is needed.

Verify the user-level rules are in place:

```bash
ls -la ~/.claude/rules/svelte.md
```

If missing, inform the user:

> Svelte rules not found at `~/.claude/rules/`. Ensure `~/.claude/rules/` is symlinked to your mpx-claude-code `rules/` directory. See `WINDOWS-SETUP.md` for Windows symlink instructions.

Continue — this is informational only.

### Step 9: Commit and push

```bash
git -C <path> add -A
git -C <path> commit -m "chore: initial project setup"
git -C <path> push
```

### Step 10: Report

Output summary:

```markdown
Repo: <GitHub URL>
Default branch: dev
Branch protection: [applied | failed (reason)]
Template checks: [passing | failing (details)]
Svelte MCP: [added | skipped]
Svelte rules: [found at ~/.claude/rules/ | missing — see instructions above]
```

## Rules

- Always use `pnpm` as the package manager
- Template repo name is always `template-sveltekit` under the user's GitHub account
- Svelte MCP setup is optional -- always ask before adding
- Handle check failures according to Step 5
- Branch protection requires PR reviews (0 required reviewers) and CI checks
- Use `git -C <path>` for all git commands
