/**
 * SessionStart hook (matcher: compact)
 * Re-injects key project context after context compaction.
 * Output goes to stdout and is added to Claude's context.
 */

const fs = require("fs");
const path = require("path");
const { readStdin, findPackageManager, detectToolchain } = require("./shared");

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
  }

  const toolchain = detectToolchain(dir);
  if (toolchain === "vite-plus") {
    lines.push("Toolchain: Vite Plus. Use 'vp check' (format+lint+typecheck), 'vp fmt', 'vp lint', 'vp test'.");
    lines.push("Run 'check:all' script before committing (vp check + eslint + stylelint + knip).");
  } else if (toolchain === "biome") {
    lines.push("Formatter/Linter: Biome.");
    if (pm) lines.push(`Run '${pm} run typecheck' before committing.`);
  } else {
    if (pm) lines.push(`Run '${pm} run typecheck' before committing.`);
  }

  if (
    fs.existsSync(path.join(dir, "svelte.config.js")) ||
    fs.existsSync(path.join(dir, "svelte.config.ts"))
  ) {
    lines.push(
      "Framework: Svelte/SvelteKit. Use svelte-check for Svelte diagnostics."
    );
    if (toolchain !== "vite-plus") {
      lines.push("Use svelte-check for type checking.");
    }
  } else if (
    fs.existsSync(path.join(dir, "next.config.js")) ||
    fs.existsSync(path.join(dir, "next.config.mjs")) ||
    fs.existsSync(path.join(dir, "next.config.ts"))
  ) {
    lines.push("Framework: Next.js.");
  }

  if (fs.existsSync(path.join(dir, "pyproject.toml"))) {
    lines.push(
      "Python project detected. Use ruff for formatting/linting if configured."
    );
  }

  // Convention reminders (survive compaction so Claude doesn't waste turns)
  lines.push("");
  lines.push("Git workflow: conventional commits (type(scope): desc), PRs auto-created as draft (hook).");
  lines.push("Utility scripts: detect-base-branch.js, extract-branch-issue.js, detect-check-scripts.sh");
  lines.push("Code quality: auto-format on save (hook). Fix types/lint properly — avoid suppressions.");
  lines.push("Safety: dangerous commands blocked by hook (rm -rf broad paths, DROP TABLE, force-push main, etc.).");
  lines.push("Tool preference: Grep > bash grep, Read > cat, Glob > find.");

  if (lines.length) process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
}

main().catch(() => process.exit(0));
