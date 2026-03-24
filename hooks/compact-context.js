/**
 * SessionStart hook (matcher: compact)
 * Re-injects key project context after context compaction.
 * Output goes to stdout and is added to Claude's context.
 */

const fs = require("fs");
const path = require("path");
const { readStdin, findPackageManager } = require("./shared");

async function main() {
  const input = await readStdin();
  const dir = input.cwd ?? process.cwd();
  const lines = [];

  const pm = findPackageManager(dir);
  if (pm) {
    lines.push(
      `This project uses ${pm}. Use '${pm}' for all package commands.`
    );
    lines.push(
      `Do NOT use npm/npx/yarn/bun unless '${pm}' is that tool.`
    );
    lines.push(`Run '${pm} run typecheck' before committing.`);
  }

  if (
    fs.existsSync(path.join(dir, "svelte.config.js")) ||
    fs.existsSync(path.join(dir, "svelte.config.ts"))
  ) {
    lines.push(
      "Framework: Svelte/SvelteKit. Use svelte-check for type checking."
    );
  } else if (
    fs.existsSync(path.join(dir, "next.config.js")) ||
    fs.existsSync(path.join(dir, "next.config.mjs")) ||
    fs.existsSync(path.join(dir, "next.config.ts"))
  ) {
    lines.push("Framework: Next.js.");
  }

  if (
    fs.existsSync(path.join(dir, "biome.json")) ||
    fs.existsSync(path.join(dir, "biome.jsonc"))
  ) {
    lines.push("Formatter/Linter: Biome.");
  }

  if (fs.existsSync(path.join(dir, "pyproject.toml"))) {
    lines.push(
      "Python project detected. Use ruff for formatting/linting if configured."
    );
  }

  if (lines.length) process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
}

main().catch(() => process.exit(0));
