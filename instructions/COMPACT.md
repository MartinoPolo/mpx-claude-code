Keep the summary's standard sections, and write the whole summary as if briefing a
developer with zero context: it is the only context the continuing agent gets, so every
section must carry enough detail to continue the work without re-investigating.

Add these sections:

- **Key Decisions** — each decision: what was decided, which alternatives were considered
  and rejected, and why. Include the trade-offs and constraints that forced the choice.
- **Dead Ends & Mistakes** — approaches abandoned and the symptom that killed them: the
  error message, the wrong assumption, the path that looked promising but wasn't. Standard
  error sections only capture errors that got fixed; an abandoned path leaves no trace
  otherwise and gets retried after compaction.
- **Next Steps** — prioritized, each with the file paths, function names, and enough
  context to start immediately; note prerequisites and ordering constraints.
- **Critical Files** — every file the continuing agent will need to read or modify:
  `path` — what it does and why it matters for this work.
- **Working Memory** — implicit constraints carried in the head, not the code: "X depends
  on Y", "don't change Z because…", environment quirks, config gotchas, version-specific
  behaviour, relationships between components that aren't obvious from the code.

Preservation rules:

- File paths keep their line numbers; error text is quoted verbatim.
- Never generalise an identifier to "the variable" or "the file" — the specific name is
  the load-bearing part.
- Restate user instructions and preferences given during the session verbatim, not
  paraphrased.
- Capture the why, not just the what — reasoning survives compaction; bare conclusions
  get re-derived, often wrongly.
