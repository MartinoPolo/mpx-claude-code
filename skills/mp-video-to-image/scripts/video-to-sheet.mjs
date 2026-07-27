#!/usr/bin/env node
/**
 * Reads a YouTube workout video with the Gemini API and writes an exercise table plus an
 * image prompt. Every decision this file makes is I/O; the composing lives in lib/compose.mjs.
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  slugify,
  assertApiKey,
  describeApiError,
  buildExtractionRequest,
  renderSheetDocument,
  composeImagePrompt,
} from "./lib/compose.mjs";

const DEFAULT_MODEL = "gemini-3.6-flash";
const GENERATE_CONTENT_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";
const CHATGPT_URL = "https://chatgpt.com/";
const OUTPUT_SUBDIRECTORY = path.join("AI GENERATED", "workout sheets");
const RAW_TEXT_PREVIEW_LENGTH = 300;
const NETWORK_ATTEMPTS = 3;
const USAGE =
  'Usage: node video-to-sheet.mjs <youtube-url> [--focus "<text>"] [--out <dir>] [--model <id>] [--media-resolution low] [--no-clipboard]';

const execFileAsync = promisify(execFile);

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
    copyToClipboard: true,
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
      case "--no-clipboard":
        options.copyToClipboard = false;
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

async function requestExerciseSheet({
  geminiApiKey,
  model,
  youtubeUrl,
  focus,
  mediaResolution,
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
            buildExtractionRequest(youtubeUrl, focus, { mediaResolution }),
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

function resolveOutputDirectory(requestedDirectory) {
  if (requestedDirectory) return path.resolve(requestedDirectory);
  const oneDriveRoot = (process.env.MPX_ONEDRIVE ?? "").trim();
  if (oneDriveRoot) return path.join(oneDriveRoot, OUTPUT_SUBDIRECTORY);
  return process.cwd();
}

function countExercises(sheet) {
  return (sheet.sections ?? []).reduce(
    (total, section) => total + (section.exercises ?? []).length,
    0,
  );
}

function runPowerShell(command) {
  return execFileAsync("powershell", ["-NoProfile", "-Command", command]);
}

async function copyPromptAndOpenChatGpt(prompt, slug) {
  // PowerShell reads the prompt off disk rather than taking it as an argument, so no amount
  // of quoting or newlines inside the prompt can corrupt what reaches the clipboard. The
  // scratch copy is deleted straight after, leaving the sheet as the only file produced.
  const scratchFile = path.join(tmpdir(), `${slug}-prompt.txt`);
  await writeFile(scratchFile, prompt, "utf8");
  try {
    await runPowerShell(
      `Get-Content -Raw -LiteralPath '${scratchFile.replaceAll("'", "''")}' | Set-Clipboard`,
    );
    // Opening the tab is the only permitted interaction with chatgpt.com; the paste stays manual.
    await runPowerShell(`Start-Process '${CHATGPT_URL}'`);
  } finally {
    await rm(scratchFile, { force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.youtubeUrl) exitWithError(USAGE);

  let geminiApiKey;
  try {
    geminiApiKey = assertApiKey(process.env);
  } catch (error) {
    exitWithError(error.message);
  }

  const responseBody = await requestExerciseSheet({
    geminiApiKey,
    model: options.model,
    youtubeUrl: options.youtubeUrl,
    focus: options.focus,
    mediaResolution: options.mediaResolution,
  });

  const sheet = parseSheet(readSheetText(responseBody));
  const slug = slugify(sheet.title);
  const outputDirectory = resolveOutputDirectory(options.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });

  const sheetFile = path.join(outputDirectory, `${slug}.md`);
  await writeFile(sheetFile, renderSheetDocument(sheet), "utf8");

  let clipboard = false;
  if (options.copyToClipboard) {
    try {
      await copyPromptAndOpenChatGpt(composeImagePrompt(sheet), slug);
      clipboard = true;
    } catch (error) {
      // The sheet on disk is the deliverable, so a clipboard failure stays a warning.
      console.error(
        `Could not copy the prompt to the clipboard: ${error.message}\nCopy it by hand from the image prompt section of ${sheetFile}`,
      );
    }
  }

  console.log(
    JSON.stringify({
      slug,
      title: sheet.title,
      exerciseCount: countExercises(sheet),
      sheetFile,
      clipboard,
      promptTokenCount: responseBody?.usageMetadata?.promptTokenCount ?? 0,
    }),
  );
}

main().catch((error) => exitWithError(error.message));
