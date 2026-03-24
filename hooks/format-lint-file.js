/**
 * PostToolUse hook (matcher: Edit|Write)
 * Auto-formats and lints the edited file using detected tools.
 * Format: silent auto-fix. Lint: reports errors to stdout for Claude.
 * Always exits 0.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { readStdin, getRunner, findProjectRoot } = require("./shared");

const PRETTIER_CONFIGS = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.yml",
  ".prettierrc.yaml",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
];

const ESLINT_CONFIGS = [
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
  ".eslintrc.js",
  ".eslintrc.cjs",
  "eslint.config.js",
  "eslint.config.cjs",
  "eslint.config.mjs",
  "eslint.config.ts",
];

const JS_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "svelte", "vue",
]);
const PRETTIER_ONLY_EXTENSIONS = new Set([
  "css", "scss", "less", "html", "md", "yaml", "yml",
]);

function hasConfig(dir, configs) {
  return configs.some((cfg) => fs.existsSync(path.join(dir, cfg)));
}

function hasBiome(dir) {
  return (
    fs.existsSync(path.join(dir, "biome.json")) ||
    fs.existsSync(path.join(dir, "biome.jsonc"))
  );
}

function run(cmd, cwd, silent = false) {
  try {
    execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: 15000 });
  } catch (err) {
    if (!silent) {
      const output = (
        err.stdout?.toString() ||
        err.stderr?.toString() ||
        ""
      ).trim();
      if (output) process.stdout.write(output + "\n");
    }
  }
}

function handleJavaScriptTypeScript(filePath, projectRoot, runner) {
  if (hasBiome(projectRoot)) {
    run(`${runner} biome format --write "${filePath}"`, projectRoot, true);
    run(`${runner} biome lint --fix "${filePath}"`, projectRoot);
  } else {
    if (hasConfig(projectRoot, PRETTIER_CONFIGS)) {
      run(`${runner} prettier --write "${filePath}"`, projectRoot, true);
    }
    if (hasConfig(projectRoot, ESLINT_CONFIGS)) {
      run(`${runner} eslint --fix "${filePath}"`, projectRoot);
    }
  }
}

function handlePython(filePath, projectRoot) {
  let hasRuff =
    fs.existsSync(path.join(projectRoot, "ruff.toml")) ||
    fs.existsSync(path.join(projectRoot, ".ruff.toml"));

  if (!hasRuff) {
    try {
      const pyproject = fs.readFileSync(
        path.join(projectRoot, "pyproject.toml"),
        "utf8"
      );
      hasRuff = pyproject.includes("[tool.ruff");
    } catch {
      /* no pyproject.toml */
    }
  }

  if (hasRuff) {
    run(`ruff format "${filePath}"`, projectRoot, true);
    run(`ruff check --fix "${filePath}"`, projectRoot);
  }
}

async function main() {
  const input = await readStdin();
  const filePath = input.tool_input?.file_path;
  if (!filePath || !fs.existsSync(filePath)) process.exit(0);

  const projectRoot = findProjectRoot(path.dirname(filePath), [
    "package.json",
    "pyproject.toml",
  ]);
  if (!projectRoot) process.exit(0);

  const ext = path.extname(filePath).slice(1);
  const runner = getRunner(projectRoot);

  if (JS_EXTENSIONS.has(ext)) {
    handleJavaScriptTypeScript(filePath, projectRoot, runner);
  } else if (ext === "py") {
    handlePython(filePath, projectRoot);
  } else if (ext === "json" || ext === "jsonc") {
    if (hasBiome(projectRoot)) {
      run(`${runner} biome format --write "${filePath}"`, projectRoot, true);
    } else if (hasConfig(projectRoot, PRETTIER_CONFIGS)) {
      run(`${runner} prettier --write "${filePath}"`, projectRoot, true);
    }
  } else if (PRETTIER_ONLY_EXTENSIONS.has(ext)) {
    if (hasConfig(projectRoot, PRETTIER_CONFIGS)) {
      run(`${runner} prettier --write "${filePath}"`, projectRoot, true);
    }
    if (ext === "css" && hasBiome(projectRoot)) {
      run(`${runner} biome format --write "${filePath}"`, projectRoot, true);
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
