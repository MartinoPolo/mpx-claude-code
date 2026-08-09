import { describe, it, expect } from "vitest";
import {
  slugify,
  composeFolderName,
  assertApiKey,
  describeApiError,
  buildExtractionRequest,
  renderSectionTables,
  renderPromptDocument,
  composeImagePrompt,
  composePerformerSentence,
  countItems,
  resolveMode,
} from "../scripts/lib/compose.mjs";

const YOUTUBE_URL = "https://www.youtube.com/watch?v=abc123";

function partsOf(request) {
  return request.contents[0].parts;
}

function textPartOf(request) {
  return partsOf(request).find((part) => typeof part.text === "string").text;
}

describe("slugify", () => {
  it("lowercases and hyphenates a title", () => {
    expect(slugify("Daily Mobility Routine!")).toBe("daily-mobility-routine");
  });

  it("collapses runs of non-alphanumerics into a single hyphen", () => {
    expect(slugify("Push -- Pull // Legs")).toBe("push-pull-legs");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  ***Core Blast***  ")).toBe("core-blast");
  });

  it("falls back to 'video' when nothing slugifiable remains", () => {
    expect(slugify("???")).toBe("video");
  });
});

describe("composeFolderName", () => {
  it("names the folder after the channel and the video's own full title", () => {
    expect(
      composeFolderName(
        {
          title: "Best Stretches For YOUR Lower Back Pain [SO IMPORTANT!]",
          channel: "Tone and Tighten",
        },
        "lower-back-stretches",
      ),
    ).toBe("[Tone and Tighten] Best Stretches For YOUR Lower Back Pain [SO IMPORTANT!]");
  });

  it("keeps the title alone when the channel is unknown", () => {
    expect(composeFolderName({ title: "Deep Squat Drills" }, "slug")).toBe(
      "Deep Squat Drills",
    );
  });

  it("falls back to the slug when the metadata lookup returned nothing", () => {
    expect(composeFolderName(null, "daily-mobility-routine")).toBe(
      "daily-mobility-routine",
    );
    expect(composeFolderName({ title: "   " }, "daily-mobility-routine")).toBe(
      "daily-mobility-routine",
    );
  });

  it("replaces the characters Windows refuses in a path", () => {
    const folder = composeFolderName(
      { title: 'Push/Pull: Legs? <Part 2> | "Full" *Guide*', channel: "Ch\\an" },
      "slug",
    );
    expect(folder).not.toMatch(/[<>:"/\\|?*]/);
    expect(folder).toBe("[Ch an] Push Pull Legs Part 2 Full Guide");
  });

  it("straightens curly apostrophes, which break file:// links to the folder", () => {
    expect(
      composeFolderName({ title: "You Can’t Fix It (Here’s Why)" }, "slug"),
    ).toBe("You Can't Fix It (Here's Why)");
  });

  it("collapses the whitespace a newline in the title would leave behind", () => {
    expect(composeFolderName({ title: "Morning\nRoutine" }, "slug")).toBe(
      "Morning Routine",
    );
  });

  it("strips a trailing dot or space Windows would silently drop", () => {
    expect(composeFolderName({ title: "Stretch Harder..." }, "slug")).toBe(
      "Stretch Harder",
    );
  });

  it("caps the name so the files inside stay under the path limit", () => {
    const folder = composeFolderName(
      { title: "Mobility ".repeat(40), channel: "A Very Long Channel Name" },
      "slug",
    );
    expect(folder.length).toBeLessThanOrEqual(120);
  });

  it("escapes a reserved device name Windows cannot use as a folder", () => {
    expect(composeFolderName({ title: "CON" }, "slug")).toBe("CON_");
    expect(composeFolderName({ title: "com1" }, "slug")).toBe("com1_");
  });

  it("keeps a title that sanitises away from erasing the folder", () => {
    expect(composeFolderName({ title: "???" }, "daily-mobility")).toBe(
      "daily-mobility",
    );
  });
});

describe("assertApiKey", () => {
  it("returns the key when it is present", () => {
    expect(assertApiKey({ GEMINI_API_KEY: "abc123" })).toBe("abc123");
  });

  it("throws when the key is absent", () => {
    expect(() => assertApiKey({})).toThrow(/GEMINI_API_KEY/);
  });

  it("throws when the key is empty", () => {
    expect(() => assertApiKey({ GEMINI_API_KEY: "" })).toThrow(/GEMINI_API_KEY/);
  });

  it("throws when the key is whitespace only", () => {
    expect(() => assertApiKey({ GEMINI_API_KEY: "   " })).toThrow(
      /GEMINI_API_KEY/,
    );
  });

  it("points at the API key setup page in the failure message", () => {
    expect(() => assertApiKey({})).toThrow(
      "https://aistudio.google.com/apikey",
    );
  });
});

describe("describeApiError", () => {
  it("explains the free-tier quota and links the rate limit page on 429", () => {
    const message = describeApiError(429, {
      error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "quota" },
    });
    expect(message).toMatch(/free.tier/i);
    expect(message).toContain("https://aistudio.google.com/rate-limit");
  });

  it("suggests the video may be private or unlisted on 400", () => {
    const message = describeApiError(400, {
      error: { code: 400, status: "INVALID_ARGUMENT", message: "bad request" },
    });
    expect(message).toMatch(/private/i);
    expect(message).toMatch(/unlisted/i);
  });

  it("reports an invalid or unauthorized key on 403", () => {
    const message = describeApiError(403, {
      error: { code: 403, status: "PERMISSION_DENIED", message: "denied" },
    });
    expect(message).toMatch(/invalid/i);
    expect(message).toMatch(/GEMINI_API_KEY/);
  });

  it("falls back to the raw status and API message for other statuses", () => {
    const message = describeApiError(503, {
      error: { code: 503, status: "UNAVAILABLE", message: "model overloaded" },
    });
    expect(message).toContain("503");
    expect(message).toContain("model overloaded");
  });

  it("still reports the status when the body carries no API message", () => {
    expect(describeApiError(500, "<html>gateway</html>")).toContain("500");
  });
});

describe("buildExtractionRequest", () => {
  it("passes the YouTube URL as the only file_data part", () => {
    const fileDataParts = partsOf(
      buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" }),
    ).filter((part) => part.file_data);
    expect(fileDataParts).toHaveLength(1);
    expect(fileDataParts[0].file_data.file_uri).toBe(YOUTUBE_URL);
  });

  it("adds exactly one text instruction part", () => {
    const textParts = partsOf(buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" })).filter(
      (part) => typeof part.text === "string",
    );
    expect(textParts).toHaveLength(1);
  });

  it("includes the focus instruction verbatim when a focus is given", () => {
    const focus = "only the shoulder mobility drills";
    expect(textPartOf(buildExtractionRequest(YOUTUBE_URL, focus, { mode: "exercise" }))).toContain(
      focus,
    );
  });

  it("omits the focus sentence when no focus is given", () => {
    expect(textPartOf(buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" }))).not.toMatch(
      /focus/i,
    );
  });

  it("requests JSON output against the exercise schema", () => {
    const { generationConfig } = buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" });
    expect(generationConfig.responseMimeType).toBe("application/json");
    expect(generationConfig.responseSchema).toBeDefined();
  });

  it("orders the schema properties so the model emits them predictably", () => {
    const { responseSchema } = buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" })
      .generationConfig;
    expect(responseSchema.propertyOrdering).toEqual([
      "title",
      "summary",
      "performer",
      "sections",
    ]);
    expect(
      responseSchema.properties.sections.items.properties.exercises.items
        .propertyOrdering,
    ).toEqual([
      "name",
      "amount",
      "startPose",
      "endPose",
      "movementDirection",
      "formCue",
    ]);
  });

  it("asks for drawable start and end positions separate from the coaching cue", () => {
    const instruction = textPartOf(buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" }));
    expect(instruction).toMatch(/startPose/);
    expect(instruction).toMatch(/endPose/);
    expect(instruction).toMatch(/movementDirection/);
    expect(instruction).toMatch(/visible body position/i);
  });

  it("requires third-person pose descriptions so coaching voice cannot leak in", () => {
    const instruction = textPartOf(buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" }));
    expect(instruction).toMatch(/third person/i);
  });

  it("downgrades media resolution when low resolution is requested", () => {
    const { generationConfig } = buildExtractionRequest(YOUTUBE_URL, "", {
      mode: "exercise",
      mediaResolution: "low",
    });
    expect(generationConfig.mediaResolution).toBe("MEDIA_RESOLUTION_LOW");
  });

  it("omits media resolution when it is not requested", () => {
    const { generationConfig } = buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" });
    expect(generationConfig).not.toHaveProperty("mediaResolution");
  });

  it("asks for the performer's visible appearance and forbids inventing it", () => {
    const instruction = textPartOf(buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" }));
    expect(instruction).toMatch(/performer/);
    expect(instruction).toMatch(/only what is visible/i);
    expect(instruction).toMatch(/Omit any field you cannot see/i);
  });

  it("forbids inventing an amount the video never prescribed", () => {
    const instruction = textPartOf(buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" }));
    expect(instruction).toMatch(/Leave amount empty/i);
    expect(instruction).toMatch(/Never invent an amount/i);
    expect(instruction).toMatch(/demonstrated on screen/i);
  });

  it("leaves amount optional so a prescriptionless exercise is not given a filler", () => {
    const { responseSchema } = buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" })
      .generationConfig;
    expect(
      responseSchema.properties.sections.items.properties.exercises.items.required,
    ).not.toContain("amount");
  });

  it("leaves performer optional so an absent presenter is not invented", () => {
    const { responseSchema } = buildExtractionRequest(YOUTUBE_URL, "", { mode: "exercise" })
      .generationConfig;
    expect(responseSchema.required).not.toContain("performer");
    expect(responseSchema.properties.performer.required).toBeUndefined();
  });

  it("swaps in the point schema and instruction in generic mode", () => {
    const request = buildExtractionRequest(YOUTUBE_URL, "", { mode: "generic" });
    expect(
      request.generationConfig.responseSchema.properties.sections.items
        .properties.points.items.propertyOrdering,
    ).toEqual(["label", "detail", "visual"]);
    expect(textPartOf(request)).toMatch(/an illustration of/i);
    expect(textPartOf(request)).not.toMatch(/startPose/);
  });

  it("rejects an unknown mode rather than silently extracting the wrong shape", () => {
    expect(() => buildExtractionRequest(YOUTUBE_URL, "", { mode: "poster" })).toThrow(
      /Unknown --mode/,
    );
  });
});

describe("resolveMode", () => {
  it("throws when no mode is given", () => {
    expect(() => resolveMode(undefined)).toThrow(/--mode is required/);
  });

  it("names the valid modes when given an unknown one", () => {
    expect(() => resolveMode("poster")).toThrow(/exercise, generic/);
  });
});

const PANEL_SHEET = {
  title: "Daily Mobility Routine",
  summary: "Five movements to undo a day at a desk.",
  sections: [
    {
      name: "Standing",
      exercises: [
        {
          name: "Runner's Lunge",
          amount: "30 seconds each side",
          startPose: "standing in a high lunge with one foot forward and both hands on the ground",
          endPose: "in a lunge with the opposite hand on the ground, reaching the other arm up to the sky",
          movementDirection: "sweeping from the floor upward past the shoulder",
          formCue: "Keep the front knee stacked over the ankle",
        },
        {
          name: "Deep Squat",
          amount: "60 seconds",
          startPose: "standing tall with feet shoulder width apart",
          endPose: "in a deep squat with hands clasped in front of their chest",
          movementDirection: "pointing down through the hips",
          formCue: "Let the heels stay flat on the floor",
        },
        {
          name: "Cossack Squat",
          amount: "8 reps each side",
          startPose: "standing with feet wide and legs straight",
          endPose: "in a deep side lunge with one leg straight and the toes pointed up",
          movementDirection: "sweeping down and out to the left hip",
          formCue: "Sit back into the bent hip",
        },
      ],
    },
    {
      name: "Floor",
      exercises: [
        {
          name: "Windshield Wipers",
          amount: "10 reps",
          startPose: "sitting on the floor with knees bent and both feet planted",
          endPose: "sitting on the floor with knees bent and dropped to one side",
          movementDirection: "rotating the knees sideways toward the floor",
          formCue: "Move from the hips rather than the lower back",
        },
        {
          name: "Cobra Flow",
          amount: "45 seconds",
          startPose: "lying flat on their stomach with arms bent beside the chest",
          endPose: "lying on their stomach with the chest lifted and arms supporting them",
          movementDirection: "lifting the chest up and back",
          formCue: "Press the hips down as the chest rises",
        },
        {
          name: "Dead Hang",
          amount: "30 seconds",
          startPose: "standing beneath a bar with both arms reaching up to grip it",
          endPose: "hanging from a bar with arms straight overhead and shoulders relaxed",
          movementDirection: "pointing down through the spine",
          formCue: "Let the shoulders decompress",
        },
      ],
    },
  ],
};

const GRID_SHEET = {
  title: "Full Body Circuit",
  summary: "A twelve-station circuit.",
  sections: [
    {
      name: "Circuit",
      exercises: Array.from({ length: 12 }, (_unused, index) => ({
        name: `Station ${index + 1}`,
        amount: `${index + 1} reps`,
        startPose: `standing ready for station ${index + 1}`,
        endPose: `demonstrating station ${index + 1} with both arms extended`,
        movementDirection: `sweeping outward for station ${index + 1}`,
        formCue: `Cue for station ${index + 1}`,
      })),
    },
  ],
};

const NO_AMOUNT_SHEET = {
  ...PANEL_SHEET,
  sections: PANEL_SHEET.sections.map((section) => ({
    ...section,
    exercises: section.exercises.map(({ amount: _unused, ...exercise }) => exercise),
  })),
};

const EMPTY_SHEET = { title: "Nothing Found", summary: "", sections: [] };

function everyExercise(sheet) {
  return sheet.sections.flatMap((section) => section.exercises);
}

describe("renderSectionTables", () => {
  it("writes one row for every exercise across every section", () => {
    const rows = renderSectionTables(PANEL_SHEET, "exercise")
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.includes("---"));
    // Two header rows, one per section, plus the six exercise rows.
    expect(rows).toHaveLength(8);
  });

  it("keeps the sections in the order the video used them", () => {
    const table = renderSectionTables(PANEL_SHEET, "exercise");
    expect(table.indexOf("## Standing")).toBeLessThan(table.indexOf("## Floor"));
  });

  it("carries the name, amount and form cue of every exercise", () => {
    const table = renderSectionTables(PANEL_SHEET, "exercise");
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(table).toContain(exercise.name);
      expect(table).toContain(exercise.amount);
      expect(table).toContain(exercise.formCue);
    }
  });

  it("prints the lead-in once, before the first table only", () => {
    const tables = renderSectionTables(PANEL_SHEET, "exercise");
    const leadIn = "For reference, the exercises restated exactly";
    expect(tables.split(leadIn)).toHaveLength(2);
    expect(tables.indexOf(leadIn)).toBeLessThan(tables.indexOf("| Exercise"));
  });

  it("omits the Amount column when no exercise in the sheet carries one", () => {
    const tables = renderSectionTables(NO_AMOUNT_SHEET, "exercise");
    expect(tables).toContain("| Exercise | Form cue |");
    expect(tables).not.toContain("Amount");
  });

  it("keeps the Amount column when at least one exercise carries one", () => {
    expect(renderSectionTables(PANEL_SHEET, "exercise")).toContain(
      "| Exercise | Amount | Form cue |",
    );
  });

  it("escapes pipe characters so a cell cannot break the table", () => {
    const piped = {
      title: "Piped",
      summary: "",
      sections: [
        {
          name: "Only",
          exercises: [
            { name: "Push | Pull", amount: "3 x 5", startPose: "standing", endPose: "hinged", movementDirection: "pointing down", formCue: "up | down" },
          ],
        },
      ],
    };
    const row = renderSectionTables(piped, "exercise")
      .split("\n")
      .find((line) => line.includes("Push"));
    expect(row).toContain("Push \\| Pull");
    // Splitting on unescaped pipes only: the escaped ones must not open a fourth cell.
    expect(row.split(/(?<!\\)\|/)).toHaveLength(5);
  });

  it("returns a sheet without throwing when no exercises were found", () => {
    expect(() => renderSectionTables(EMPTY_SHEET, "exercise")).not.toThrow();
  });
});

describe("renderPromptDocument", () => {
  it("carries the whole set of section tables", () => {
    const document = renderPromptDocument(PANEL_SHEET, "exercise");
    expect(document).toContain(renderSectionTables(PANEL_SHEET, "exercise").trim());
  });

  it("carries the image prompt verbatim, so pasting it needs no reassembly", () => {
    const document = renderPromptDocument(PANEL_SHEET, "exercise");
    expect(document).toContain(composeImagePrompt(PANEL_SHEET, "exercise"));
  });

  it("titles the document with the sheet title", () => {
    expect(renderPromptDocument(PANEL_SHEET, "exercise")).toMatch(
      /^# Daily Mobility Routine\n/,
    );
  });

  // The whole file is pasted into an image model, which must know nothing about where the
  // material came from or what the user does with the result.
  it("never mentions the source or the hand-off in either mode", () => {
    for (const [sheet, mode] of [
      [PERFORMER_SHEET, "exercise"],
      [GRID_SHEET, "exercise"],
      [GENERIC_SHEET, "generic"],
      [EMPTY_SHEET, "exercise"],
    ] as const) {
      const document = renderPromptDocument(sheet, mode);
      expect(document).not.toMatch(/video|youtube|chatgpt|paste/i);
    }
  });

  it("leaves no fenced block or human-only scaffolding behind", () => {
    const document = renderPromptDocument(PANEL_SHEET, "exercise");
    expect(document).not.toContain("```");
    expect(document).not.toContain("## Image prompt");
    expect(document).not.toContain("## On screen");
    expect(document).not.toContain(PANEL_SHEET.summary);
  });

  it("renders a document without throwing when no exercises were found", () => {
    expect(() => renderPromptDocument(EMPTY_SHEET, "exercise")).not.toThrow();
  });
});

describe("composeImagePrompt", () => {
  it("names every exercise in the sheet", () => {
    const prompt = composeImagePrompt(PANEL_SHEET, "exercise");
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(prompt).toContain(exercise.name);
    }
  });

  it("draws both the start and the end position of every exercise", () => {
    const prompt = composeImagePrompt(PANEL_SHEET, "exercise");
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(prompt).toContain(exercise.startPose);
      expect(prompt).toContain(exercise.endPose);
    }
  });

  it("places a movement arrow between the two positions", () => {
    const prompt = composeImagePrompt(PANEL_SHEET, "exercise");
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(prompt).toContain(`an arrow ${exercise.movementDirection}`);
    }
    expect(prompt).toMatch(/start position and its end position/i);
  });

  it("normalises a direction that already names an arrow", () => {
    const withArrowNoun = {
      ...PANEL_SHEET,
      sections: [
        {
          name: "Only",
          exercises: [
            {
              ...PANEL_SHEET.sections[0].exercises[0],
              movementDirection: "a curved arrow sweeping upward",
            },
          ],
        },
      ],
    };
    const prompt = composeImagePrompt(withArrowNoun, "exercise");
    expect(prompt).toContain("an arrow sweeping upward");
    expect(prompt).not.toMatch(/arrow\s+a\s+curved\s+arrow/i);
  });

  it("drops the arrow clause when no direction was extracted", () => {
    const noDirection = {
      ...PANEL_SHEET,
      sections: [
        {
          name: "Only",
          exercises: [
            { ...PANEL_SHEET.sections[0].exercises[0], movementDirection: "" },
          ],
        },
      ],
    };
    expect(composeImagePrompt(noDirection, "exercise")).not.toMatch(/with\s+drawn between/);
  });

  it("opens by naming the artifact and its exercise count", () => {
    expect(composeImagePrompt(PANEL_SHEET, "exercise")).toMatch(/6-panel .*infographic/i);
  });

  it("includes the sheet title", () => {
    expect(composeImagePrompt(PANEL_SHEET, "exercise")).toContain("Daily Mobility Routine");
  });

  it("carries the flat vector style block", () => {
    const prompt = composeImagePrompt(PANEL_SHEET, "exercise");
    expect(prompt).toMatch(/flat vector/i);
    expect(prompt).toMatch(/white background/i);
  });

  it("leaves the verbatim restatement to the section tables", () => {
    const prompt = composeImagePrompt(PANEL_SHEET, "exercise");
    expect(prompt).not.toMatch(/For your reference/i);
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(prompt).not.toContain(exercise.formCue);
    }
    const document = renderPromptDocument(PANEL_SHEET, "exercise");
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(document).toContain(exercise.formCue);
      expect(document).toContain(exercise.amount);
    }
  });

  it("labels each panel with the amount when the sheet carries one", () => {
    const prompt = composeImagePrompt(PANEL_SHEET, "exercise");
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(prompt).toContain(exercise.amount);
    }
  });

  it("qualifies the label instruction when only some exercises carry an amount", () => {
    expect(composeImagePrompt(PANEL_SHEET, "exercise")).toContain(
      "label it with the exercise name and its amount where one is given",
    );
  });

  it("names the exercise alone when no amounts were prescribed", () => {
    const prompt = composeImagePrompt(NO_AMOUNT_SHEET, "exercise");
    expect(prompt).toContain("Panel 1 — Runner's Lunge: two figures side by side");
    expect(prompt).not.toMatch(/\(\s*\)/);
    expect(prompt).toContain("label it with the exercise name.");
    expect(prompt).not.toMatch(/its amount/);
  });

  it("switches to an icon grid past the panel limit", () => {
    const prompt = composeImagePrompt(GRID_SHEET, "exercise");
    expect(prompt).toMatch(/grid/i);
    expect(prompt).toMatch(/2-5 word/i);
    expect(prompt).toMatch(/12 exercises/i);
  });

  it("groups the panels by section when the video used more than one", () => {
    expect(composeImagePrompt(PANEL_SHEET, "exercise")).toMatch(/Standing/);
    expect(composeImagePrompt(PANEL_SHEET, "exercise")).toMatch(/Floor/);
  });

  it("skips grouping when every section holds a single exercise", () => {
    const soloSections = {
      title: "Six Movements",
      summary: "",
      sections: PANEL_SHEET.sections
        .flatMap((section) => section.exercises)
        .map((exercise) => ({ name: `The ${exercise.name}`, exercises: [exercise] })),
    };
    expect(composeImagePrompt(soloSections, "exercise")).not.toMatch(/labelled rows/i);
  });

  it("groups only when a section actually holds more than one exercise", () => {
    expect(composeImagePrompt(PANEL_SHEET, "exercise")).toMatch(/labelled rows/i);
  });

  it("returns a prompt without throwing when no exercises were found", () => {
    expect(() => composeImagePrompt(EMPTY_SHEET, "exercise")).not.toThrow();
  });
});

const PERFORMER = {
  build: "slim and athletic",
  hair: "long dark hair tied back",
  clothing: "a red t-shirt and black leggings",
  setting: "a bright home studio",
};

const PERFORMER_SHEET = { ...PANEL_SHEET, performer: PERFORMER };

describe("composePerformerSentence", () => {
  it("carries every trait the model returned", () => {
    const sentence = composePerformerSentence(PERFORMER_SHEET, "exercise");
    for (const trait of Object.values(PERFORMER)) {
      expect(sentence).toContain(trait);
    }
  });

  it("returns nothing when no performer was extracted", () => {
    expect(composePerformerSentence(PANEL_SHEET, "exercise")).toBe("");
  });

  it("skips the traits the model could not see", () => {
    const sentence = composePerformerSentence(
      { performer: { clothing: "a blue apron" } },
      "generic",
    );
    expect(sentence).toContain("a blue apron");
    expect(sentence).not.toMatch(/setting/i);
  });

  it("conditions the figure on a person appearing at all in generic mode", () => {
    expect(composePerformerSentence(PERFORMER_SHEET, "generic")).toMatch(
      /Wherever a panel shows a person/i,
    );
  });
});

describe("composeImagePrompt with a performer", () => {
  it("applies one consistent-character sentence to the panel prompt", () => {
    const prompt = composeImagePrompt(PERFORMER_SHEET, "exercise");
    expect(prompt).toContain(composePerformerSentence(PERFORMER_SHEET, "exercise"));
  });

  it("applies it to the grid prompt too", () => {
    const prompt = composeImagePrompt(
      { ...GRID_SHEET, performer: PERFORMER },
      "exercise",
    );
    expect(prompt).toContain(PERFORMER.clothing);
  });

  it("omits the sentence entirely when the performer came back empty", () => {
    expect(composeImagePrompt(PANEL_SHEET, "exercise")).not.toMatch(
      /Draw the same person/i,
    );
  });
});

describe("renderPromptDocument with a performer", () => {
  // The consistent-character sentence in the prompt body already carries the traits, so a
  // second trait table would only repeat them to the image model.
  it("carries the traits in the prompt sentence and nowhere else", () => {
    const document = renderPromptDocument(PERFORMER_SHEET, "exercise");
    expect(document).not.toContain("## On screen");
    for (const trait of Object.values(PERFORMER)) {
      expect(document.split(trait)).toHaveLength(2);
    }
  });
});

const GENERIC_SHEET = {
  title: "How Sourdough Works",
  summary: "What actually happens in the jar.",
  performer: { clothing: "a blue apron", setting: "a home kitchen" },
  sections: [
    {
      name: "The starter",
      points: [
        {
          label: "Wild yeast culture",
          detail: "Flour and water culture wild yeast over several days.",
          visual: "a glass jar of bubbling starter beside a flour scoop",
        },
        {
          label: "Daily feeding",
          detail: "Discard half and refeed to keep the culture active.",
          visual: "a hand pouring flour into a half-empty jar",
        },
      ],
    },
    {
      name: "The bake",
      points: [
        {
          label: "Bulk fermentation",
          detail: "The dough rises until nearly doubled.",
          visual: "a covered bowl of dough rising on a counter",
        },
      ],
    },
  ],
};

function everyPoint(sheet) {
  return sheet.sections.flatMap((section) => section.points);
}

describe("generic mode", () => {
  it("renders a point-and-detail table rather than an exercise table", () => {
    const table = renderSectionTables(GENERIC_SHEET, "generic");
    expect(table).toContain("| Point | Detail |");
    for (const point of everyPoint(GENERIC_SHEET)) {
      expect(table).toContain(point.label);
      expect(table).toContain(point.detail);
    }
  });

  it("keeps the drawable field out of the restated table", () => {
    const table = renderSectionTables(GENERIC_SHEET, "generic");
    expect(table).not.toContain("a covered bowl of dough rising on a counter");
  });

  it("draws every point from its visual field", () => {
    const prompt = composeImagePrompt(GENERIC_SHEET, "generic");
    for (const point of everyPoint(GENERIC_SHEET)) {
      expect(prompt).toContain(`an illustration of ${point.visual}`);
    }
  });

  it("normalises a visual that already names an illustration", () => {
    const prefixed = {
      ...GENERIC_SHEET,
      sections: [
        {
          name: "Only",
          points: [
            {
              label: "Jar",
              detail: "A jar.",
              visual: "an illustration of a glass jar",
            },
          ],
        },
      ],
    };
    const prompt = composeImagePrompt(prefixed, "generic");
    expect(prompt).toContain("an illustration of a glass jar");
    expect(prompt).not.toMatch(/illustration of an illustration/i);
  });

  it("opens by naming the artifact and its point count", () => {
    expect(composeImagePrompt(GENERIC_SHEET, "generic")).toMatch(
      /3-panel .*infographic/i,
    );
  });

  it("restates the points verbatim in the tables rather than in the prompt body", () => {
    const document = renderPromptDocument(GENERIC_SHEET, "generic");
    expect(document).toContain(
      "For reference, the points restated exactly — use these labels verbatim.",
    );
    for (const point of everyPoint(GENERIC_SHEET)) {
      expect(document).toContain(point.detail);
    }
  });

  it("switches to an icon grid past the panel limit", () => {
    const many = {
      ...GENERIC_SHEET,
      sections: [
        {
          name: "All",
          points: Array.from({ length: 12 }, (_unused, index) => ({
            label: `Point ${index + 1}`,
            detail: `Detail ${index + 1}.`,
            visual: `an icon for point ${index + 1}`,
          })),
        },
      ],
    };
    const prompt = composeImagePrompt(many, "generic");
    expect(prompt).toMatch(/grid/i);
    expect(prompt).toMatch(/12 points/i);
  });

  it("renders a document without throwing when no points were found", () => {
    expect(() =>
      renderPromptDocument({ title: "Nothing", summary: "", sections: [] }, "generic"),
    ).not.toThrow();
  });
});

describe("countItems", () => {
  it("counts exercises across every section in exercise mode", () => {
    expect(countItems(PANEL_SHEET, "exercise")).toBe(6);
  });

  it("counts points across every section in generic mode", () => {
    expect(countItems(GENERIC_SHEET, "generic")).toBe(3);
  });

  it("counts zero for a sheet the model returned empty", () => {
    expect(countItems(EMPTY_SHEET, "exercise")).toBe(0);
  });
});
