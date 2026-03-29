/**
 * PreToolUse hook (matcher: Bash)
 * Auto-adds --draft to `gh pr create` commands.
 * Exit 0 = pass through, JSON stdout with updatedInput = transform.
 */

const { readStdin } = require("./shared");

const GH_PR_CREATE_RE = /^(.*\bgh\s+pr\s+create)\b(.*)$/;

/**
 * @param {string} command
 * @returns {{ transformed: true, command: string } | { transformed: false }}
 */
function transformGhCommand(command) {
  if (!command || typeof command !== "string") {
    return { transformed: false };
  }

  const match = command.match(GH_PR_CREATE_RE);
  if (!match) return { transformed: false };

  const afterCreate = match[2];

  // Already has --draft or bare command (no args to add before)
  if (/--draft\b/.test(afterCreate)) {
    return { transformed: false };
  }

  return {
    transformed: true,
    command: `${match[1]} --draft${afterCreate}`,
  };
}

async function main() {
  const input = await readStdin();
  const command = input.tool_input?.command ?? "";
  if (!command) process.exit(0);

  const result = transformGhCommand(command);
  if (!result.transformed) {
    process.exit(0);
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: {
        command: result.command,
      },
    },
  };

  process.stdout.write(JSON.stringify(output) + "\n");
  process.exit(0);
}

module.exports = { transformGhCommand };

if (require.main === module) {
  main().catch(() => process.exit(0));
}
