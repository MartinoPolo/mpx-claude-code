---
name: setup-react-native
description: "Creates a React and React Native monorepo from template, with GitHub repo, branch protection, and CI."
argument-hint: <project-name>
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Bash(pnpm *), Write, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.6"
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
- Leave admin enforcement off

### Step 5: Install Dependencies and Verify

```bash
pnpm --dir <project-path> install
pnpm --dir <project-path> --filter web run check:all
pnpm --dir <project-path> --filter shared run check:all
```

If checks fail, preserve the complete failing command and output, record every failed check for the final report, and confirm whether the failure prevents repository setup.

**Gate:** Continue only when all checks pass or every failure is recorded and confirmed not to prevent repository setup.

### Step 6: Initialize .mpx documentation

Read `${CLAUDE_PLUGIN_ROOT}/../mp/skills/shared/PROJECT_DOC_TEMPLATES.md` and reproduce its two canonical scaffolds exactly in `.mpx/CONTEXT.md` and `.mpx/DECISIONS.md`, replacing the project-name placeholder.

### Step 7: Link Framework Rules

Read and follow [PLATFORM_REFERENCE.md](PLATFORM_REFERENCE.md) for OS-specific symlink creation and failure handling. If the link does not resolve to the central React rule, record the exact manual command for the final report.

### Step 8: Commit and Push

Stage any new or modified files (e.g., lockfile, `.mpx/`):

```bash
git -C <project-path> add -A
git -C <project-path> commit -m "$(cat <<'EOF'
chore: initialize monorepo from template
EOF
)"
git -C <project-path> push -u origin dev
```

### Step 9: Report

Display:

- **Repo URL** (e.g., `https://github.com/<user>/<project-name>`)
- **Default branch**: dev
- **Branch protection status** for main and dev
- **Monorepo structure overview** (see below)
- **Check results** (pass/fail summary)
- **Rules**: linked / manual command provided
