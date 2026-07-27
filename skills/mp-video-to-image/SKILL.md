---
name: mp-video-to-image
description: "Turns a YouTube exercise video into a printable cheat-sheet image, reading the video with the Gemini API and handing the composed prompt to ChatGPT for generation."
when_to_use: "User asks for a cheat sheet, overview image or visual summary of a YouTube workout video."
argument-hint: "<youtube-url> [focus instructions] [--out <dir>] [--model <id>]"
allowed-tools: Read, Write, Bash(env*), Bash(node *), Bash(yt-dlp*), Bash(ffmpeg*), Bash(powershell*)
metadata:
  author: MartinoPolo
  version: "0.1"
  category: utility
---

# Workout Video to Cheat-Sheet Image

Turn a YouTube exercise video into a one-page visual overview worth pinning to a wall or
opening on a phone mid-workout. Gemini watches the video and returns a structured exercise
table; that table composes into an image prompt; ChatGPT generates the image. $ARGUMENTS

The run costs nothing. Gemini reads YouTube URLs on the free tier, and ChatGPT Plus runs
image generation at no extra charge — which is why the last step is a paste the user makes
by hand rather than an API call.

## Step 1: Parse the request

| Input | Source | Default |
| ---------- | ------------------------------------------------ | ---------------------------- |
| Video URL | the first `https://` argument | required |
| Focus | prose left over after the URL and the flags | whole video |
| Output dir | `--out` | `MPX_ONEDRIVE/AI GENERATED/workout sheets` |
| Model | `--model` | `gemini-3.6-flash` |

Focus is free text — "only the stretching section", "skip the warm-up" — and it reaches
Gemini verbatim, so pass the user's own wording rather than a paraphrase.

Resolve machine roots per [`../shared/EXPLORATION.md`](../shared/EXPLORATION.md) § "Paths
outside the working directory". With `MPX_ONEDRIVE` unset the script writes into the current
directory instead; say so in the report rather than guessing a path.

Strip a `list=` or `index=` parameter from a URL copied out of a playlist. Gemini reads the
single video the `v=` parameter names, and the extra parameters only obscure which one that
is.

## Step 2: Check the key

The script reads `GEMINI_API_KEY` and stops with a setup message when it is missing. That
message points at <https://aistudio.google.com/apikey>, where a key is free and needs no
billing account. Creating it is a one-time step the user does in the browser; once it is
stored as a user environment variable, a **new** terminal picks it up — an already-open
Windows Terminal window keeps the old environment until the whole window closes.

## Step 3: Read the video

```bash
node ${CLAUDE_SKILL_DIR}/scripts/video-to-sheet.mjs "<youtube-url>" --focus "<focus>" --out "<dir>"
```

The script sends the URL to Gemini as a `file_uri` video part, so nothing downloads. It asks
for structured JSON — title, summary, and sections of exercises carrying a name, a
sets-and-reps or duration `amount`, a `startPose`, an `endPose`, a `movementDirection`, and a
coaching `formCue` — then writes one file, `<slug>.md`, holding the exercise table and the
image prompt in a fenced block, and puts that prompt on the clipboard.

The drawing fields and the coaching field are deliberately separate. `startPose` and
`endPose` describe body geometry an illustrator could draw from ("one foot forward, opposite
hand on the ground, other arm reaching up"), and `movementDirection` is the path between
them; those three build the image prompt. `formCue` is the coaching instruction ("keep the
front knee over the ankle") and goes in the markdown table a human reads. Feeding a coaching
cue to an image model produces a picture of someone standing still, and drawing one position
instead of two leaves a Cossack Squat indistinguishable from a lateral lunge.

A run that dies with a network error retries twice on its own — Gemini holds the connection
open while it pulls the video, and that link drops often enough to matter.

Add `--media-resolution low` for a video longer than about 30 minutes. Video costs roughly
300 tokens per second at full resolution and about 100 at low, which is what keeps a long
video inside a single request. An 8-minute video measured 45k tokens and about 25 seconds at
full resolution.

The script prints one JSON line on success:

```json
{ "slug": "...", "title": "...", "exerciseCount": 12, "sheetFile": "...", "clipboard": true, "promptTokenCount": 45033 }
```

Read `<slug>.md` and check its table against the video's own description before moving on. A
table that lost a section, or that reads as a summary rather than a list of exercises, is
worth one retry with a sharper focus instruction.

**On failure.** The script explains which failure it hit. A 429 means the free tier's quota
is spent — the daily video allowance is 8 hours, and the per-minute limits vary by account
(<https://aistudio.google.com/rate-limit>). Retry once for a per-minute limit; for anything
that outlasts a retry, or a video Gemini cannot see because it is private or unlisted, take
[`reference/FALLBACK.md`](reference/FALLBACK.md), which rebuilds the same table from
`yt-dlp` subtitles and `ffmpeg` keyframes.

## Step 4: Check the prompt

The prompt block in `<slug>.md` follows the shape that produced usable sheets in practice: an opening
sentence naming the artifact and its item count, one numbered entry per exercise drawing its
start and end positions with an arrow between them, a flat-vector style block, and the
exercise list restated verbatim so the labels come back unparaphrased. Worked examples and
the reasoning behind each part:
[`reference/PROMPT_STYLE.md`](reference/PROMPT_STYLE.md).

Check it against the list at the end of that file — every exercise named, both positions
drawable and in the third person, the count matching the entries. A prompt that generalises
to "several mobility exercises" produces an image the user cannot train from.

Up to eight exercises render as numbered panels; past that the prompt switches to an icon
grid, where each tile keeps the end position and the arrow.

Reword the prompt when the video needs it — a video whose sections matter more than its
individual movements reads better as a sheet grouped by section. Edit the fenced block in
`<slug>.md`, then put the edited text back on the clipboard:

```bash
powershell -NoProfile -Command "Set-Clipboard -Value @'
<edited prompt>
'@"
```

## Step 5: Hand off to ChatGPT

The script already copied the prompt and opened <https://chatgpt.com/>. The user pastes it
and sends; image generation runs inside a ChatGPT Plus subscription at no extra cost. Ask
them to save the result next to the sheet, as `<out>/<slug>.png`.

Opening the URL is the only permitted interaction with chatgpt.com. Driving that page with a
browser tool violates OpenAI's terms of service, so the paste stays manual — see Notes for
the paid path that removes it.

When the clipboard copy failed, the script says so and the sheet is still on disk; point the
user at the fenced prompt block in `<slug>.md` to copy by hand.

## Step 6: Report

- The sheet as a clickable `file:///` link
- Video title and the exercise count the table holds
- Which path ran — Gemini video ingestion or the yt-dlp fallback — and the model used
- Whether the prompt reached the clipboard, and the reminder to paste it into the open tab
- Anything Gemini reported thinly, so the user knows which rows to check against the video

## Notes

- Gemini ingests **public** videos only. A private, unlisted or members-only video goes
  straight to the fallback path.
- Free-tier video ingestion is capped at 8 hours of video per day; the per-minute and
  per-day request limits vary by account and are worth checking at
  <https://aistudio.google.com/rate-limit> when a 429 arrives early in a session.
- Gemini's own image models are unavailable here: `gemini-3.1-flash-image` and
  `gemini-2.5-flash-image` both answer 429 RESOURCE_EXHAUSTED on a free-tier key, which is
  what makes the ChatGPT hand-off the zero-cost route rather than a limitation of the design.
- The paid alternative removes the manual paste: generating the image through the OpenAI API
  costs roughly $0.05 for a medium image and would turn Step 5 into another script call. It
  needs API credit, which a ChatGPT Plus subscription does not include.
- `yt-dlp` patterns for the fallback path came from the `youtube-playlist-downloader`
  project under `MPX_PROJECTS`.
