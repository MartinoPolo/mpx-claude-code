# Gemini TTS Fallback Backend

Used when the NotebookLM free tier's 3 audio overviews per day are spent, when generation
keeps failing, or when `--backend gemini-tts` asks for it directly.

**The division of labour inverts.** NotebookLM writes the dialogue from the brief; this
backend does not. Here you write every spoken line yourself, and the API only performs it.
The brief and the customize prompt become your inputs rather than NotebookLM's.

## Step 1: Write the full dialogue script

Convert the brief into a two-host conversation, keeping the customize prompt's rules — direct
technical language, syntax spelled out for speech, no metaphors, the personalization segment
included as its own stretch of conversation.

Budget **150 words per minute**: 10 minutes ≈ 1500 words, 15 ≈ 2250, 25 ≈ 3750.

Format — one turn per line, `Speaker: text`, exactly two speakers whose names match what you
pass on the command line:

```
Alex: Shadow DOM is one of the three web component specifications, next to custom elements
Sam: And the encapsulation runs in both directions, which is the part people miss.
Alex: In your own dashboard repo, src/lib/panel.ts line 214 calls attachShadow with mode open.
```

Write it as real conversation: one host explains, the other pushes on the part that is
actually subtle. Interruptions and follow-up questions are what make it listenable — filler
agreement is what makes it hollow.

## Step 2: Render

Run `scripts/gemini-tts-podcast.py` from this skill's own directory — reference files are read
verbatim, so resolve that path yourself rather than expecting `${CLAUDE_SKILL_DIR}` to expand
here:

```bash
pip install -U google-genai   # first run only
python <skill-dir>/scripts/gemini-tts-podcast.py \
  <slug>-script.txt "$MPX_ONEDRIVE/Podcasts/<slug>.mp3" \
  --speakers Alex,Sam --voices Kore,Puck
```

The script chunks the dialogue on turn boundaries, calls multi-speaker TTS per chunk, writes
each result as a WAV, and stitches them with ffmpeg straight into 64 kbps mono MP3 — so the
Step 6 re-encode is already applied and needs no repeat.

Read `GEMINI_API_KEY` from the environment; the script exits with an instruction when it is
absent. Keep the value out of logs, command lines and committed files.

## API facts the script depends on

Sourced from the official docs (legacy `generate_content` speech-generation page,
2026-07-25). The newer Interactions API path exists and is now recommended by Google; this
script stays on the documented `generate_content` path until the newer one is verified here.

| Fact | Value |
| ------------------------ | ------------------------------------------------------------ |
| Model | `gemini-2.5-flash-preview-tts` (`gemini-2.5-pro-preview-tts` also documented) |
| Max speakers | 2 |
| Context window | 32k tokens — the script chunks at 9000 characters |
| Returned audio | raw PCM, 24 kHz, 16-bit, mono, with no WAV header |
| Audio path | `response.candidates[0].content.parts[0].inline_data.data` |
| Voices | 30 prebuilt names; `Kore` (firm) and `Puck` (upbeat) pair well |
| Speaker matching | each `speaker=` value must match a name used in the prompt text |
| Package | `google-genai` |

## Failure handling

| Symptom | Action |
| ----------------------------------------- | --------------------------------------------------------- |
| `google-genai is missing` | `pip install -U google-genai` |
| `Set the GEMINI_API_KEY environment variable` | The variable is set at user scope; a shell that predates it needs a fresh Windows Terminal window |
| Rate limit or transport error mid-run | The script already retries 4 times with exponential backoff before giving up |
| Free-tier daily limit reached | Report it and offer tomorrow's NotebookLM quota instead |
| Audio quality worse than NotebookLM | Expected — this backend trades dialogue quality for availability. Say so when delivering. |

## Status

Written against the current documented API and syntax-checked, and not yet exercised against
a live key. The first real run is the verification.
