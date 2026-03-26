/**
 * PreToolUse hook (matcher: Bash)
 * Intercepts git commit commands and runs checks before allowing.
 * Vite Plus projects: runs check:all (format + lint + typecheck + more)
 * Classic projects: falls back to typecheck script detection
 * Exit 0 = allow, Exit 2 = block (checks failed)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
  readStdin,
  findProjectRoot,
  detectPackageManager,
  detectToolchain,
} = require("./shared");

const CHECK_ALL_SCRIPTS = ["check:all", "check-all"];
const TYPECHECK_SCRIPTS = [
  "typecheck", "type-check", "check", "check:types", "tsc",
];
const SVELTE_TYPECHECK_SCRIPTS = ["check", "typecheck", "type-check"];

function hasScript(packageJsonPath, scriptName) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return !!(pkg.scripts && pkg.scripts[scriptName]);
  } catch {
    return false;
  }
}

function findCheckScript(projectRoot, toolchain) {
  const packageJsonPath = path.join(projectRoot, "package.json");

  // Vite Plus: prefer check:all which runs vp check + eslint + stylelint + knip
  if (toolchain === "vite-plus") {
    for (const name of CHECK_ALL_SCRIPTS) {
      if (hasScript(packageJsonPath, name)) return name;
    }
  }

  // Fallback: detect typecheck script
  const isSvelte =
    fs.existsSync(path.join(projectRoot, "svelte.config.js")) ||
    fs.existsSync(path.join(projectRoot, "svelte.config.ts"));

  const candidates = isSvelte ? SVELTE_TYPECHECK_SCRIPTS : TYPECHECK_SCRIPTS;
  for (const name of candidates) {
    if (hasScript(packageJsonPath, name)) return name;
  }
  return null;
}

async function main() {
  const input = await readStdin();
  const command = input.tool_input?.command ?? "";
  const cwd = input.cwd ?? process.cwd();
  if (!command) process.exit(0);

  // Only intercept git commit commands
  if (!/(?:^|\s|&&|\|)git\s+commit(?:\s|$)/.test(command)) process.exit(0);

  const projectRoot = findProjectRoot(cwd, ["package.json"]);
  if (!projectRoot) process.exit(0);

  const pm = detectPackageManager(projectRoot) ?? "npm";
  const toolchain = detectToolchain(projectRoot);
  const checkScript = findCheckScript(projectRoot, toolchain);
  if (!checkScript) process.exit(0);

  const label = toolchain === "vite-plus" ? "checks" : "typecheck";
  process.stderr.write(
    `Running ${label} (${pm} run ${checkScript}) before commit...\n`
  );

  try {
    execSync(`${pm} run ${checkScript}`, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      `Pre-commit ${label} failed. Fix errors before committing:\n\n`
    );
    const output = (
      err.stdout?.toString() ||
      err.stderr?.toString() ||
      ""
    ).trim();
    const lines = output.split("\n");
    process.stderr.write(lines.slice(-50).join("\n") + "\n");
    process.exit(2);
  }
}

main().catch(() => process.exit(0));
