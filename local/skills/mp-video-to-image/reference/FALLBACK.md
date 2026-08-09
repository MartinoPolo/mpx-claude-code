# Fallback: build the sheet without Gemini video ingestion

Run this path when `video-to-sheet.mjs` exits non-zero because Gemini refused the video —
daily video quota reached, a rate limit that outlasts a retry, or a video Gemini cannot see
(private, unlisted, members-only, region-locked). It reaches the same run folder through the
machine's own copy of the video, then hands back to the normal prompt-composition step.

The deliverable is identical: `$MPX_AI_GENERATED\_VIDEO_SHEETS\[<channel>] <video title>\`
holding a single `prompt.md`, with the same columns the chosen mode produces, in the video's
own order.

## Step 1: Subtitles first

Subtitles carry the exercise names and the counts the presenter says out loud, and they cost
one small download:

```bash
yt-dlp --skip-download --write-auto-subs --write-subs --sub-langs "en.*" \
  --convert-subs srt -o "<scratchpad>/<slug>.%(ext)s" "<youtube-url>"
```

`--write-auto-subs` picks up machine captions when the channel published none of its own.

A download that fails on a bot check needs the browser's cookies — this runs from the home
IP, so a logged-in profile is enough:

```bash
yt-dlp --cookies-from-browser chrome --skip-download --write-auto-subs --sub-langs "en.*" \
  --convert-subs srt -o "<scratchpad>/<slug>.%(ext)s" "<youtube-url>"
```

Swap `chrome` for the browser actually logged in to YouTube. Close that browser first — it
locks its cookie database while running.

Read the `.srt` and keep the timestamps. They order the exercises and mark where each one
starts, which the next step needs.

## Step 2: Keyframes at the moments that matter

Subtitles name the exercises; frames show the form. Extract one frame per exercise using the
start timestamps from the `.srt` rather than a fixed interval — a fixed interval spends most
of its frames on the presenter talking:

```bash
ffmpeg -ss <HH:MM:SS> -i "<video>" -frames:v 1 -q:v 3 "<scratchpad>/frames/<nn>-<exercise-slug>.jpg"
```

That needs the video itself, so fetch a small copy once:

```bash
yt-dlp -f "bv*[height<=480]+ba/b[height<=480]" -o "<scratchpad>/<slug>.%(ext)s" "<youtube-url>"
```

480p is enough to read body position, and it keeps the download to a few tens of megabytes.

When subtitles came back empty, sample every 15 seconds instead and let the vision pass
discard the talking frames:

```bash
ffmpeg -i "<video>" -vf "fps=1/15" -q:v 3 "<scratchpad>/frames/%03d.jpg"
```

## Step 3: Vision pass

Read the frames directly with the `Read` tool — it renders images — alongside the subtitle
text, and write the same structured object the Gemini path produces for the chosen mode:

```
exercise: { title, summary, performer, sections: [ { name, exercises: [ { name, amount, startPose, endPose, movementDirection, formCue } ] } ] }
generic:  { title, summary, performer, sections: [ { name, points:    [ { label, detail, visual } ] } ] }
```

`performer` is `{ build, hair, clothing, setting }`, describing only what the frames actually
show and omitting any field they do not; leave it out entirely when nobody appears.

Hold to the rules the Gemini prompt uses: every item in the video's own order, drawing fields
describing visible geometry in the third person, `amount` filled only with a prescription the
video actually states and left empty otherwise — never the length of the demonstration — and
prose fields drawn from what the frames and captions actually show.

## Step 4: Rejoin the main path

Write the object to `<scratchpad>/<slug>.json`, then render and deliver it through the same
code the Gemini path uses, so both paths produce byte-identical formatting.

`<out>` is the run folder, named as on the Gemini path — `[<channel>] <video title>` under
`$MPX_AI_GENERATED\_VIDEO_SHEETS\`. yt-dlp already holds both, and a video this path exists
to handle is often one oEmbed cannot see:

```bash
yt-dlp --skip-download --print "%(channel)s" --print "%(title)s" "<youtube-url>"
```

Pass them through `composeFolderName` rather than joining them by hand, so the same
characters get stripped and the same length cap applies:

```bash
node -e "import('${CLAUDE_SKILL_DIR}/scripts/lib/compose.mjs').then(m => \
  console.log(m.composeFolderName({ channel: '<channel>', title: '<title>' }, '<slug>')))"
```

Create that folder, then render into it:

```bash
node -e "import('${CLAUDE_SKILL_DIR}/scripts/lib/compose.mjs').then(async m => { \
  const fs = require('fs'); const mode = '<mode>'; \
  const sheet = JSON.parse(fs.readFileSync('<scratchpad>/<slug>.json','utf8')); \
  fs.writeFileSync('<out>/prompt.md', m.renderPromptDocument(sheet, mode)); })"
```

Then hand off exactly as Step 5 of SKILL.md describes — links in the report, no clipboard and
no browser tab.

## Cost of this path

The Gemini path reads an 8-minute video in about 25 seconds. This one downloads subtitles, a
480p video and a frame set, then spends a vision pass on the frames — minutes rather than
seconds, and it consumes context that the Gemini path does not. Prefer retrying Gemini after
the quota resets when the sheet can wait until tomorrow.
