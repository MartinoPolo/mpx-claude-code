---
name: mp-video-to-image
description: "Turns any YouTube video into a printable one-page sheet image, reading the video with the Gemini API and handing the composed prompt to ChatGPT for generation. Workout videos get a dedicated exercise mode; everything else becomes an infographic overview."
when_to_use: "User asks for a cheat sheet, overview image, infographic or visual summary of a YouTube video — including a workout or exercise video."
argument-hint: "<youtube-url> [focus instructions] [--mode exercise|generic] [--out <dir>] [--model <id>]"
allowed-tools: Read, Write, Bash(node *), Bash(yt-dlp*), Bash(ffmpeg*), Bash(env*)
metadata:
  author: MartinoPolo
  version: "0.8"
  category: utility
---

# Video to Sheet Image

Turn a YouTube video into a one-page visual overview worth pinning to a wall or opening on a
phone. Gemini watches the video and returns a structured table; that table composes into an
image prompt; ChatGPT generates the image. $ARGUMENTS

The run costs nothing. Gemini reads YouTube URLs on the free tier, and ChatGPT Plus runs
image generation at no extra charge — which is why the last step is a paste the user makes
by hand rather than an API call.

## Step 1: Parse the request

| Input | Source | Default |
| ---------- | ------------------------------------------------ | ---------------------------- |
| Video URL | the first `https://` argument | required |
| Focus | prose left over after the URL and the flags | whole video |
| Mode | `--mode`, or the user's answer | required — ask |
| Output dir | `--out` | `MPX_AI_GENERATED/_VIDEO_SHEETS` |
| Model | `--model` | `gemini-3.6-flash` |

**Mode picks the schema, and the user picks the mode.** `exercise` extracts a workout into
exercises with drawable start and end positions. `generic` extracts any other video into
points, each carrying a short detail for the reader and a `visual` describing what an
illustrator would draw. The two produce different sheets from the same video, so the choice
belongs to the user, not to a guess from the title.

Take the mode from an explicit `--mode` flag, or from a request that already names one ("a
workout sheet", "an infographic overview"). When neither says, **ask which mode to run**
before Step 3 — one question, the two options and what each produces. The script itself has
no default and stops when `--mode` is missing, so a mode reaches it on every run.

For an exercise run, read [`reference/EXERCISE.md`](reference/EXERCISE.md) before Step 3.

Focus is free text — "only the stretching section", "skip the warm-up" — and it reaches
Gemini verbatim, so pass the user's own wording rather than a paraphrase.

Resolve machine roots with `env | grep '^MPX_'` before Step 3 — a written `$MPX_AI_GENERATED`
is literal text until it is looked up (see [`../shared/EXPLORATION.md`](../shared/EXPLORATION.md)
§ "Paths outside the working directory"), and checking now catches an unset variable before
Step 3 spends the Gemini call on a run that would fail to write anyway. Every run gets its
own folder, `$MPX_AI_GENERATED\_VIDEO_SHEETS\[<channel>] <video title>\`, holding a single
`prompt.md`; the user saves the generated image there by hand. With neither
`MPX_AI_GENERATED` nor `MPX_ONEDRIVE` set the script stops and names the variable to set —
pass `--out` to override it.

**The folder carries the video's own full title and its channel**, read from YouTube's
keyless oEmbed endpoint rather than from the sheet. Gemini writes a short title for the
sheet header — "Lower Back Stretches for Back Pain Relief" — which is not what the user
saw on YouTube, so a folder named after it is a folder they cannot find again. Characters
Windows refuses become spaces, the name caps at 120 characters, and a lookup that fails
falls back to the slug rather than costing the run.

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
node ${CLAUDE_SKILL_DIR}/scripts/video-to-sheet.mjs "<youtube-url>" --mode <mode> --focus "<focus>"
```

The script sends the URL to Gemini as a `file_uri` video part, so nothing downloads. It asks
for structured JSON — a title, a one-sentence summary, a `performer` object, and sections of
items whose shape the mode decides — then writes one `prompt.md`: the composed image prompt
followed by the items restated as tables. Every line of that file is written to be read by the
image model, so it names no source and carries no instructions to the user.

The script writes files and nothing else. It never touches the clipboard and never opens a
browser tab — a tab appearing mid-run steals the focus of whoever is watching the terminal,
and the hand-off in Step 5 is a link the user follows when they are ready.

**`performer` is what makes the sheet recognisable as this video's.** Gemini describes the
person on screen — build, hair, clothing colours and type, and the setting — in neutral,
drawable terms, describing only what is visible and omitting anything it cannot see. Those
traits become one consistent-character sentence applied to every panel, visible in `prompt.md`
so the user can check them. A video with nobody on screen comes back with an empty `performer`
and the sentence is simply omitted.

A run that dies with a network error retries twice on its own — Gemini holds the connection
open while it pulls the video, and that link drops often enough to matter.

Add `--media-resolution low` for a video longer than about 30 minutes. Video costs roughly
300 tokens per second at full resolution and about 100 at low, which is what keeps a long
video inside a single request. An 8-minute video measured 45k tokens and about 25 seconds at
full resolution.

The script prints one JSON line on success:

```json
{ "slug": "...", "folderName": "[Channel] Video Title", "title": "...", "videoTitle": "...", "channel": "...", "mode": "exercise", "itemCount": 12, "promptFile": ".../prompt.md", "promptTokenCount": 45033 }
```

`title` is Gemini's sheet header; `videoTitle` and `channel` are YouTube's own and name the
folder. Both come back empty when the oEmbed lookup failed, which is also what makes
`folderName` fall back to the slug — worth reporting, because the user then has a folder
named unlike every other run.

Read `prompt.md` and check its tables against the video's own description before moving on. A
table that lost a section, or that reads as a summary rather than a list of items, is worth
one retry with a sharper focus instruction.

**On failure.** The script explains which failure it hit. A 429 means the free tier's quota
is spent — the daily video allowance is 8 hours, and the per-minute limits vary by account
(<https://aistudio.google.com/rate-limit>). Retry once for a per-minute limit; for anything
that outlasts a retry, or a video Gemini cannot see because it is private or unlisted, take
[`reference/FALLBACK.md`](reference/FALLBACK.md), which rebuilds the same table from
`yt-dlp` subtitles and `ffmpeg` keyframes.

## Step 4: Check the prompt

The prompt follows the shape that produced usable sheets in practice: an opening sentence
naming the artifact and its item count, one numbered entry per item describing what is
visible, the consistent-character sentence, a flat-vector style block, and the item tables
restating the labels verbatim so they come back unparaphrased. Worked examples and the reasoning
behind each part: [`reference/PROMPT_STYLE.md`](reference/PROMPT_STYLE.md), whose closing
checklist is what to check a prompt against. Exercise mode adds its own checks in
[`reference/EXERCISE.md`](reference/EXERCISE.md).

A prompt that generalises to "several mobility exercises" or "various tips" produces an image
the user cannot use. Up to eight items render as numbered panels; past that the prompt
switches to an icon grid.

Reword the prompt when the video needs it. Edit `prompt.md` in the run folder — it is the only
copy. Keep the file free of anything the image model should not read: no mention of a source
video, no instructions addressed to the user.

## Step 5: Hand off to ChatGPT

End the report with a `file:///` link to `prompt.md` and a plain link to
<https://chatgpt.com/>, and say the **whole file** — prompt and tables — is copied and pasted
by hand. Pasting the tables alongside the prompt produced a better image than the prompt
alone, which is why the file holds nothing that should not be pasted. Do not open the
browser and do not copy anything to the clipboard — the user opens the link when it suits
them.

Image generation runs inside a ChatGPT Plus subscription at no extra cost. Ask them to save
the result into the run folder under whatever name they like, so the folder holds the sheet,
the prompt and the image together.

Handing over the URL is the only permitted interaction with chatgpt.com. Driving that page
with a browser tool violates OpenAI's terms of service, so the paste stays manual — see Notes
for the paid path that removes it.

## Step 6: Report

- The run folder and `prompt.md` as clickable `file:///` links
- The video's own title and channel, the mode that ran, and the item count the table holds,
  plus the fact that the folder fell back to the slug whenever `videoTitle` came back empty
- Which path ran — Gemini video ingestion or the yt-dlp fallback — and the model used
- The `performer` traits the sheet will draw, so the user can correct a wrong one
- The ChatGPT link, with the reminder to paste the whole of `prompt.md` by hand
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
