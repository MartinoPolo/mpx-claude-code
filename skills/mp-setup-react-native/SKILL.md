---
name: mp-setup-react-native
description: 'Create a React + React Native monorepo from template with GitHub repo, branch protection, and CI. Use when: "setup React Native project", "new mobile project", "create React Native monorepo"'
argument-hint: <project-name>
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Bash(pnpm *), Bash(npx *), Write, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.1"
  category: setup
---

# Setup React Native Monorepo

Create a React + React Native monorepo from template, configure GitHub repo with branch protection and CI. $ARGUMENTS

## Workflow

### Step 1: Collect Inputs

If `$ARGUMENTS` does not contain a project name, ask the user for:

- **Project name** (required)
- **Visibility**: public or private (default: private)

### Step 2: Create Repo from Template

```bash
gh repo create <project-name> --template <github-user>/template-react-native-monorepo --public|--private --clone
```

Detect the authenticated GitHub user:

```bash
gh api user --jq .login
```

If the template repo `template-react-native-monorepo` does not exist under the user's account, inform the user:

> Template repo `<user>/template-react-native-monorepo` not found. Create it first, then re-run this skill.

Stop execution if template is missing.

### Step 3: Create Dev Branch and Set as Default

```bash
git -C <project-path> checkout -b dev
git -C <project-path> push -u origin dev
gh repo edit <owner/project-name> --default-branch dev
```

### Step 4: Set Up Branch Protection

Apply protection rules to both `main` and `dev` branches.

For each branch:

```bash
gh api repos/<owner>/<project-name>/branches/<branch>/protection \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ci"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null
}
EOF
```

**Protection rules:**

- Require PR for merges
- Require CI checks to pass
- No required reviewers
- Do not enforce for admins

### Step 5: Install Dependencies and Verify

```bash
pnpm --dir <project-path> install
pnpm --dir <project-path> --filter web run check:all
pnpm --dir <project-path> --filter shared run check:all
```

If checks fail, report errors but do NOT abort. Continue to next steps.

### Step 6: Initialize .mpx/REQUIREMENTS.md

If `.mpx/REQUIREMENTS.md` does not already exist in the cloned repo, create it:

```markdown
# Requirements

Persistent project requirements. Updated via `/mp-grill-requirements`.
GitHub issues track execution state; this file tracks the full requirement set.
```

### Step 7: Commit and Push

Stage any new or modified files (e.g., lockfile, `.mpx/`):

```bash
git -C <project-path> add -A
git -C <project-path> commit -m "$(cat <<'EOF'
chore: initialize monorepo from template
EOF
)"
git -C <project-path> push -u origin dev
```

### Step 8: Report

Display:

- **Repo URL** (e.g., `https://github.com/<user>/<project-name>`)
- **Default branch**: dev
- **Branch protection status** for main and dev
- **Monorepo structure overview** (see below)
- **Check results** (pass/fail summary)

## Monorepo Structure

The template creates:

```
apps/
  web/          # React + Vite Plus
  mobile/       # Expo + React Native + Expo Router
  api/          # Hono backend
packages/
  shared/       # Types, hooks, API clients, Zod schemas
  ui/           # Gluestack UI + NativeWind components
  config/       # Shared ESLint, TSConfig
```

## Rules

- Always use pnpm (standardized package manager)
- Template repo name: `template-react-native-monorepo` (user's GitHub account)
- No Svelte MCP prompt (this is React, not Svelte)
- If checks fail, report errors but don't abort
- Branch protection: require PR + require CI checks, no required reviewers
- Always use `git -C <path>` instead of `cd <path> && git`

## Failure Handling

| Problem                  | Action                                          |
| ------------------------ | ----------------------------------------------- |
| Template repo not found  | Inform user to create it first, stop execution  |
| Repo creation fails      | Report `gh` error and stop                      |
| Branch protection fails  | Report error, continue with remaining steps     |
| pnpm install fails       | Report error, continue with remaining steps     |
| Checks fail              | Report errors, continue with remaining steps    |
| Push fails               | Report `git` error and remediation              |

## Output

After completion, display:

- Repo URL
- Default branch
- Branch protection status (main, dev)
- Monorepo structure overview
- Check results (pass/fail)
- Any errors encountered
