/**
 * PreToolUse hook (matcher: Bash)
 * Intercepts git commit commands and runs typecheck before allowing.
 * Exit 0 = allow, Exit 2 = block (typecheck failed)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { readStdin, findProjectRoot, detectPackageManager } = require("./shared");

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

function findTypecheckScript(projectRoot) {
  const packageJsonPath = path.join(projectRoot, "package.json");
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
  const typecheckScript = findTypecheckScript(projectRoot);
  if (!typecheckScript) process.exit(0);

  process.stderr.write(
    `Running typecheck (${pm} run ${typecheckScript}) before commit...\n`
  );

  try {
    execSync(`${pm} run ${typecheckScript}`, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    });
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      "Typecheck failed. Fix type errors before committing:\n\n"
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
