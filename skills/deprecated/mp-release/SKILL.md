---
name: mp-release
description: 'Bump version, push tag, verify CI workflow starts. Use when: "release", "bump version", "version bump", "cut a release"'
args: "[patch | minor | major]"
allowed-tools: Bash(npm version *), Bash(git push *), Bash(git status *), Bash(git branch *), Bash(git remote *), Bash(gh run *), Read, Grep, Glob, AskUserQuestion, Bash(git *), Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: git-workflow
---

# Version Bump + Release

Bumps version, pushes tag, verifies CI workflow starts. $ARGUMENTS

## Workflow

### Step 1: Detect Project Type

- `manifest.json` exists → Obsidian plugin
- `package.json` only → npm package

### Step 2: Show Current Version

Read version from `package.json` (and `manifest.json` if Obsidian plugin). Display to user.

### Step 3: Get Bump Type

If `$ARGUMENTS` contains patch/minor/major, use it. Otherwise ask:

```
AskUserQuestion: "What type of version bump?"
Options: patch, minor, major
```

### Step 4: Verify Clean Working Tree

Run `git status --porcelain`. If output non-empty, warn user about uncommitted changes and ask to continue or abort.

### Step 5: Check Remote

Run `git remote get-url origin`. Fail if no remote configured.

### Step 6: Check Branch

Run `git branch --show-current`. Warn if not on main/master — releases should typically come from the main branch.

### Step 7: Run Version Bump

```bash
npm version <patch|minor|major>
```

This triggers the `version` script in package.json (e.g., `version-bump.mjs` for Obsidian plugins), commits the version change, and creates a git tag.

### Step 8: Push with Tags

```bash
git push --follow-tags
```

### Step 9: Verify Workflow Started

```bash
gh run list --limit 3
```

Show recent workflow runs to confirm the release workflow triggered.

### Step 10: Summary

Report: new version number, tag created, workflow status.
