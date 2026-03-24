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

  process.exit(0);
}

main().catch(() => process.exit(0));
