---
name: mp-tutorial-create
description: 'Generates interactive, self-contained HTML tutorial pages from a topic or code-showcase prompt, compiled from compact markdown source into the OneDrive tutorials folder. Use when: "create tutorial", "make a tutorial"'
argument-hint: "<topic or code-showcase description> [--type topic|code-showcase] [--category <name>]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(npm install*), Bash(ls *), Agent, WebSearch, WebFetch
metadata:
  author: MartinoPolo
  version: "1.2.0"
  category: utility
---

# Create Interactive Tutorial

Generate a self-contained interactive HTML tutorial page. You author ONLY a compact `<slug>.source.md`; `scripts/compile.js` renders the final page from `TEMPLATE.html` (Shiki highlighting, theme, progress, quiz — all template-owned). $ARGUMENTS

## Workflow

### Step 1: Parse Request

From `$ARGUMENTS` infer:

- **Type**: `topic` (concept tutorial, ends with quiz) or `code-showcase` (explains specific code/MR/tests, no quiz). Honor `--type` override.
- **Category**: current repo name when the tutorial is about this codebase; otherwise topic area (e.g. `webdev`, `typescript`). Honor `--category`. Ask the user only when genuinely ambiguous.
- **Slug**: kebab-case from the title. Stable forever — it keys reader progress in localStorage.

### Step 2: Find Videos

Spawn a `general-purpose` sub-agent to find 1-2 intro YouTube videos following `${CLAUDE_SKILL_DIR}/reference/CHANNELS.md` (channel profiles, WebSearch `site:youtube.com` technique, duration filter, oEmbed verification). Pass it the topic; require back: title, channel, duration, verified URL per video.

### Step 3: Author Source

Read `${CLAUDE_SKILL_DIR}/reference/SOURCE_FORMAT.md`, then write `<slug>.source.md` directly into `C:\Users\snapy\OneDrive\tutorials\<category>\`.

Authoring rules:

- **Restraint on reveals**: quiz always (topic type); at most ONE "Check yourself" `:::reveal` per chapter, and only where a genuine misconception is worth testing. Never as filler.
- **Links everywhere**: every external concept links to canonical docs (MDN, framework docs) inline; every referenced local file is a clickable `file:///` link (rendered with 📁) both inline and in the `references` frontmatter.
- Every section ends with a `:::recap`. Use annotated code or a walkthrough for the core code idea; prefer a Mermaid diagram wherever a visual helps.
- Glossary: define recurring jargon in frontmatter `glossary`, mark occurrences with `((term))`.
- **Playground restraint**: `:::playground` only for layout/visual-CSS topics (flexbox, grid, positioning, transitions); max ONE per tutorial; 2-4 challenges. Challenge targets must be achievable with the declared controls. Ghost-matching is geometric, so alternate solutions win legitimately — that is intended.

### Step 4: Compile

```bash
cd ${CLAUDE_SKILL_DIR} && node scripts/compile.js "C:\Users\snapy\OneDrive\tutorials\<category>\<slug>.source.md"
```

First run only: `npm install` in `${CLAUDE_SKILL_DIR}` (Shiki + yaml + @mermaid-js/mermaid-cli; offline afterwards). Mermaid blocks compile to inline SVG in light and dark variants; if mermaid-cli is missing the build prints a "diagram skipped" warning and still succeeds.

The compiler writes `<slug>.html` beside the source and regenerates `C:\Users\snapy\OneDrive\tutorials\index.html` (dashboard with per-tutorial progress). Editing TEMPLATE.html and recompiling preserves reader progress — section slugs are the storage keys.

### Step 5: Verify and Report

Open the compiled file, confirm the build printed no warnings that matter, then report:

- Output paths (page + source + index) as clickable `file:///` links
- Type, category, section count, videos chosen

## Editing an Existing Tutorial

Edit its `.source.md` (keep existing section slugs!) and re-run compile. Never hand-edit the generated HTML.
