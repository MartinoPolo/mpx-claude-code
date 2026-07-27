/**
 * Pure helpers for the video-to-sheet CLI: no filesystem, network, or process access,
 * so every branch below is directly unit-testable.
 */

const FALLBACK_SLUG = "video";
const API_KEY_SETUP_URL = "https://aistudio.google.com/apikey";
const RATE_LIMIT_URL = "https://aistudio.google.com/rate-limit";

export function slugify(title) {
  const slug = String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || FALLBACK_SLUG;
}

export function assertApiKey(environment) {
  const geminiApiKey = (environment?.GEMINI_API_KEY ?? "").trim();
  if (geminiApiKey) return geminiApiKey;
  throw new Error(
    `GEMINI_API_KEY is not set. Create a key at ${API_KEY_SETUP_URL}, then set it for this machine:\n` +
      `  setx GEMINI_API_KEY "<your-key>"\n` +
      `Open a new terminal afterwards so the variable is visible.`,
  );
}

function extractApiMessage(body) {
  if (typeof body === "string") return body.slice(0, 300);
  return body?.error?.message ?? "";
}

export function describeApiError(status, body) {
  const apiMessage = extractApiMessage(body);
  if (status === 429) {
    return `Gemini refused the request: the free-tier quota for this key is exhausted. Wait for the quota window to reset or raise the limit at ${RATE_LIMIT_URL}. (${apiMessage})`;
  }
  if (status === 400) {
    return `Gemini rejected the request: the video may be private or unlisted. Gemini ingests public YouTube videos only — check the link opens in a signed-out browser. (${apiMessage})`;
  }
  if (status === 403) {
    return `Gemini rejected the key: GEMINI_API_KEY is invalid or unauthorized for this model. Create a fresh key at ${API_KEY_SETUP_URL}. (${apiMessage})`;
  }
  return `Gemini request failed with HTTP ${status}: ${apiMessage}`;
}

const EXERCISE_SHEET_SCHEMA = {
  type: "object",
  propertyOrdering: ["title", "summary", "sections"],
  required: ["title", "summary", "sections"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        propertyOrdering: ["name", "exercises"],
        required: ["name", "exercises"],
        properties: {
          name: { type: "string" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              propertyOrdering: [
                "name",
                "amount",
                "startPose",
                "endPose",
                "movementDirection",
                "formCue",
              ],
              required: [
                "name",
                "amount",
                "startPose",
                "endPose",
                "movementDirection",
                "formCue",
              ],
              properties: {
                name: { type: "string" },
                amount: { type: "string" },
                startPose: { type: "string" },
                endPose: { type: "string" },
                movementDirection: { type: "string" },
                formCue: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

const EXTRACTION_INSTRUCTION = [
  "Watch this workout video and transcribe every exercise demonstrated, in the order performed.",
  "Give the video a short title and a one-sentence summary.",
  "Group the exercises into the sections the video itself uses (warm-up, circuits, cool-down); use a single section when the video has none.",
  "Write amount as sets and reps when the video states them (for example 3 x 12 reps) and as a duration otherwise (for example 45 seconds).",
  "An exercise travels between two positions, so describe both. Write startPose and endPose as clauses completing the sentence 'A person ...', each describing only the visible body position an illustrator could draw from, for example 'standing tall with feet together and arms at their sides' and 'in a deep side lunge with one leg straight and the toes pointed up'.",
  "For a static hold, write startPose as the entry position and endPose as the held position.",
  "Write movementDirection as a short phrase completing the sentence 'an arrow ...', naming only the path the body travels between those two positions, for example 'sweeping down and out to the left hip' or 'pointing straight down through the hips'; leave the word arrow out of it.",
  "Write all three in the third person, describing the figure rather than addressing the viewer; they are drawing instructions, so keep coaching language out of them.",
  "Write formCue as one short coaching cue for performing the movement safely.",
].join(" ");

export function buildExtractionRequest(
  youtubeUrl,
  focus,
  { mediaResolution } = {},
) {
  const focusText = String(focus ?? "").trim();
  const instruction = focusText
    ? `${EXTRACTION_INSTRUCTION} Cover only this part of the video: ${focusText}`
    : EXTRACTION_INSTRUCTION;

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: EXERCISE_SHEET_SCHEMA,
  };
  // Low resolution cuts the video token count roughly fourfold; only opt in when asked,
  // because on-screen rep counts get unreadable at that sampling rate.
  if (mediaResolution === "low") {
    generationConfig.mediaResolution = "MEDIA_RESOLUTION_LOW";
  }

  return {
    contents: [
      {
        parts: [{ file_data: { file_uri: youtubeUrl } }, { text: instruction }],
      },
    ],
    generationConfig,
  };
}

// Past this many exercises a row of drawn panels stops being legible on one page, so the
// prompt switches to the icon-grid form. Both shapes are documented in reference/PROMPT_STYLE.md.
const PANEL_LAYOUT_LIMIT = 8;

const PANEL_STYLE_BLOCK =
  "The style should be clean, flat vector illustration, minimalistic, with a plain white background, serving as a step-by-step exercise guide.";
const GRID_STYLE_BLOCK =
  "The overall style should be modern, visually pleasing, flat vector art with a cohesive color palette on a plain white background.";

function escapeTableCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function everyExercise(sheet) {
  return (sheet?.sections ?? []).flatMap((section) => section.exercises ?? []);
}

function describeAmount(exercise) {
  const amount = String(exercise.amount ?? "").trim();
  return amount ? ` (${amount})` : "";
}

// The arrow noun lives here rather than in the model's output: asked for an arrow, the model
// sometimes returns one ("a curved arrow sweeping down") and sometimes a bare direction
// ("downward into a squat"), and only one of those reads as a sentence in the template.
function describeArrow(exercise) {
  const direction = String(exercise.movementDirection ?? "")
    .trim()
    .replace(/^(a|an)\s+\w*\s*arrow\s+/i, "");
  return direction ? `an arrow ${direction}` : "";
}

export function renderExerciseTable(sheet) {
  const lines = [`# ${sheet?.title ?? "Exercise Sheet"}`, ""];
  const summary = String(sheet?.summary ?? "").trim();
  if (summary) lines.push(summary, "");

  for (const section of sheet?.sections ?? []) {
    lines.push(`## ${section.name}`, "");
    lines.push("| Exercise | Amount | Form cue |", "| --- | --- | --- |");
    for (const exercise of section.exercises ?? []) {
      lines.push(
        `| ${escapeTableCell(exercise.name)} | ${escapeTableCell(exercise.amount)} | ${escapeTableCell(exercise.formCue)} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * The single deliverable: the table a human reads and the prompt they paste, in one file.
 * The prompt is fenced so a copy button yields the prompt alone, unmixed with the table.
 */
export function renderSheetDocument(sheet) {
  return [
    renderExerciseTable(sheet).trim(),
    "",
    "## Image prompt",
    "",
    "Paste this into ChatGPT to generate the sheet image.",
    "",
    "```",
    composeImagePrompt(sheet),
    "```",
    "",
  ].join("\n");
}

function composePanelPrompt(sheet, exercises) {
  // Two figures per panel rather than one: a single drawn position cannot distinguish
  // movements that share a start, and the arrow between them carries the direction.
  const panels = exercises.map((exercise, index) => {
    const arrow = describeArrow(exercise);
    const arrowClause = arrow
      ? `, with ${arrow} drawn between them to show the direction of the movement`
      : "";
    return (
      `Panel ${index + 1} — ${exercise.name}${describeAmount(exercise)}: two figures side by side, ` +
      `first a person ${exercise.startPose}, then a person ${exercise.endPose}${arrowClause}.`
    );
  });

  // Sections earn a grouping instruction only when one of them actually gathers several
  // exercises. A video that titles every movement separately yields one section per
  // exercise, where naming the rows just repeats the panel labels.
  const groupingSections = (sheet.sections ?? []).filter(
    (section) => section.name,
  );
  const gathersExercises = groupingSections.some(
    (section) => (section.exercises ?? []).length > 1,
  );
  const grouping =
    groupingSections.length > 1 && gathersExercises
      ? ` Group the panels into labelled rows: ${groupingSections.map((section) => section.name).join(", ")}.`
      : "";

  return [
    `A clean, ${exercises.length}-panel fitness infographic titled "${sheet.title}".`,
    `Every panel shows the same exercise twice — its start position and its end position — with an arrow between them.`,
    panels.join(" "),
    `${PANEL_STYLE_BLOCK} Number each panel and label it with the exercise name and its amount.${grouping}`,
  ].join(" ");
}

function composeGridPrompt(sheet, exercises) {
  // The grid has no room for a second figure, so the end position carries the tile and the
  // arrow keeps the direction readable at tile size.
  const tiles = exercises.map((exercise, index) => {
    const arrow = describeArrow(exercise);
    return `${index + 1}. ${exercise.name}${describeAmount(exercise)} — a figure ${exercise.endPose}${arrow ? `, with ${arrow}` : ""}.`;
  });

  return [
    `A highly organized fitness infographic titled "${sheet.title}" displaying ${exercises.length} exercises in a grid.`,
    "Each tile features a minimalist, colorful icon of the movement with a small arrow showing which way the body travels, paired with a very short 2-5 word label underneath it.",
    tiles.join(" "),
    GRID_STYLE_BLOCK,
  ].join(" ");
}

export function composeImagePrompt(sheet) {
  const exercises = everyExercise(sheet);
  if (exercises.length === 0) {
    return `A clean fitness infographic titled "${sheet?.title ?? "Exercise Sheet"}". No exercises were extracted from the video, so there is nothing to illustrate yet. ${PANEL_STYLE_BLOCK}`;
  }

  const body =
    exercises.length <= PANEL_LAYOUT_LIMIT
      ? composePanelPrompt(sheet, exercises)
      : composeGridPrompt(sheet, exercises);

  // Restating the source verbatim is what stops the model paraphrasing the labels;
  // reference/PROMPT_STYLE.md records the two prompts this was taken from.
  const reference = exercises
    .map(
      (exercise) =>
        `${exercise.name}${describeAmount(exercise)}: ${exercise.formCue}`,
    )
    .join(" ");

  return `${body}\n\nFor your reference, here are the ${exercises.length} exercises shown in the video: ${reference}`;
}
