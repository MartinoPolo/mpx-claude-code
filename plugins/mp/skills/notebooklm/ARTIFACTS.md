# Artifact generation and language options

Consult this branch before generation so the requested artifact, format, prompt, and language options are all represented.

## Generation Types

All generate commands support:
- `-s, --source` to use specific source(s) instead of all sources
- `--language` to set output language (defaults to configured language or 'en')
- `--json` for machine-readable output (returns `task_id` and `status`)
- `--retry N` to automatically retry on rate limits with exponential backoff (supported on all subcommands **except** `mind-map`)
- `--prompt-file PATH` to read description/query from a file (supported on `ask`, `generate` subcommands except `mind-map`, and `source add-research`; mutually exclusive with positional argument; use for long prompts)

| Type | Command | Options | Download |
|------|---------|---------|----------|
| Podcast | `generate audio` | `--format [deep-dive\|brief\|critique\|debate]`, `--length [short\|default\|long]` | .mp3 |
| Video | `generate video` | `--format [explainer\|brief\|cinematic]` (⁴), `--style [auto\|classic\|whiteboard\|kawaii\|anime\|watercolor\|retro-print\|heritage\|paper-craft]` | .mp4 |
| Slide Deck | `generate slide-deck` | `--format [detailed\|presenter]`, `--length [default\|short]` (²) | .pdf / .pptx |
| Slide Revision | `generate revise-slide "prompt" --artifact <id> --slide N` | `--wait`, `--notebook` | *(re-downloads parent deck)* |
| Infographic | `generate infographic` | `--orientation [landscape\|portrait\|square]`, `--detail [concise\|standard\|detailed]`, `--style [auto\|sketch-note\|professional\|bento-grid\|editorial\|instructional\|bricks\|clay\|anime\|kawaii\|scientific]` | .png |
| Report | `generate report` | `--format [briefing-doc\|study-guide\|blog-post\|custom]`, `--append "extra instructions"` (¹) | .md |
| Mind Map | `generate mind-map` | `--kind [interactive\|note-backed]` (³) *(default: note-backed; flips to interactive in v0.8.0)* | .json |
| Data Table | `generate data-table` | description required | .csv |
| Quiz | `generate quiz` | `--difficulty [easy\|medium\|hard]`, `--quantity [fewer\|standard\|more]` | .json/.md/.html |
| Flashcards | `generate flashcards` | `--difficulty [easy\|medium\|hard]`, `--quantity [fewer\|standard\|more]` | .json/.md/.html |

¹ `--append` only customizes the built-in templates. With `--format custom`, pass the prompt as the positional `DESCRIPTION` argument (`notebooklm generate report "PROMPT" --format custom`); `--append` is silently ignored in that mode (the CLI prints a warning).

³ **Two kinds of mind map (issue #1256).** `generate mind-map --kind note-backed` (today's default) creates the **note-backed** kind — a JSON node tree, generated synchronously. `generate mind-map --kind interactive` creates the newer **interactive** studio artifact (what the web app now makes); it is polled to completion. Both emit the same `{mind_map, note_id, kind}` JSON, list under `artifact list --type mind-map`, and export via `download mind-map`. `--instructions` applies only to the note-backed kind. **The default `--kind` switches to `interactive` in v0.8.0**; omitting `--kind` prints a one-time stderr notice (silence with `NOTEBOOKLM_QUIET_DEPRECATIONS=1`).

⁴ **Cinematic video (Veo 3).** `generate video --format cinematic` generates AI documentary footage via Veo 3; it **ignores `--style`**, takes ~30-40 min, and requires a Google AI Ultra subscription. Also exposed as the `generate cinematic-video` alias (which forces `--format cinematic` and a longer default timeout). Download with `download video` or the `download cinematic-video` alias.

² **Portrait / vertical slide decks via prompt.** Slide-deck has no `--orientation` flag (unlike infographic). Treat portrait decks as skill-level prompt guidance, not a typed CLI/API contract: NotebookLM currently honors orientation cues written into the `DESCRIPTION` positional argument. Including phrases like `"9:16 portrait"`, `"vertical layout"`, `"portrait mobile format"`, or `"vertical 9:16 layout"` can make NotebookLM render each slide as a 9:16 portrait image. Empirically:

- The `.pptx` canvas itself may stay 16:9, but each slide's embedded image can be rendered as 9:16 portrait — useful for vertical/mobile video material extracted via `python-pptx`.
- Orientation is steered once at generation time. `generate revise-slide` edits content within an existing slide but does not change its orientation; if a slide falls back to landscape (occasional inconsistency), regenerate the whole deck rather than revising the single page.
- Combine with an explicit page count in the prompt (e.g. `"Create exactly 8 pages, using a vertical 9:16 portrait layout"`) for the most predictable output.

```bash
# Skill prompt hint: ask NotebookLM to render each slide as a 9:16 portrait image
notebooklm generate slide-deck "Create an 8-page deck in 9:16 portrait orientation for mobile viewing" --length default
```

## Features Beyond the Web UI

These capabilities are available via CLI but not in NotebookLM's web interface:

| Feature | Command | Description |
|---------|---------|-------------|
| **Batch downloads** | `download <type> --all` | Download all artifacts of a type at once |
| **Quiz/Flashcard export** | `download quiz --format json` | Export as JSON, Markdown, or HTML (web UI only shows interactive view) |
| **Mind map extraction** | `download mind-map` | Export hierarchical JSON for visualization tools |
| **Data table export** | `download data-table` | Download structured tables as CSV |
| **Slide deck as PPTX** | `download slide-deck --format pptx` | Download slide deck as editable .pptx (web UI only offers PDF) |
| **Slide revision** | `generate revise-slide "prompt" --artifact <id> --slide N` | Modify individual slides with a natural-language prompt |
| **Report template append** | `generate report --format study-guide --append "..."` | Append custom instructions to built-in format templates without losing the format type |
| **Source fulltext** | `source fulltext <id>` | Retrieve the indexed text content of any source |
| **Save chat to note** | `ask "..." --save-as-note` / `history --save` | Save Q&A answers or conversation history as notebook notes |
| **Programmatic sharing** | `share` commands | Manage sharing permissions without the UI |


## Language Configuration

Language setting controls the output language for generated artifacts (audio, video, etc.).

**Important:** Language is a **GLOBAL** setting that affects all notebooks in your account.

```bash
# List all 80+ supported languages with native names
notebooklm language list

# Show current language setting
notebooklm language get

# Set language for artifact generation
notebooklm language set zh_Hans  # Simplified Chinese
notebooklm language set ja       # Japanese
notebooklm language set en       # English (default)
```

**Common language codes:**
| Code | Language |
|------|----------|
| `en` | English |
| `zh_Hans` | 中文（简体） - Simplified Chinese |
| `zh_Hant` | 中文（繁體） - Traditional Chinese |
| `ja` | 日本語 - Japanese |
| `ko` | 한국어 - Korean |
| `es` | Español - Spanish |
| `fr` | Français - French |
| `de` | Deutsch - German |
| `pt_BR` | Português (Brasil) |

**Override per command:** Use `--language` flag on generate commands:
```bash
notebooklm generate audio --language ja   # Japanese podcast
notebooklm generate video --language zh_Hans  # Chinese video
```

**Offline mode:** Use `--local` flag to skip server sync:
```bash
notebooklm language set zh_Hans --local  # Save locally only
notebooklm language get --local  # Read local config only
```
