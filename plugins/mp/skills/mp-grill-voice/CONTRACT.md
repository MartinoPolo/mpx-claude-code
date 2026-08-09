# Voice Grilling File Contract

The interface between a grilling session (this skill, running in Claude Code on the
laptop) and the companion mobile voice app. Both sides read and write plain JSON files
in a shared sessions root; neither calls the other directly.

## Sessions root

`MPX_VOICE_GRILL_ROOT` when set, otherwise `<home>/.mpx-voice-grill/sessions`
(the script derives home itself). One folder per session:

```
<root>/
└── <sessionId>/
    ├── session.json            # metadata + status (skill-owned)
    ├── round-1.json            # published questions (skill-owned)
    ├── round-1.answers.json    # answers (app-owned)
    ├── round-2.json
    ├── round-2.answers.json
    └── audio/                  # optional recordings (app-owned)
        └── r2q1.m4a
```

`sessionId` = `<project-slug>--<topic-slug>--<yyyymmdd-hhmm>`.

The app builds its multi-session hub by scanning `<root>/*/session.json`; a session
with `status: awaiting_answers` is ready to be answered.

## session.json (skill-owned)

```json
{
  "schema": 1,
  "sessionId": "myapp--authentication--20260808-1430",
  "project": "myapp",
  "projectPath": "C:\\path\\to\\repo",
  "topic": "authentication",
  "createdAt": "2026-08-08T14:30:00.000Z",
  "status": "awaiting_answers",
  "currentRound": 2,
  "completedAt": "2026-08-08T15:10:00.000Z"
}
```

`status` lifecycle: `evaluating` (skill is composing the next round or digesting
answers) → `awaiting_answers` (a round is published) → back to `evaluating` →
finally `completed`. The app treats `evaluating` as "check back later" and may move
the user to another session. `completedAt` appears only on completed sessions.

## round-N.json (skill-owned)

```json
{
  "schema": 1,
  "sessionId": "myapp--authentication--20260808-1430",
  "round": 2,
  "createdAt": "2026-08-08T14:42:00.000Z",
  "announcement": "Round 2 of authentication grilling for myapp. Three questions.",
  "questions": [
    {
      "id": "r2q1",
      "title": "Session storage",
      "text": "Where should refresh tokens live: httpOnly cookie or secure device storage?",
      "recommendation": "httpOnly cookie — the web client is primary and it removes XSS token theft.",
      "context": "Round 1 settled on OAuth with refresh tokens."
    }
  ]
}
```

- `announcement` is spoken first — it orients a user switching between sessions.
- `text` and `recommendation` are written to be **heard**: short sentences, no
  markdown, no code blocks; spell out identifiers ("dot env file", not `.env`).
- `recommendation` is read only when the user asks for it.
- `context` is optional per-question orientation, also voice-friendly.
- Question ids are `r<round>q<n>` and unique within the session.

## round-N.answers.json (app-owned)

```json
{
  "schema": 1,
  "sessionId": "myapp--authentication--20260808-1430",
  "round": 2,
  "answeredAt": "2026-08-08T14:55:00.000Z",
  "answers": [
    {
      "questionId": "r2q1",
      "transcript": "Let's go with the cookie, but I want a thirty day expiry.",
      "audioFile": "audio/r2q1.m4a",
      "skipped": false
    }
  ]
}
```

- The app writes the file **once, complete** (write to a temp name, then rename) after
  the whole round is answered — the skill's `wait` command treats existence as done.
- `transcript` is the Whisper transcription; it is the authoritative answer.
- `audioFile` is an optional session-relative path kept for re-transcription.
- `skipped: true` means the user declined or deferred; the skill re-asks or drops the
  question explicitly in a later round.

## App-side responsibilities (informative)

Playback loop per round: speak `announcement`, then per question speak `title` + `text`,
listen, transcribe, confirm on request; support "repeat" (re-speak from the start of the
question), barge-in interruption, "recommendation" on demand, and "skip". Earbud
media-button press toggles listening; a silence timeout ends an answer. No AI calls
happen between questions — the round is pure playback and capture.
