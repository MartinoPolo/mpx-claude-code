/**
 * PreCompact hook (matcher: *)
 * Feeds instructions/COMPACT.md into the compaction prompt.
 *
 * Claude Code builds that prompt from a fixed template and appends exactly one
 * user-controlled block, "Additional Instructions". Only `/compact <args>` and
 * PreCompact hook stdout reach it — CLAUDE.md / AGENTS.md do not, which is why the
 * instructions live in a dedicated file injected here instead of sitting in
 * AGENTS.md where they would cost context every turn without ever reaching the
 * summarizer. pi consumes the same file through
 * mpx-pi/extensions/compact-instructions.ts.
 *
 * A non-zero exit BLOCKS compaction ("Compaction blocked by PreCompact hook"), so
 * every failure path here stays silent and exits 0.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// hooks/ is reached through a symlink at ~/.claude/hooks and Node resolves realpath
// by default, so __dirname lands inside the repo checkout.
const SOURCE_PATHS = [
  path.join(__dirname, "..", "instructions", "COMPACT.md"),
  path.join(os.homedir(), ".claude", "COMPACT.md"),
];

/**
 * Read the first source file that exists and is non-empty.
 * @param {string[]} [sourcePaths] - Candidate files, highest priority first
 * @returns {string} File contents, trimmed; empty string when nothing is available
 */
export function readCompactInstructions(sourcePaths = SOURCE_PATHS) {
  for (const sourcePath of sourcePaths) {
    try {
      const contents = fs.readFileSync(sourcePath, "utf8").trim();
      if (contents) return contents;
    } catch {
      // Missing or unreadable candidate — fall through to the next one.
    }
  }
  return "";
}

function main() {
  // The hook payload is irrelevant here — drain it so the writer never blocks,
  // but never parse it: an empty or malformed payload must not suppress output.
  process.stdin.resume();
  process.stdin.on("data", () => {});
  process.stdin.on("error", () => {});

  // argv override exists only for the test suite; Claude Code passes no arguments.
  const sourcePaths = process.argv[2] ? [process.argv[2]] : SOURCE_PATHS;

  const instructions = readCompactInstructions(sourcePaths);
  if (instructions) process.stdout.write(instructions + "\n");
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch {
    process.exit(0);
  }
}
