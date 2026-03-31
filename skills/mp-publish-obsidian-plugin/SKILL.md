---
name: mp-publish-obsidian-plugin
description: 'Publish Obsidian plugin to community directory. Use when: "publish plugin", "submit to community", "add to obsidian plugins"'
allowed-tools: Bash(npm run *), Bash(gh release *), Bash(gh repo *), Bash(gh pr *), Bash(gh api *), Bash(git *), Read, Grep, Glob, Write, Edit, WebFetch, AskUserQuestion, Agent, Bash(gh *)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: obsidian
---

# Publish Obsidian Plugin to Community Directory

Full workflow to submit an Obsidian plugin to `obsidianmd/obsidian-releases`. $ARGUMENTS

## Critical Rules

- Description in `manifest.json` **MUST** end with `.` `?` `!` or `)` — bot rejects otherwise
- Description in `community-plugins.json` must **exactly** match `manifest.json` description
- `id` in `community-plugins.json` must **exactly** match `id` in `manifest.json`
- Release tag must match `manifest.json` version exactly — **no `v` prefix**
- Release must have `main.js` + `manifest.json` uploaded as individual assets (not just source archives)
- Include `styles.css` only if plugin uses styles
- PR body must use the **exact** official template including HTML comments
- All UI text (`.setName()`, `.setDesc()`, `.setPlaceholder()`) must use **sentence case** — capitalize only the first word and proper nouns

## Workflow

### Step 1: Pre-flight Validation

Read `manifest.json`. Verify:

1. `id` exists and is kebab-case
2. `name` exists
3. `description` ends with `.?!)` — if not, **stop and fix**
4. `version` exists
5. `author` and `authorUrl` exist
6. `minAppVersion` is set
7. All `.setName()`, `.setDesc()`, `.setPlaceholder()` calls use sentence case — if not, **stop and fix**

Read `package.json`. Verify version matches `manifest.json` version.

Display all values for user review.

### Step 2: Verify GitHub Repository

```bash
gh repo view --json name,url,description,isPrivate
```

- Must be public
- Repo description should match plugin description (recommend but don't block)

### Step 3: Build

```bash
npm run build
```

Verify `main.js` exists after build. Check if `styles.css` exists (note for release assets).

### Step 4: Create GitHub Release

Check if release for current version already exists:

```bash
gh release view <version> 2>/dev/null
```

If not, create it:

```bash
gh release create <version> main.js manifest.json --title "<version>" --notes "Release <version>"
```

Add `styles.css` if it exists:

```bash
gh release upload <version> styles.css
```

**Important:** Tag is just the version number (e.g., `1.0.0`), NOT `v1.0.0`.

### Step 5: Verify Release Assets

```bash
gh release view <version> --json assets --jq '.assets[].name'
```

Must include at minimum: `main.js`, `manifest.json`. Warn if missing.

### Step 6: Fork obsidian-releases

```bash
gh repo fork obsidianmd/obsidian-releases --clone=false
```

If already forked, sync fork:

```bash
gh repo sync <user>/obsidian-releases
```

### Step 7: Add Entry to community-plugins.json

Fetch current `community-plugins.json` from the user's fork (main branch):

```bash
gh api repos/<user>/obsidian-releases/contents/community-plugins.json --jq '.content' | base64 -d > /tmp/community-plugins.json
```

Read the file. Find alphabetical insertion point by `id`. Add entry:

```json
{
  "id": "<manifest.id>",
  "name": "<manifest.name>",
  "author": "<manifest.author>",
  "description": "<manifest.description>",
  "repo": "<github-user>/<repo-name>"
}
```

**Description must be copied character-for-character from manifest.json.**

Push the change to a new branch on the fork:

```bash
gh api repos/<user>/obsidian-releases/contents/community-plugins.json \
  -X PUT \
  -f message="Add <plugin-name> plugin" \
  -f content="$(base64 -w 0 /tmp/community-plugins.json)" \
  -f sha="<current-sha>" \
  -f branch="add-<plugin-id>"
```

### Step 8: Fetch PR Template

Fetch the **official** PR template — PR validation checks compliance against this exact template:

```
https://raw.githubusercontent.com/obsidianmd/obsidian-releases/refs/heads/master/.github/PULL_REQUEST_TEMPLATE/plugin.md
```

Use `WebFetch` or:

```bash
gh api repos/obsidianmd/obsidian-releases/contents/.github/PULL_REQUEST_TEMPLATE/plugin.md --jq '.content' | base64 -d
```

Fill in the template fields. **Keep all HTML comments and structure intact** — the bot validates against this template. The template typically asks for:

- Repo URL
- Release link
- Checklist items (check all that apply with `[x]`)

### Step 9: Create PR

```bash
gh pr create \
  --repo obsidianmd/obsidian-releases \
  --head <user>:add-<plugin-id> \
  --base master \
  --title "Add <plugin-name> plugin" \
  --body "$(cat <<'EOF'
<filled template here>
EOF
)"
```

### Step 10: Post-Submission Validation

Check PR for bot comments (wait ~30s then check):

```bash
gh pr view <pr-number> --repo obsidianmd/obsidian-releases --json comments --jq '.comments[].body'
```

Common bot rejection reasons:

- Description mismatch between manifest and community-plugins.json
- Description doesn't end with punctuation
- Missing release assets
- Tag doesn't match version
- UI text not using sentence case (`.setName()`, `.setDesc()`, `.setPlaceholder()`)

## Output

Display:

- Plugin id, name, version
- Release URL
- PR URL and number
- Any bot validation warnings
