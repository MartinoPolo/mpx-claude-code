/**
 * Pure helpers for the video-to-sheet CLI: no filesystem, network, or process access,
 * so every branch below is directly unit-testable.
 *
 * Two sheet modes share one pipeline. `exercise` extracts a workout into drawable start and
 * end poses; `generic` extracts any other video into points carrying a drawable `visual`.
 * The difference lives entirely in the SHEET_MODES descriptors below — request, render and
 * compose all read the descriptor rather than branching on the mode name.
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

const WINDOWS_ILLEGAL_CHARACTERS = /[<>:"/\\|?*]/g;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
// The run folder sits about 55 characters deep and holds files named after the slug, so a
// long title still has to leave room under the 260-character path limit.
const FOLDER_NAME_LIMIT = 120;

function sanitizeFolderName(name) {
  const cleaned = name
    // YouTube titles carry curly apostrophes, which break the file:// links the report
    // renders; the straight apostrophe survives both Windows and markdown links.
    .replace(/[‘’]/g, "'")
    .replace(WINDOWS_ILLEGAL_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FOLDER_NAME_LIMIT)
    // Windows silently drops a trailing dot or space, leaving a folder whose name no longer
    // matches the path anything else built.
    .replace(/[. ]+$/, "");
  return WINDOWS_RESERVED_NAMES.test(cleaned) ? `${cleaned}_` : cleaned;
}

/**
 * The run folder's name, `[Channel] Video Title`.
 *
 * The sheet's own `title` is the short one Gemini writes for the header, so it cannot name
 * the folder: a user looking for a run recognises the title YouTube showed them and the
 * channel that published it. Metadata that could not be read falls back to the slug rather
 * than losing a finished run to a failed lookup.
 */
export function composeFolderName(videoMetadata, slug) {
  const title = String(videoMetadata?.title ?? "").trim();
  if (!title) return slug;
  const channel = String(videoMetadata?.channel ?? "").trim();
  return sanitizeFolderName(channel ? `[${channel}] ${title}` : title) || slug;
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

// The person on screen, so the generated sheet is recognisable as belonging to this video.
// Nothing here is required: Gemini omits what it cannot see rather than inventing it.
const PERFORMER_SCHEMA = {
  type: "object",
  propertyOrdering: ["build", "hair", "clothing", "setting"],
  properties: {
    build: { type: "string" },
    hair: { type: "string" },
    clothing: { type: "string" },
    setting: { type: "string" },
  },
};

const PERFORMER_INSTRUCTION = [
  "Fill performer with the appearance of the person on screen, so an illustrator can draw the same person on every panel: apparent build, hair, the colours and type of clothing, and the setting (gym, studio, outdoors, home).",
  "Describe only what is visible, in neutral, drawable terms — colours, shapes and garments rather than judgements about the person.",
  "Omit any field you cannot see, and leave performer out entirely when no person appears on screen.",
].join(" ");

function sectionSchema(itemsKey, itemSchema) {
  return {
    type: "array",
    items: {
      type: "object",
      propertyOrdering: ["name", itemsKey],
      required: ["name", itemsKey],
      properties: {
        name: { type: "string" },
        [itemsKey]: { type: "array", items: itemSchema },
      },
    },
  };
}

function sheetSchema(itemsKey, itemSchema) {
  return {
    type: "object",
    propertyOrdering: ["title", "summary", "performer", "sections"],
    required: ["title", "summary", "sections"],
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      performer: PERFORMER_SCHEMA,
      sections: sectionSchema(itemsKey, itemSchema),
    },
  };
}

const EXERCISE_ITEM_SCHEMA = {
  type: "object",
  propertyOrdering: [
    "name",
    "amount",
    "startPose",
    "endPose",
    "movementDirection",
    "formCue",
  ],
  // amount is deliberately absent: a required string is a string the model fills, and what it
  // fills a prescriptionless exercise with is "1 rep" or the demo clip's length.
  required: ["name", "startPose", "endPose", "movementDirection", "formCue"],
  properties: {
    name: { type: "string" },
    amount: { type: "string" },
    startPose: { type: "string" },
    endPose: { type: "string" },
    movementDirection: { type: "string" },
    formCue: { type: "string" },
  },
};

const POINT_ITEM_SCHEMA = {
  type: "object",
  propertyOrdering: ["label", "detail", "visual"],
  required: ["label", "detail", "visual"],
  properties: {
    label: { type: "string" },
    detail: { type: "string" },
    visual: { type: "string" },
  },
};

const EXERCISE_INSTRUCTION = [
  "Watch this workout video and transcribe every exercise demonstrated, in the order performed.",
  "Give the video a short title and a one-sentence summary.",
  "Group the exercises into the sections the video itself uses (warm-up, circuits, cool-down); use a single section when the video has none.",
  "Write amount only for a prescription the video actually states: sets and reps (for example 3 x 12 reps), a duration to hold or work for (for example 45 seconds), or a frequency (for example twice a day).",
  "Leave amount empty whenever the video prescribes nothing — a setup step, a demonstration of a mistake, a movement shown once, or 'hold it as long as you like'. Never invent an amount, never write a filler such as '1 set', '1 rep' or 'as needed', and never use how long the exercise happens to be demonstrated on screen as its amount.",
  "An exercise travels between two positions, so describe both. Write startPose and endPose as clauses completing the sentence 'A person ...', each describing only the visible body position an illustrator could draw from, for example 'standing tall with feet together and arms at their sides' and 'in a deep side lunge with one leg straight and the toes pointed up'.",
  "For a static hold, write startPose as the entry position and endPose as the held position.",
  "Write movementDirection as a short phrase completing the sentence 'an arrow ...', naming only the path the body travels between those two positions, for example 'sweeping down and out to the left hip' or 'pointing straight down through the hips'; leave the word arrow out of it.",
  "Write all three in the third person, describing the figure rather than addressing the viewer; they are drawing instructions, so keep coaching language out of them.",
  "Write formCue as one short coaching cue for performing the movement safely.",
  PERFORMER_INSTRUCTION,
].join(" ");

const GENERIC_INSTRUCTION = [
  "Watch this video and distil it into a one-page overview sheet.",
  "Give the video a short title and a one-sentence summary.",
  "Group the material into the sections the video itself uses; use a single section when the video has none.",
  "Within each section list the points worth remembering, in the order the video makes them.",
  "Write label as a short noun phrase of two to six words naming the point.",
  "Write detail as one sentence carrying the substance of the point, in prose a reader keeps.",
  "Write visual as a clause completing the sentence 'an illustration of ...', naming only what an illustrator would draw for that point — concrete objects, a small scene, or a simple icon, for example 'a hand pouring water into a measuring jug' — and keep abstractions, lettering and numbers out of it.",
  "Write visual in the third person; it is a drawing instruction, so keep explanatory language in detail instead.",
  PERFORMER_INSTRUCTION,
].join(" ");

const EXERCISE_STYLE_BLOCK =
  "The style should be clean, flat vector illustration, minimalistic, with a plain white background, serving as a step-by-step exercise guide.";
const GENERIC_STYLE_BLOCK =
  "The style should be clean, flat vector illustration, minimalistic, with a plain white background, serving as a single-page reference sheet.";
const GRID_STYLE_BLOCK =
  "The overall style should be modern, visually pleasing, flat vector art with a cohesive color palette on a plain white background.";

function escapeTableCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function readAmount(exercise) {
  return String(exercise?.amount ?? "").trim();
}

// An exercise the video never prescribed carries no amount, and printing empty parentheses
// after its name reads as a prescription the video never made.
function describeAmount(exercise) {
  const amount = readAmount(exercise);
  return amount ? ` (${amount})` : "";
}

function hasAnyAmount(exercises) {
  return exercises.some((exercise) => readAmount(exercise));
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

function describeVisual(point) {
  const visual = String(point.visual ?? "")
    .trim()
    .replace(/^an?\s+illustration\s+of\s+/i, "");
  return visual || String(point.label ?? "").trim();
}

const SHEET_MODES = {
  exercise: {
    itemsKey: "exercises",
    schema: sheetSchema("exercises", EXERCISE_ITEM_SCHEMA),
    instruction: EXERCISE_INSTRUCTION,
    styleBlock: EXERCISE_STYLE_BLOCK,
    tableLeadIn:
      "For reference, the exercises restated exactly — use these names verbatim as the labels.",
    // A sheet where no exercise was prescribed anything would print a column of blanks, so
    // the Amount column only appears when at least one exercise carries one.
    columns: [
      { header: "Exercise", cell: (exercise) => exercise.name },
      {
        header: "Amount",
        cell: (exercise) => exercise.amount,
        include: hasAnyAmount,
      },
      { header: "Form cue", cell: (exercise) => exercise.formCue },
    ],
    emptyPromptNote:
      "No exercises were extracted, so there is nothing to illustrate yet.",
    openingSentence: (sheet, count) =>
      `A clean, ${count}-panel fitness infographic titled "${sheet.title}". ` +
      `Every panel shows the same exercise twice — its start position and its end position — with an arrow between them.`,
    gridOpeningSentence: (sheet, count) =>
      `A highly organized fitness infographic titled "${sheet.title}" displaying ${count} exercises in a grid. ` +
      `Each tile features a minimalist, colorful icon of the movement with a small arrow showing which way the body travels, paired with a very short 2-5 word label underneath it.`,
    panelEntry: (exercise, index) => {
      // Two figures per panel rather than one: a single drawn position cannot distinguish
      // movements that share a start, and the arrow between them carries the direction.
      const arrow = describeArrow(exercise);
      const arrowClause = arrow
        ? `, with ${arrow} drawn between them to show the direction of the movement`
        : "";
      return (
        `Panel ${index + 1} — ${exercise.name}${describeAmount(exercise)}: two figures side by side, ` +
        `first a person ${exercise.startPose}, then a person ${exercise.endPose}${arrowClause}.`
      );
    },
    // The grid has no room for a second figure, so the end position carries the tile and the
    // arrow keeps the direction readable at tile size.
    gridEntry: (exercise, index) => {
      const arrow = describeArrow(exercise);
      return `${index + 1}. ${exercise.name}${describeAmount(exercise)} — a figure ${exercise.endPose}${arrow ? `, with ${arrow}` : ""}.`;
    },
    performerLead: "Draw the same person in every panel",
    panelCaption: (exercises) =>
      hasAnyAmount(exercises)
        ? "Number each panel and label it with the exercise name and its amount where one is given."
        : "Number each panel and label it with the exercise name.",
  },
  generic: {
    itemsKey: "points",
    schema: sheetSchema("points", POINT_ITEM_SCHEMA),
    instruction: GENERIC_INSTRUCTION,
    styleBlock: GENERIC_STYLE_BLOCK,
    tableLeadIn:
      "For reference, the points restated exactly — use these labels verbatim.",
    columns: [
      { header: "Point", cell: (point) => point.label },
      { header: "Detail", cell: (point) => point.detail },
    ],
    emptyPromptNote:
      "No points were extracted, so there is nothing to illustrate yet.",
    openingSentence: (sheet, count) =>
      `A clean, ${count}-panel infographic titled "${sheet.title}". ` +
      `Every panel illustrates one point and carries its label underneath.`,
    gridOpeningSentence: (sheet, count) =>
      `A highly organized infographic titled "${sheet.title}" displaying ${count} points in a grid. ` +
      `Each tile features a minimalist, colorful icon of the point paired with a very short 2-5 word label underneath it.`,
    panelEntry: (point, index) =>
      `Panel ${index + 1} — ${point.label}: an illustration of ${describeVisual(point)}.`,
    gridEntry: (point, index) =>
      `${index + 1}. ${point.label} — an illustration of ${describeVisual(point)}.`,
    performerLead:
      "Wherever a panel shows a person, draw the same person throughout",
    panelCaption: () => "Number each panel and label it with the point's name.",
  },
};

// No default: which sheet a video should become is the user's call, and guessing it from a
// title silently produces the wrong schema for the whole run.
export function resolveMode(mode) {
  const descriptor = SHEET_MODES[mode];
  if (descriptor) return descriptor;
  const modeList = Object.keys(SHEET_MODES).join(", ");
  throw new Error(
    mode
      ? `Unknown --mode "${mode}". Use one of: ${modeList}.`
      : `--mode is required. Use one of: ${modeList}.`,
  );
}

export function buildExtractionRequest(
  youtubeUrl,
  focus,
  { mediaResolution, mode } = {},
) {
  const descriptor = resolveMode(mode);
  const focusText = String(focus ?? "").trim();
  const instruction = focusText
    ? `${descriptor.instruction} Cover only this part of the video: ${focusText}`
    : descriptor.instruction;

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: descriptor.schema,
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

// Past this many items a row of drawn panels stops being legible on one page, so the prompt
// switches to the icon-grid form. Both shapes are documented in reference/PROMPT_STYLE.md.
const PANEL_LAYOUT_LIMIT = 8;

function everyItem(sheet, descriptor) {
  return (sheet?.sections ?? []).flatMap(
    (section) => section[descriptor.itemsKey] ?? [],
  );
}

export function countItems(sheet, mode) {
  return everyItem(sheet, resolveMode(mode)).length;
}

function performerFields(sheet) {
  const performer = sheet?.performer ?? {};
  const read = (field) => String(performer[field] ?? "").trim();
  return {
    build: read("build"),
    hair: read("hair"),
    clothing: read("clothing"),
    setting: read("setting"),
  };
}

/**
 * One sentence applied to every panel, so the drawn figure resembles the person in the source
 * video and the sheet is recognisable as belonging to it. An empty performer yields "".
 */
export function composePerformerSentence(sheet, mode) {
  const descriptor = resolveMode(mode);
  const { build, hair, clothing, setting } = performerFields(sheet);
  const figureParts = [build, hair, clothing].filter(Boolean);
  const sentences = [];
  if (figureParts.length > 0) {
    sentences.push(`${descriptor.performerLead}: ${figureParts.join(", ")}.`);
  }
  if (setting) {
    sentences.push(`Suggest the setting with a few minimal props: ${setting}.`);
  }
  return sentences.join(" ");
}

/**
 * The columns this sheet's tables actually carry: a column whose `include` predicate rejects
 * the sheet's items is dropped everywhere, so every section's table has the same shape.
 */
function visibleColumns(descriptor, items) {
  return descriptor.columns.filter(
    (column) => !column.include || column.include(items),
  );
}

/**
 * One markdown table per section, restating the items verbatim. The tables are what stop the
 * image model paraphrasing the labels, so they belong in the pasted document rather than in a
 * separate human-only file.
 */
export function renderSectionTables(sheet, mode) {
  const descriptor = resolveMode(mode);
  const columns = visibleColumns(descriptor, everyItem(sheet, descriptor));
  const headerRow = `| ${columns.map((column) => column.header).join(" | ")} |`;
  const dividerRow = `| ${columns.map(() => "---").join(" | ")} |`;

  const lines = [];
  let leadInPrinted = false;
  for (const section of sheet?.sections ?? []) {
    lines.push(`## ${section.name}`, "");
    // The lead-in explains every table that follows, so it is printed once.
    if (!leadInPrinted) {
      lines.push(descriptor.tableLeadIn, "");
      leadInPrinted = true;
    }
    lines.push(headerRow, dividerRow);
    for (const item of section[descriptor.itemsKey] ?? []) {
      lines.push(
        `| ${columns.map((column) => escapeTableCell(column.cell(item))).join(" | ")} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * The single deliverable, `prompt.md`: a document whose entire content is safe to paste into
 * an image model. Everything about where the material came from lives outside this file —
 * the image model is told what to draw and nothing else.
 */
export function renderPromptDocument(sheet, mode) {
  const tables = renderSectionTables(sheet, mode).trimEnd();
  return [
    `# ${sheet?.title ?? "Sheet"}`,
    "",
    composeImagePrompt(sheet, mode),
    ...(tables ? ["", tables] : []),
    "",
  ].join("\n");
}

function composePanelPrompt(sheet, descriptor, items, performerSentence) {
  const panels = items.map((item, index) => descriptor.panelEntry(item, index));

  // Sections earn a grouping instruction only when one of them actually gathers several
  // items. A video that titles every item separately yields one section per item, where
  // naming the rows just repeats the panel labels.
  const groupingSections = (sheet.sections ?? []).filter(
    (section) => section.name,
  );
  const gathersItems = groupingSections.some(
    (section) => (section[descriptor.itemsKey] ?? []).length > 1,
  );
  const grouping =
    groupingSections.length > 1 && gathersItems
      ? ` Group the panels into labelled rows: ${groupingSections.map((section) => section.name).join(", ")}.`
      : "";

  return [
    descriptor.openingSentence(sheet, items.length),
    panels.join(" "),
    performerSentence,
    `${descriptor.styleBlock} ${descriptor.panelCaption(items)}${grouping}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function composeGridPrompt(sheet, descriptor, items, performerSentence) {
  const tiles = items.map((item, index) => descriptor.gridEntry(item, index));

  return [
    descriptor.gridOpeningSentence(sheet, items.length),
    tiles.join(" "),
    performerSentence,
    GRID_STYLE_BLOCK,
  ]
    .filter(Boolean)
    .join(" ");
}

export function composeImagePrompt(sheet, mode) {
  const descriptor = resolveMode(mode);
  const items = everyItem(sheet, descriptor);
  const performerSentence = composePerformerSentence(sheet, mode);

  if (items.length === 0) {
    return [
      `A clean infographic titled "${sheet?.title ?? "Video Sheet"}".`,
      descriptor.emptyPromptNote,
      descriptor.styleBlock,
    ].join(" ");
  }

  // The verbatim restatement that keeps labels unparaphrased lives in the section tables
  // renderPromptDocument appends, so the body ends here.
  return items.length <= PANEL_LAYOUT_LIMIT
    ? composePanelPrompt(sheet, descriptor, items, performerSentence)
    : composeGridPrompt(sheet, descriptor, items, performerSentence);
}
