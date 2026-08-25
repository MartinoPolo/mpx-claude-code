# NotebookLM command reference

Prefer `notebooklm --help` and `notebooklm <group> --help` for ordinary syntax; this file retains non-obvious command constraints and output contracts.

## Non-obvious command behavior

**Parallel safety:** Use explicit notebook IDs in parallel workflows. Commands supporting `-n` shorthand: `artifact wait`, `source wait`, `research wait/status`, `download *`. Download commands also support `-a/--artifact`. Other commands use `--notebook`. For chat, use `-c <conversation_id>` to target a specific conversation.

**Partial IDs:** Use first 6+ characters of UUIDs. Must be unique prefix (fails if ambiguous). Works for ID-based commands such as `use`, `source delete`, and `wait`. For exact source-title deletion, use `source delete-by-title "Title"`. For automation, prefer full UUIDs to avoid ambiguity.

## Command Output Formats

Commands with `--json` return structured data for parsing:

**Create notebook:**
```bash
$ notebooklm create "Research" --json
{"notebook": {"id": "abc123de-...", "title": "Research", "created_at": null}}
# parse with: jq -r .notebook.id
```

**Add source:**
```bash
$ notebooklm source add "https://example.com" --json
{"source": {"id": "def456...", "title": "Example", "type": "SourceType.WEB_PAGE", "url": "https://example.com"}}
# parse with: jq -r .source.id
# Note: no `status` field on add — use `source list --json` or `source wait` to check processing state.
```

**Generate artifact:**
```bash
$ notebooklm generate audio "Focus on key points" --json
{"task_id": "xyz789...", "status": "pending"}
# When run with --wait, completed status also includes a `url` field.
```

**Chat with references:**
```bash
$ notebooklm ask "What is X?" --json
{"answer": "X is... [1] [2]", "conversation_id": "...", "turn_number": 1, "is_follow_up": false, "references": [{"source_id": "abc123...", "citation_number": 1, "cited_text": "Relevant passage from source..."}, {"source_id": "def456...", "citation_number": 2, "cited_text": "Another passage..."}]}
```

**Source fulltext (get indexed content):**
```bash
$ notebooklm source fulltext <source_id> --json
{"source_id": "...", "title": "...", "content": "Full indexed text...", "_type_code": null, "url": null, "char_count": 12345}
```

**Understanding citations:** The `cited_text` in references is often a snippet or section header, not the full quoted passage. The `start_char`/`end_char` positions reference NotebookLM's internal chunked index, not the raw fulltext. Use `SourceFulltext.find_citation_context()` to locate citations:
```python
fulltext = await client.sources.get_fulltext(notebook_id, ref.source_id)
matches = fulltext.find_citation_context(ref.cited_text)  # Returns list[(context, position)]
if matches:
    context, pos = matches[0]  # First match; check len(matches) > 1 for duplicates
```

**Extract IDs:** Singular endpoints wrap their result in an envelope —
parse `.notebook.id` (from `create`), `.source.id` (from `source add`),
or `.task_id` (from `generate *`). The chat `--json` references list uses
`.references[].source_id`.
