# Exercise mode

Read this when the video is an exercise or workout video and the run uses `--mode exercise`.
It covers what that mode extracts, why its fields are shaped the way they are, and what to
check before handing the prompt over. Everything else — the four parts of a working prompt,
the two verbatim examples — stays in [`PROMPT_STYLE.md`](PROMPT_STYLE.md).

## What the mode extracts

Per exercise: a `name`, a sets-and-reps or duration `amount`, a `startPose`, an `endPose`, a
`movementDirection`, and a coaching `formCue`. Sections follow the video's own structure —
warm-up, circuits, cool-down — and collapse to one section when the video has none.

## Drawing fields and the coaching field are separate

`startPose` and `endPose` describe body geometry an illustrator could draw from ("one foot
forward, opposite hand on the ground, other arm reaching up"), and `movementDirection` is the
path between them; those three build the image prompt. `formCue` is the coaching instruction
("keep the front knee over the ankle") and goes in the markdown table a human reads.

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

- Every exercise in the table appears by name, with its amount
- Every exercise carries a drawable start and end position, with no coaching verbs left in
  either, and both written in the third person — a stray "your" means coaching voice leaked
  into a drawing instruction
- Each arrow clause reads as a sentence: "an arrow" followed by a path, never doubled
- The exercise count in the opening sentence matches the number of panels
- Panels are grouped into rows only when a section actually holds several exercises; a video
  that titles each movement separately needs no grouping line

## Rewording

A video whose sections matter more than its individual movements reads better as a sheet
grouped by section. Edit `prompt.txt` in the run folder and re-copy it, per Step 4 of
SKILL.md.
