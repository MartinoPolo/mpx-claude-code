import { describe, it, expect } from "vitest";
import {
  slugify,
  assertApiKey,
  describeApiError,
  buildExtractionRequest,
  renderExerciseTable,
  renderSheetDocument,
  composeImagePrompt,
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
      buildExtractionRequest(YOUTUBE_URL, "", {}),
    ).filter((part) => part.file_data);
    expect(fileDataParts).toHaveLength(1);
    expect(fileDataParts[0].file_data.file_uri).toBe(YOUTUBE_URL);
  });

  it("adds exactly one text instruction part", () => {
    const textParts = partsOf(buildExtractionRequest(YOUTUBE_URL, "", {})).filter(
      (part) => typeof part.text === "string",
    );
    expect(textParts).toHaveLength(1);
  });

  it("includes the focus instruction verbatim when a focus is given", () => {
    const focus = "only the shoulder mobility drills";
    expect(textPartOf(buildExtractionRequest(YOUTUBE_URL, focus, {}))).toContain(
      focus,
    );
  });

  it("omits the focus sentence when no focus is given", () => {
    expect(textPartOf(buildExtractionRequest(YOUTUBE_URL, "", {}))).not.toMatch(
      /focus/i,
    );
  });

  it("requests JSON output against the exercise schema", () => {
    const { generationConfig } = buildExtractionRequest(YOUTUBE_URL, "", {});
    expect(generationConfig.responseMimeType).toBe("application/json");
    expect(generationConfig.responseSchema).toBeDefined();
  });

  it("orders the schema properties so the model emits them predictably", () => {
    const { responseSchema } = buildExtractionRequest(YOUTUBE_URL, "", {})
      .generationConfig;
    expect(responseSchema.propertyOrdering).toEqual([
      "title",
      "summary",
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
    const instruction = textPartOf(buildExtractionRequest(YOUTUBE_URL, "", {}));
    expect(instruction).toMatch(/startPose/);
    expect(instruction).toMatch(/endPose/);
    expect(instruction).toMatch(/movementDirection/);
    expect(instruction).toMatch(/visible body position/i);
  });

  it("requires third-person pose descriptions so coaching voice cannot leak in", () => {
    const instruction = textPartOf(buildExtractionRequest(YOUTUBE_URL, "", {}));
    expect(instruction).toMatch(/third person/i);
  });

  it("downgrades media resolution when low resolution is requested", () => {
    const { generationConfig } = buildExtractionRequest(YOUTUBE_URL, "", {
      mediaResolution: "low",
    });
    expect(generationConfig.mediaResolution).toBe("MEDIA_RESOLUTION_LOW");
  });

  it("omits media resolution when it is not requested", () => {
    const { generationConfig } = buildExtractionRequest(YOUTUBE_URL, "", {});
    expect(generationConfig).not.toHaveProperty("mediaResolution");
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

const EMPTY_SHEET = { title: "Nothing Found", summary: "", sections: [] };

function everyExercise(sheet) {
  return sheet.sections.flatMap((section) => section.exercises);
}

describe("renderExerciseTable", () => {
  it("writes one row for every exercise across every section", () => {
    const rows = renderExerciseTable(PANEL_SHEET)
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.includes("---"));
    // Two header rows, one per section, plus the six exercise rows.
    expect(rows).toHaveLength(8);
  });

  it("keeps the sections in the order the video used them", () => {
    const table = renderExerciseTable(PANEL_SHEET);
    expect(table.indexOf("## Standing")).toBeLessThan(table.indexOf("## Floor"));
  });

  it("carries the name, amount and form cue of every exercise", () => {
    const table = renderExerciseTable(PANEL_SHEET);
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(table).toContain(exercise.name);
      expect(table).toContain(exercise.amount);
      expect(table).toContain(exercise.formCue);
    }
  });

  it("titles the sheet with the video title", () => {
    expect(renderExerciseTable(PANEL_SHEET)).toContain("# Daily Mobility Routine");
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
    const row = renderExerciseTable(piped)
      .split("\n")
      .find((line) => line.includes("Push"));
    expect(row).toContain("Push \\| Pull");
    // Splitting on unescaped pipes only: the escaped ones must not open a fourth cell.
    expect(row.split(/(?<!\\)\|/)).toHaveLength(5);
  });

  it("returns a sheet without throwing when no exercises were found", () => {
    expect(() => renderExerciseTable(EMPTY_SHEET)).not.toThrow();
  });
});

describe("renderSheetDocument", () => {
  it("carries the whole exercise table", () => {
    const document = renderSheetDocument(PANEL_SHEET);
    expect(document).toContain(renderExerciseTable(PANEL_SHEET).trim());
  });

  it("carries the image prompt verbatim, so pasting it needs no reassembly", () => {
    const document = renderSheetDocument(PANEL_SHEET);
    expect(document).toContain(composeImagePrompt(PANEL_SHEET));
  });

  it("fences the prompt so a copy button takes the prompt and nothing else", () => {
    const [, fenced] = renderSheetDocument(PANEL_SHEET).split("```");
    expect(fenced.trim()).toBe(composeImagePrompt(PANEL_SHEET));
  });

  it("heads the prompt section so the table stays the part a human reads", () => {
    expect(renderSheetDocument(PANEL_SHEET)).toContain("## Image prompt");
  });

  it("renders a document without throwing when no exercises were found", () => {
    expect(() => renderSheetDocument(EMPTY_SHEET)).not.toThrow();
  });
});

describe("composeImagePrompt", () => {
  it("names every exercise in the sheet", () => {
    const prompt = composeImagePrompt(PANEL_SHEET);
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(prompt).toContain(exercise.name);
    }
  });

  it("draws both the start and the end position of every exercise", () => {
    const prompt = composeImagePrompt(PANEL_SHEET);
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(prompt).toContain(exercise.startPose);
      expect(prompt).toContain(exercise.endPose);
    }
  });

  it("places a movement arrow between the two positions", () => {
    const prompt = composeImagePrompt(PANEL_SHEET);
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
    const prompt = composeImagePrompt(withArrowNoun);
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
    expect(composeImagePrompt(noDirection)).not.toMatch(/with\s+drawn between/);
  });

  it("opens by naming the artifact and its exercise count", () => {
    expect(composeImagePrompt(PANEL_SHEET)).toMatch(/6-panel .*infographic/i);
  });

  it("includes the video title", () => {
    expect(composeImagePrompt(PANEL_SHEET)).toContain("Daily Mobility Routine");
  });

  it("carries the flat vector style block", () => {
    const prompt = composeImagePrompt(PANEL_SHEET);
    expect(prompt).toMatch(/flat vector/i);
    expect(prompt).toMatch(/white background/i);
  });

  it("restates the exercises verbatim so the labels come back unparaphrased", () => {
    const prompt = composeImagePrompt(PANEL_SHEET);
    const tail = prompt.slice(prompt.indexOf("For your reference"));
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(tail).toContain(exercise.formCue);
    }
  });

  it("labels each panel with the amount when the video stated one", () => {
    const prompt = composeImagePrompt(PANEL_SHEET);
    for (const exercise of everyExercise(PANEL_SHEET)) {
      expect(prompt).toContain(exercise.amount);
    }
  });

  it("switches to an icon grid past the panel limit", () => {
    const prompt = composeImagePrompt(GRID_SHEET);
    expect(prompt).toMatch(/grid/i);
    expect(prompt).toMatch(/2-5 word/i);
    expect(prompt).toMatch(/12 exercises/i);
  });

  it("groups the panels by section when the video used more than one", () => {
    expect(composeImagePrompt(PANEL_SHEET)).toMatch(/Standing/);
    expect(composeImagePrompt(PANEL_SHEET)).toMatch(/Floor/);
  });

  it("skips grouping when every section holds a single exercise", () => {
    const soloSections = {
      title: "Six Movements",
      summary: "",
      sections: PANEL_SHEET.sections
        .flatMap((section) => section.exercises)
        .map((exercise) => ({ name: `The ${exercise.name}`, exercises: [exercise] })),
    };
    expect(composeImagePrompt(soloSections)).not.toMatch(/labelled rows/i);
  });

  it("groups only when a section actually holds more than one exercise", () => {
    expect(composeImagePrompt(PANEL_SHEET)).toMatch(/labelled rows/i);
  });

  it("returns a prompt without throwing when no exercises were found", () => {
    expect(() => composeImagePrompt(EMPTY_SHEET)).not.toThrow();
  });
});
