#!/usr/bin/env node
/**
 * Reads a YouTube video with the Gemini API and writes the run's single prompt.md.
 * Every decision this file makes is I/O; the composing lives in lib/compose.mjs.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  slugify,
  composeFolderName,
  assertApiKey,
  describeApiError,
  buildExtractionRequest,
  renderPromptDocument,
  countItems,
  resolveMode,
} from "./lib/compose.mjs";

const DEFAULT_MODEL = "gemini-3.6-flash";
const GENERATE_CONTENT_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";
const OEMBED_ENDPOINT = "https://www.youtube.com/oembed";
const OEMBED_TIMEOUT_MS = 10_000;
const SHEETS_FOLDER_NAME = "_VIDEO_SHEETS";
const RAW_TEXT_PREVIEW_LENGTH = 300;
const NETWORK_ATTEMPTS = 3;
const USAGE =
  'Usage: node video-to-sheet.mjs <youtube-url> --mode exercise|generic [--focus "<text>"] [--out <dir>] [--model <id>] [--media-resolution low]';

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

function parseArguments(argumentList) {
  const options = {
    youtubeUrl: "",
    focus: "",
    outputDirectory: "",
    model: DEFAULT_MODEL,
    mediaResolution: "",
    mode: "",
  };

  for (let index = 0; index < argumentList.length; index += 1) {
    const argument = argumentList[index];
    switch (argument) {
      case "--focus":
        index += 1;
        options.focus = argumentList[index] ?? "";
        break;
      case "--out":
        index += 1;
        options.outputDirectory = argumentList[index] ?? "";
        break;
      case "--model":
        index += 1;
        options.model = argumentList[index] ?? DEFAULT_MODEL;
        break;
      case "--media-resolution":
        index += 1;
        options.mediaResolution = argumentList[index] ?? "";
        break;
      case "--mode":
        index += 1;
        options.mode = argumentList[index] ?? "";
        break;
      default:
        if (!options.youtubeUrl) options.youtubeUrl = argument;
    }
  }

  return options;
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The video's own title and channel, from YouTube's oEmbed endpoint — public, keyless, and
 * answered in one request, so it costs the run nothing.
 *
 * Returns null for every failure. The metadata only names the run folder, and a finished
 * extraction is worth far more than the folder it lands in, so a lookup that fails degrades
 * to the slug instead of stopping the run.
 */
async function fetchVideoMetadata(youtubeUrl) {
  try {
    const response = await fetch(
      `${OEMBED_ENDPOINT}?url=${encodeURIComponent(youtubeUrl)}&format=json`,
      { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS) },
    );
    if (!response.ok) return null;
    const body = parseJsonOrNull(await response.text());
    if (!body?.title) return null;
    return { title: body.title, channel: body.author_name ?? "" };
  } catch {
    return null;
  }
}

async function requestSheet({
  geminiApiKey,
  model,
  youtubeUrl,
  focus,
  mediaResolution,
  mode,
}) {
  // Gemini pulls the video itself, so the connection stays open for tens of seconds and
  // drops often enough that a single attempt loses roughly one run in three.
  let response;
  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await fetch(
        `${GENERATE_CONTENT_ENDPOINT}/${model}:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildExtractionRequest(youtubeUrl, focus, { mediaResolution, mode }),
          ),
        },
      );
      break;
    } catch (networkError) {
      if (attempt === NETWORK_ATTEMPTS) {
        exitWithError(
          `Could not reach the Gemini API after ${NETWORK_ATTEMPTS} attempts: ${networkError.message}. ` +
            `Check the network connection and run the command again.`,
        );
      }
      process.stderr.write(
        `Network error reaching Gemini (attempt ${attempt} of ${NETWORK_ATTEMPTS}), retrying: ${networkError.message}\n`,
      );
    }
  }

  const rawBody = await response.text();
  // A gateway can answer with HTML rather than JSON; describeApiError reads either shape.
  const body = parseJsonOrNull(rawBody) ?? rawBody;
  if (!response.ok) exitWithError(describeApiError(response.status, body));
  return body;
}

function readSheetText(responseBody) {
  const parts = responseBody?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function parseSheet(sheetText) {
  const sheet = parseJsonOrNull(sheetText);
  if (sheet) return sheet;
  exitWithError(
    `Gemini answered with text that is not the expected JSON exercise sheet. First ${RAW_TEXT_PREVIEW_LENGTH} characters:\n${sheetText.slice(0, RAW_TEXT_PREVIEW_LENGTH)}`,
  );
}

/**
 * The run folder, `<root>/_VIDEO_SHEETS/[Channel] Video Title/`. There is deliberately no
 * working-directory fallback: a sheet written into whatever repo the user happened to be
 * standing in is lost work, so an unconfigured machine stops here with the variable to set.
 */
function resolveOutputDirectory(requestedDirectory, folderName) {
  if (requestedDirectory) {
    return path.join(path.resolve(requestedDirectory), folderName);
  }

  const aiGeneratedRoot = (process.env.MPX_AI_GENERATED ?? "").trim();
  if (aiGeneratedRoot) {
    return path.join(aiGeneratedRoot, SHEETS_FOLDER_NAME, folderName);
  }

  exitWithError(
    "No output location: set the machine environment variable MPX_AI_GENERATED to the " +
      "AI-generated assets root, or pass --out <dir>.\n" +
      '  setx MPX_AI_GENERATED "<path-to-AI-GENERATED>"\n' +
      "Open a new terminal afterwards so the variable is visible.",
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.youtubeUrl) exitWithError(USAGE);
  try {
    resolveMode(options.mode);
  } catch (error) {
    exitWithError(error.message);
  }

  let geminiApiKey;
  try {
    geminiApiKey = assertApiKey(process.env);
  } catch (error) {
    exitWithError(error.message);
  }

  // Both reach out over the network and neither needs the other's answer, so the cheap
  // metadata lookup hides entirely behind the minute Gemini spends reading the video.
  const [responseBody, videoMetadata] = await Promise.all([
    requestSheet({
      geminiApiKey,
      model: options.model,
      youtubeUrl: options.youtubeUrl,
      focus: options.focus,
      mediaResolution: options.mediaResolution,
      mode: options.mode,
    }),
    fetchVideoMetadata(options.youtubeUrl),
  ]);

  const sheet = parseSheet(readSheetText(responseBody));
  const slug = slugify(sheet.title);
  const folderName = composeFolderName(videoMetadata, slug);
  const outputDirectory = resolveOutputDirectory(
    options.outputDirectory,
    folderName,
  );
  await mkdir(outputDirectory, { recursive: true });

  // One file, pasted whole: every line in it is material the image model should read, so a
  // fixed name keeps the deliverable obvious in a folder that also holds the saved image.
  const promptFile = path.join(outputDirectory, "prompt.md");
  await writeFile(promptFile, renderPromptDocument(sheet, options.mode), "utf8");

  console.log(
    JSON.stringify({
      slug,
      folderName,
      title: sheet.title,
      // Empty when the oEmbed lookup failed, which is also why folderName fell back to slug.
      videoTitle: videoMetadata?.title ?? "",
      channel: videoMetadata?.channel ?? "",
      mode: options.mode,
      itemCount: countItems(sheet, options.mode),
      promptFile,
      promptTokenCount: responseBody?.usageMetadata?.promptTokenCount ?? 0,
    }),
  );
}

main().catch((error) => exitWithError(error.message));
