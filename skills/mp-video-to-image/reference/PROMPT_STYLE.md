# Prompt style that actually renders

Both prompts below were written by hand, pasted into ChatGPT, and produced sheets worth
keeping. `composeImagePrompt` reproduces their shape; this file is the reason it has that
shape, and the reference to check a hand-edited prompt against.

## The four parts

Every prompt that worked has the same four parts in the same order.

**1. One sentence naming the artifact and its item count.** "A clean, 5-panel fitness
infographic showing a daily mobility routine." The count is what makes the model commit to a
layout instead of inventing one, and it is why a sheet comes back with exactly the exercises
the video had.

**2. One numbered entry per item, describing what is visible.** This is the part that
decides whether the image is usable. The entry describes *body geometry*, not coaching:

> Panel 1: A person in a Runner's Lunge, with one foot forward and the opposite hand on the
> ground, reaching the other arm up to the sky.

"One foot forward, opposite hand on the ground, other arm up" is drawable. "Keep your spine
long and breathe into the stretch" is not — an image model given a coaching cue draws a
person standing still. The extraction step therefore keeps the drawing instructions apart
from the coaching text: the poses go in the prompt, `formCue` goes in the markdown table
where a human reads it.

**A single drawn position is not enough.** An exercise travels, and one frozen figure cannot
tell a Cossack Squat from a lateral lunge, or a bear crawl from a plank. Each entry therefore
draws the movement twice with an arrow between:

> Panel 1 — Deep Squat Hold (1-2 minutes): two figures side by side, first a person standing
> tall with feet shoulder-width apart and arms at their sides, then a person crouching in a
> deep squat with hips dropped below the knees, heels flat on the floor, and palms pressed
> together at the chest, with an arrow pointing straight down through the hips drawn between
> them to show the direction of the movement.

That comes from three extracted fields — `startPose`, `endPose` and `movementDirection`. A
static hold uses the entry position as its start and the held position as its end, so the
same shape covers holds and reps alike.

`movementDirection` carries the path only ("pointing straight down through the hips"); the
word "arrow" is supplied by the template. Asked for an arrow directly, the model returns one
about half the time and a bare direction the rest ("downward vertically into a full squat"),
and only one of those completes the sentence.

**3. A style block.** Held constant across both working examples, and worth keeping constant:

> clean, flat vector illustration, minimalistic, with a plain white background, serving as a
> step-by-step exercise guide

and for the denser grid:

> modern, visually pleasing, flat vector art with a cohesive color palette

**4. The exact text, restated verbatim.** Both prompts end by repeating the source material
in full — "For your reference, here are the 5 exercises shown in the video", "these are the
exact points:". Without it the model paraphrases labels; with it, the labels on the sheet
match the video. Restating costs nothing and is the difference between a decorative poster
and one that can be trained from.

## Layout follows item count

| Items | Shape | Figures per item | Per-item text |
| ------- | ------------------------------------------- | ------------------------ | ------------------------- |
| Up to 8 | A single row or two rows of numbered panels | Two, plus the arrow | Full name plus the amount |
| Over 8 | A grid of small icon tiles | One, the end position | 2-5 words |

A tile has no room for a second figure, so past the panel limit the end position carries the
drawing and the arrow alone keeps the direction readable.

The 5-exercise sheet rendered as one horizontal strip: a title header, five bordered panels,
a numbered badge and name on each. The 35-item habit sheet rendered as a 5-column grid of
icon tiles, each a small illustration over a short sentence. Same four parts, different
density — the item count is what selects between them.

## The two working prompts

Kept verbatim. Rewrite a generated prompt toward these rather than away from them.

### Five exercises, panel strip

> A clean, 5-panel fitness infographic showing a daily mobility routine. Panel 1: A person in
> a Runner's Lunge, with one foot forward and the opposite hand on the ground, reaching the
> other arm up to the sky. Panel 2: A person in a Deep Squat, with hands clasped in front of
> their chest. Panel 3: A person doing Windshield Wipers, sitting on the floor with knees bent
> and dropped to one side. Panel 4: A person doing a Cobra Flow, lying on their stomach with
> their chest lifted and arms supporting them. Panel 5: A person doing a Cossack Squat, in a
> deep side lunge with one leg straight and toes pointed up. The style should be clean, flat
> vector illustration, minimalistic, with a plain white background, serving as a step-by-step
> exercise guide. For your reference, here are the 5 exercises shown in the video if you want
> to make any adjustments to the prompt: Runner's Lunge: Deep lunge with an upward thoracic
> rotation. Deep Squat: Holding a deep squat and gently shifting weight side to side.
> Windshield Wipers: Sitting with legs wide, dropping both knees to one side to rotate the hips
> internally and externally. Cobra Flow: Pressing the chest up from the floor into a spine
> extension, followed by a deep fold. Cossack Squat: A deep side lunge, stretching the
> adductors on the straight leg.

### Thirty-five items, icon grid

> A highly organized, health infographic displaying dozens of mini-habits for longevity and
> wellness. Each item features a minimalist, colorful icon representing a specific health habit
> (like a bed for sleep, a sun for morning light, a dumbbell for exercise, an apple for whole
> foods, a crossed-out phone for no screens, and a water drop for hydration) paired with a very
> short 2-5 word sentence underneath it. The overall style should be modern, visually pleasing,
> flat vector art with a cohesive color palette.

followed by "these are the exact points:" and all 35 sentences in full.

Note the parenthesised icon suggestions. Naming six concrete icons taught the model the
vocabulary for the other twenty-nine, which is cheaper than describing all of them.

## Checking a generated prompt

- Every exercise in the table appears by name
- Every exercise carries a drawable start and end position, with no coaching verbs left in
  either, and both written in the third person — a stray "your" means coaching voice leaked
  into a drawing instruction
- Each arrow clause reads as a sentence: "an arrow" followed by a path, never doubled
- The item count appears in the opening sentence and matches the number of entries
- Panels are grouped into rows only when a section actually holds several exercises;
  a video that titles each movement separately needs no grouping line
- The style block survived any editing
- The verbatim restatement is still at the end
