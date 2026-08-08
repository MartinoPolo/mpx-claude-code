# Exercise mode

Read this when the video is an exercise or workout video and the run uses `--mode exercise`.
It covers what that mode extracts, why its fields are shaped the way they are, and what to
check before handing the prompt over. Everything else — the four parts of a working prompt,
the two verbatim examples — stays in [`PROMPT_STYLE.md`](PROMPT_STYLE.md).

## What the mode extracts

Per exercise: a `name`, an `amount`, a `startPose`, an `endPose`, a `movementDirection`, and a
coaching `formCue`. Sections follow the video's own structure — warm-up, circuits, cool-down —
and collapse to one section when the video has none.

## An amount only exists when the video prescribes one

`amount` carries sets and reps, a duration to hold, or a frequency — and only when the video
actually states it. A setup step, a demonstration of a mistake, or a "hold it as long as you
like" has no amount, and the field comes back empty; the prompt then names the exercise alone,
with no parentheses, and a sheet where nothing was prescribed drops the Amount column from its
tables entirely. The schema leaves `amount` optional for that reason: a required string is
a string the model fills, and what it fills with is "1 set", "1 rep" or "as needed".

**How long the exercise is demonstrated on screen is not an amount.** A clip that runs 45
seconds is an editing decision, not a prescription, and "45 seconds" printed on the sheet
tells the reader to hold something the video never asked them to hold.

## Drawing fields and the coaching field are separate

`startPose` and `endPose` describe body geometry an illustrator could draw from ("one foot
forward, opposite hand on the ground, other arm reaching up"), and `movementDirection` is the
path between them; those three build the prompt body. `formCue` is the coaching instruction
("keep the front knee over the ankle") and goes in the restatement table under the prompt,
where it doubles as a form reminder for the drawn figure.

Feeding a coaching cue to an image model produces a picture of someone standing still, and
drawing one position instead of two leaves a Cossack Squat indistinguishable from a lateral
lunge.

`movementDirection` carries the path only; the word "arrow" comes from the prompt template.
Asked for an arrow directly, the model returns one about half the time and a bare direction
the rest, and only one of those completes the sentence.

A static hold uses its entry position as `startPose` and the held position as `endPose`, so
the same shape covers holds and reps alike.

## Layout follows the exercise count

Up to eight exercises render as numbered panels, each drawing the start and end positions
with an arrow between them. Past eight the prompt switches to an icon grid, where a tile has
no room for a second figure: the end position carries the drawing and the arrow alone keeps
the direction readable at tile size.

## Checking an exercise prompt

- Every exercise in the table appears by name, carrying its amount only where the video gave
  one — an amount the video never stated is a defect to delete from `prompt.md`, from both the
  panel entry and the table row, whether it is a filler ("1 set", "1 rep", "As needed") or the demo clip's length
  ("45 seconds") dressed up as a prescription
- Every exercise carries a drawable start and end position, with no coaching verbs left in
  either, and both written in the third person — a stray "your" means coaching voice leaked
  into a drawing instruction
- Each arrow clause reads as a sentence: "an arrow" followed by a path, never doubled
- The exercise count in the opening sentence matches the number of panels
- Panels are grouped into rows only when a section actually holds several exercises; a video
  that titles each movement separately needs no grouping line

## Rewording

A video whose sections matter more than its individual movements reads better as a sheet
grouped by section. Edit `prompt.md` in the run folder — the whole file is what gets pasted,
per Step 4 of SKILL.md.
