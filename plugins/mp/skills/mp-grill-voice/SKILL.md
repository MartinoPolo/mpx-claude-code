---
name: grill-voice
description: "Voice-enabled variant of mp-grill: publishes each interview round as a JSON file for the companion mobile voice app, waits for the spoken answers, and continues until the design is settled and recorded in project docs."
argument-hint: "[topic, requirements text, or path to requirements file]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Agent, Bash(node *)
metadata:
  author: MartinoPolo
  version: "0.2"
  category: planning
---

# Grill by Voice

Run the [mp-grill](../mp-grill/SKILL.md) interview, but exchange each round with the
user's mobile voice app through JSON files instead of conversation. The user is on a
walk: questions are spoken to them, answers come back as Whisper transcripts. The file
formats and session lifecycle live in [CONTRACT.md](CONTRACT.md) — read it before the
first round.

All session bookkeeping goes through one script:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/grill-voice.js" <init|publish|wait|complete> ...
```

## Step 1: Context and subject

Follow mp-grill Steps 1–2: silently read `.mpx/CONTEXT.md` and `.mpx/DECISIONS.md` when
present, and resolve `$ARGUMENTS` as the grilling subject (ask when absent).

## Step 2: Start the session

```bash
node "${CLAUDE_SKILL_DIR}/scripts/grill-voice.js" init --project <name> --topic <topic>
```

Prints the `sessionId` used by every later command. Confirm to the user that the
session is live and they can put the phone in their pocket.

**Fallback to conversational grilling** — when the user says they are at the keyboard,
or the script fails (no Node, unwritable sessions root): continue with mp-grill Step 3
in the conversation and skip the publish/wait cycle entirely.

## Step 3: Rounds

Compose each round exactly as mp-grill Step 3 prescribes: delegate codebase facts to
the `Explore` agent (breadth: medium), batch related questions thematically, split into
a follow-up round only when earlier answers materially change later questions, and
attach a recommendation to every question.

Voice changes only the delivery:

1. **Write questions for the ear** — short sentences, no markdown or code syntax,
   identifiers spelled out. Include the round `announcement` naming project, topic,
   and round number so the user can tell sessions apart (formats in
   [CONTRACT.md](CONTRACT.md)).
2. Write the round JSON to the session scratchpad, then publish it:

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/grill-voice.js" publish <sessionId> <roundFile>
   ```

3. Wait for the spoken answers:

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/grill-voice.js" wait <sessionId> <round>
   ```

   Exit 0 prints the answers JSON. Exit 2 means still waiting — run `wait` again,
   indefinitely; the user answers at walking pace, and each `wait` call polls for
   several minutes before returning.
4. Treat each `transcript` as the user's answer. Transcripts are speech: read them
   charitably (homophones, spelled-out identifiers) and carry any genuinely ambiguous
   transcript into the next round as a clarification question. A `skipped` question is
   re-asked once in a later round or explicitly dropped with a note in the report.

## Step 4: Conclude

Follow mp-grill Step 4 for `CONTEXT.md` / `DECISIONS.md` updates, with one adaptation:
where mp-grill would ask the user whether an uncertain entry belongs in the docs, put
those confirmations into one final voice round instead of asking in conversation. Each
confirmation question speaks the full candidate entry — for a Domain Language term,
the term and its complete one-sentence definition, voice-adapted per
[CONTRACT.md](CONTRACT.md) — so the user hears exactly what would be written before it
lands in the docs.

Then close the session so it leaves the app's active list:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/grill-voice.js" complete <sessionId>
```

**Gate:** Continue only when the completion command succeeds and the session is absent from the app's active list.

## Report

Summarize as mp-grill does — decisions made, requirements clarified, docs updated, open
items — and note anything lost to voice: skipped questions, ambiguous transcripts, and
where each was resolved or dropped.
