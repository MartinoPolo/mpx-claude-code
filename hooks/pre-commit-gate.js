/**
 * PreToolUse hook (matcher: Bash)
 * Intercepts git commit commands and runs checks before allowing.
 * Vite Plus projects: runs check:all (format + lint + typecheck + more)
 * Classic projects: falls back to typecheck script detection
 * Also scans staged diffs for secrets (hard block) and validates
 * conventional commit format (warning only).
 * Exit 0 = allow, Exit 2 = block (checks failed or secret detected)
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

const SECRET_PATTERNS = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub PAT", pattern: /ghp_[a-zA-Z0-9]{36}/ },
  { name: "GitHub OAuth", pattern: /gho_[a-zA-Z0-9]{36}/ },
  { name: "Private Key", pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----/ },
  { name: "Slack Token", pattern: /xox[bpors]-[a-zA-Z0-9-]+/ },
  { name: "Generic Secret", pattern: /(?:password|secret|api_key|apikey|auth_token)\s*[:=]\s*["']?[^"'\s]{8,}["']?/i },
];

const SKIP_SECRET_SCAN_PATTERNS = [
  /\.lock$/, /lock\.json$/, /lock\.yaml$/, /\.lockb$/,  // lockfiles
  /\.env\.example$/, /\.env\.sample$/, /\.env\.template$/,  // placeholder files
  /\.(test|spec)\.[jt]sx?$/,  // test files may contain test tokens
];

const CONVENTIONAL_FORMAT = /^(feat|fix|refactor|chore|docs|style|test|perf|ci|build|revert)(\(.+\))?: .+/;

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

/**
 * Scan diff content for secret patterns.
 * Only checks added lines (lines starting with +).
 * Returns array of { name, file } for each detected secret.
 */
function scanForSecrets(diffContent, filename) {
  const findings = [];
  const addedLines = diffContent
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"));

  for (const line of addedLines) {
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ name, file: filename });
        break; // one finding per line is enough
      }
    }
  }
  return findings;
}

/**
 * Extract commit message from a git commit command string.
 * Supports -m "..." / -m '...' / $'...' and heredoc <<'EOF' formats.
 * Matches based on the opening quote character to handle apostrophes
 * inside double quotes and double quotes inside single quotes.
 */
function extractCommitMessage(command) {
  // Try $(cat <<'EOF'...) pattern first (used in skills)
  const catHeredocMatch = command.match(/\$\(cat\s+<<-?['"]?EOF['"]?\s*\n([\s\S]*?)\nEOF/);
  if (catHeredocMatch) return catHeredocMatch[1].split("\n")[0].trim();

  // Try heredoc format: <<'EOF'\n...\nEOF
  const heredocMatch = command.match(/<<-?['"]?EOF['"]?\s*\n([\s\S]*?)\nEOF/);
  if (heredocMatch) return heredocMatch[1].split("\n")[0].trim();

  // Try -m with double quotes (handles apostrophes inside)
  const doubleQuoteMatch = command.match(/-m\s+"([^"]+)"/);
  if (doubleQuoteMatch) return doubleQuoteMatch[1];

  // Try -m with single quotes (handles double quotes inside)
  const singleQuoteMatch = command.match(/-m\s+'([^']+)'/);
  if (singleQuoteMatch) return singleQuoteMatch[1];

  // Try -m with $'...' (bash ANSI-C quoting)
  const dollarQuoteMatch = command.match(/-m\s+\$'([^']+)'/);
  if (dollarQuoteMatch) return dollarQuoteMatch[1];

  return null;
}

/**
 * Validate commit message against conventional format.
 * Returns { valid, warnings } — never blocks, only warns.
 */
function validateCommitFormat(message) {
  const warnings = [];
  const firstLine = message.split("\n")[0];

  const valid = CONVENTIONAL_FORMAT.test(firstLine);
  if (!valid) {
    warnings.push(
      "Warning: commit message doesn't match conventional format: type(scope): description"
    );
  }

  if (firstLine.length > 72) {
    warnings.push(
      `Warning: commit message first line is ${firstLine.length} chars (recommended max 72)`
    );
  }

  return { valid, warnings };
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

  // --- Secret scanning (hard block) ---
  try {
    const stagedFiles = execSync("git diff --cached --name-only", {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: 10000,
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    const filesToScan = stagedFiles.filter(
      (f) => !SKIP_SECRET_SCAN_PATTERNS.some((p) => p.test(f))
    );

    const allFindings = [];
    for (const file of filesToScan) {
      try {
        const diff = execSync(`git diff --cached -- "${file}"`, {
          cwd: projectRoot,
          encoding: "utf8",
          timeout: 10000,
        });
        const findings = scanForSecrets(diff, file);
        allFindings.push(...findings);
      } catch {
        // skip files that fail to diff (binary, etc.)
      }
    }

    if (allFindings.length > 0) {
      for (const { name, file } of allFindings) {
        process.stderr.write(
          `Secret detected: ${name} in ${file}. Remove it before committing.\n`
        );
      }
      process.exit(2);
    }
  } catch {
    // If git diff fails entirely, skip secret scanning (don't block)
  }

  // --- Typecheck / lint checks ---
  const pm = detectPackageManager(projectRoot) ?? "npm";
  const toolchain = detectToolchain(projectRoot);
  const checkScript = findCheckScript(projectRoot, toolchain);
  if (!checkScript) {
    // No check script — skip to commit format validation
    validateAndWarn(command);
    process.exit(0);
  }

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

  // --- Commit format validation (warning only) ---
  validateAndWarn(command);
  process.exit(0);
}

function validateAndWarn(command) {
  const message = extractCommitMessage(command);
  if (message) {
    const { warnings } = validateCommitFormat(message);
    for (const warning of warnings) {
      process.stderr.write(warning + "\n");
    }
  }
}

if (require.main === module) {
  main().catch(() => process.exit(0));
}

module.exports = { scanForSecrets, validateCommitFormat, extractCommitMessage };
