/**
 * PreCompact hook (matcher: *)
 * Feeds the "## Compact instructions" section of instructions/AGENTS.md into the
 * compaction prompt.
 *
 * Claude Code builds that prompt from a fixed template and appends exactly one
 * user-controlled block, "Additional Instructions". Only `/compact <args>` and
 * PreCompact hook stdout reach it — CLAUDE.md / AGENTS.md do not, so without this
 * hook the section is honoured only when it happens to survive in context.
 *
 * A non-zero exit BLOCKS compaction ("Compaction blocked by PreCompact hook"), so
 * every failure path here stays silent and exits 0.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const HEADING = "## Compact instructions";

// hooks/ is reached through a symlink at ~/.claude/hooks and Node resolves realpath
// by default, so __dirname lands inside the repo checkout.
const SOURCE_PATHS = [
  path.join(__dirname, "..", "instructions", "AGENTS.md"),
  path.join(os.homedir(), ".claude", "AGENTS.md"),
];

/**
 * Extract the body of the "## Compact instructions" section.
 * @param {string} markdown - Full file contents
 * @returns {string} Section body, trimmed; empty string when the heading is absent
 */
function extractCompactInstructions(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === HEADING);
  if (start === -1) return "";

  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

/**
 * Read the first readable source file and extract its compact instructions.
 * @param {string[]} [sourcePaths] - Candidate files, highest priority first
 * @returns {string} Section body, or empty string when nothing is available
 */
function readCompactInstructions(sourcePaths = SOURCE_PATHS) {
  for (const sourcePath of sourcePaths) {
    try {
      return extractCompactInstructions(fs.readFileSync(sourcePath, "utf8"));
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

module.exports = { extractCompactInstructions, readCompactInstructions };
if (require.main === module) {
  try {
    main();
  } catch {
    process.exit(0);
  }
}
