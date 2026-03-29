/**
 * PreToolUse hook (matcher: Bash)
 * Blocks wrong package manager commands and redirects npx tsc.
 * Exit 0 = allow, Exit 2 = block (stderr fed back to Claude)
 */

const { readStdin, findPackageManager } = require("./shared");

async function main() {
  const input = await readStdin();
  const command = input.tool_input?.command ?? "";
  const cwd = input.cwd ?? process.cwd();
  if (!command) process.exit(0);

  const pm = findPackageManager(cwd);
  if (!pm) process.exit(0);

  const firstCmd = command.split("\n")[0].trim().split(/\s+/)[0];
  const allPackageManagers = ["npm", "pnpm", "yarn", "bun"];
  const wrongPackageManagers = allPackageManagers.filter((p) => p !== pm);

  if (wrongPackageManagers.includes(firstCmd)) {
    process.stderr.write(
      `This project uses ${pm} (detected from lockfile). Use '${pm}' instead of '${firstCmd}'.\n`
    );
    process.exit(2);
  }

  // bun uses bunx instead of npx
  if (pm === "bun" && /(?:^|\s)npx\s/.test(command)) {
    process.stderr.write(
      "This project uses bun. Use 'bunx' instead of 'npx'.\n"
    );
    process.exit(2);
  }

  // Block npx tsc → redirect to PM typecheck
  if (/(?:^|\s)npx\s+tsc(?:\s|$)/.test(command)) {
    process.stderr.write(
      `Don't use 'npx tsc' directly. Use '${pm} run typecheck' (or the project's check script) instead.\n`
    );
    process.exit(2);
  }

  // Tool redirect warnings (soft — exit 0 + stderr)
  warnToolRedirects(command);

  process.exit(0);
}

/**
 * Warn when standalone grep/cat/find used instead of built-in tools.
 * Only warns for standalone usage (first command or after && / ;), not pipelines.
 */
function warnToolRedirects(command) {
  const checks = getToolRedirectWarnings(command);
  for (const warning of checks) {
    process.stderr.write(warning + "\n");
  }
}

function getToolRedirectWarnings(command) {
  const warnings = [];
  // Match commands at start of line or after && / ; but NOT after |
  // Split on pipes first, only check the first segment for "starts with" patterns
  const segments = command.split(/\s*\|\s*/);
  const firstSegment = segments[0].trim();

  // Only warn if the tool-like command is the primary command (not in a pipeline)
  if (/^(grep|rg)\s/.test(firstSegment) || /(?:&&|;)\s*(grep|rg)\s/.test(firstSegment)) {
    warnings.push("Consider using the Grep tool instead of bash grep/rg for code search.");
  }
  if (/^(cat|head|tail)\s/.test(firstSegment) || /(?:&&|;)\s*(cat|head|tail)\s/.test(firstSegment)) {
    warnings.push("Consider using the Read tool instead of cat/head/tail for reading files.");
  }
  if (/^find\s/.test(firstSegment) || /(?:&&|;)\s*find\s/.test(firstSegment)) {
    warnings.push("Consider using the Glob tool instead of bash find for file search.");
  }
  return warnings;
}

module.exports = { getToolRedirectWarnings };

main().catch(() => process.exit(0));
