#!/bin/bash
# Discover runnable scripts from package.json files.
# Default: concise root-only output.
# Optional: --recursive to scan nested packages.
# Optional: --category <name> to filter scripts by category.
# Optional: --json for machine-readable output.
# Categories: frontend, backend, database, build, typecheck, lint, test, other
# Usage: bash $HOME/.claude/skills/mp-gh-issue-execute/scripts/detect-project-scripts.sh [project_dir] [--recursive] [--category <name>] [--json]

set -euo pipefail

PROJECT_DIR="."
RECURSIVE="false"
JSON_MODE="false"
CATEGORY_FILTER=""
VALID_CATEGORIES="frontend backend database build typecheck lint test other"

usage() {
  echo "Usage: bash $HOME/.claude/skills/mp-gh-issue-execute/scripts/detect-project-scripts.sh [project_dir] [--recursive] [--category <name>] [--json]"
  echo "  --recursive, -r   Scan nested package.json files"
  echo "  --category, -c    Filter by category"
  echo "  --json            Output JSON (for automation)"
  echo "  Categories: $VALID_CATEGORIES"
  echo "  --help, -h        Show this help"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --recursive|-r)
      RECURSIVE="true"
      shift
      ;;
    --json)
      JSON_MODE="true"
      shift
      ;;
    --category|-c)
      if [ -z "${2:-}" ]; then
        echo "Missing value for $1" >&2
        usage >&2
        exit 1
      fi
      CATEGORY_FILTER="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [ "$PROJECT_DIR" = "." ]; then
        PROJECT_DIR="$1"
      else
        echo "Unexpected argument: $1" >&2
        usage >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -n "$CATEGORY_FILTER" ]; then
  case " $VALID_CATEGORIES " in
    *" $CATEGORY_FILTER "*) ;;
    *)
      echo "Invalid category '$CATEGORY_FILTER'. Allowed: $VALID_CATEGORIES" >&2
      exit 1
      ;;
  esac
fi

cd "$PROJECT_DIR"

if ! command -v node >/dev/null 2>&1; then
  if [ "$JSON_MODE" = "true" ]; then
    echo '{"error":"node-not-found","message":"Node.js is required to inspect package.json scripts."}'
  else
    echo "Error: Node.js is required to inspect package.json scripts."
  fi
  exit 0
fi

if [ ! -f "package.json" ]; then
  if [ "$JSON_MODE" = "true" ]; then
    echo '{"error":"no-root-package-json","message":"No package.json found at project root."}'
  else
    echo "Error: No package.json found at project root."
  fi
  exit 0
fi

DETECT_RECURSIVE="$RECURSIVE" DETECT_JSON="$JSON_MODE" DETECT_CATEGORY="$CATEGORY_FILTER" node <<'NODE'
const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const recursive = process.env.DETECT_RECURSIVE === 'true';
const jsonMode = process.env.DETECT_JSON === 'true';
const categoryFilter = process.env.DETECT_CATEGORY || '';
const categoryOptions = ['frontend', 'backend', 'database', 'build', 'typecheck', 'lint', 'test', 'other'];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function detectPackageManager() {
  if (fs.existsSync(path.join(rootDir, 'bun.lockb')) || fs.existsSync(path.join(rootDir, 'bun.lock'))) return 'bun';
  if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) return 'npm';
  return 'npm';
}

function walkForPackageJsons(startDir, results = []) {
  const ignore = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turbo', '.cache']);
  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      if (ignore.has(entry.name)) continue;
      walkForPackageJsons(fullPath, results);
      continue;
    }
    if (entry.isFile() && entry.name === 'package.json') {
      results.push(fullPath);
    }
  }
  return results;
}

function inferScriptCategory(scriptName, commandText) {
  const script = scriptName.toLowerCase();
  const command = String(commandText || '').toLowerCase();
  if (/^(dev|start|serve|preview)(:|$)/.test(script) || /vite|next\s+dev|nuxt\s+dev|webpack\s+serve|react-scripts\s+start/.test(command)) return 'frontend';
  if (/api|server|backend/.test(script) || /express|fastify|nest\s+start|node\s+.*server|uvicorn|gunicorn/.test(command)) return 'backend';
  if (/db|migrate|migration|seed|prisma/.test(script) || /prisma|knex|typeorm|sequelize/.test(command)) return 'database';
  if (/test/.test(script)) return 'test';
  if (/lint/.test(script)) return 'lint';
  if (/type/.test(script) || /tsc/.test(command)) return 'typecheck';
  if (/build/.test(script)) return 'build';
  return 'other';
}

function inferPort(commandText) {
  const text = String(commandText || '');
  const patterns = [
    /(?:--port|-p)\s+(\d{2,5})/i,
    /PORT\s*=\s*(\d{2,5})/i,
    /(?:localhost|127\.0\.0\.1):(\d{2,5})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function relative(filePath) {
  const rel = path.relative(rootDir, filePath).replace(/\\/g, '/');
  return rel || '.';
}

function createScriptDetails(name, command) {
  const details = {
    name,
    command,
    category: inferScriptCategory(name, command),
  };
  const port = inferPort(command);
  if (port !== undefined) details.port = port;
  return details;
}

const packageManager = detectPackageManager();
const packageJsonPaths = recursive
  ? walkForPackageJsons(rootDir).sort((a, b) => a.localeCompare(b))
  : [path.join(rootDir, 'package.json')];

const packages = [];
for (const packageJsonPath of packageJsonPaths) {
  const parsed = readJson(packageJsonPath);
  if (!parsed) continue;

  const scriptsObject = parsed.scripts || {};
  const scripts = Object.entries(scriptsObject)
    .map(([name, command]) => createScriptDetails(name, command))
    .filter((script) => !categoryFilter || script.category === categoryFilter);
  packages.push({
    packagePath: relative(path.dirname(packageJsonPath)),
    packageName: parsed.name || path.basename(path.dirname(packageJsonPath)) || 'root',
    packageManager,
    scripts,
  });
}

if (jsonMode) {
  const frontendCandidates = [];
  const backendCandidates = [];
  const databaseCandidates = [];

  for (const packageDetails of packages) {
    for (const script of packageDetails.scripts) {
      const base = {
        packagePath: packageDetails.packagePath,
        packageName: packageDetails.packageName,
        name: script.name,
        command: script.command,
        category: script.category,
      };
      if (script.port !== undefined) base.port = script.port;
      if (script.category === 'frontend') frontendCandidates.push(base);
      if (script.category === 'backend') backendCandidates.push(base);
      if (script.category === 'database') databaseCandidates.push(base);
    }
  }

  const response = {
    packageManager,
    recursive,
    categoryFilter: categoryFilter || null,
    categoryOptions,
    generatedAt: new Date().toISOString(),
    packageCount: packages.length,
    packages,
    frontendCandidates,
    backendCandidates,
    databaseCandidates,
  };

  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  process.exit(0);
}

function printPackage(packageDetails, showHeader) {
  if (showHeader) {
    process.stdout.write(`\n[${packageDetails.packagePath}] ${packageDetails.packageName}\n`);
  }
  for (const script of packageDetails.scripts) {
    const portText = script.port !== undefined ? ` :${script.port}` : '';
    process.stdout.write(`${packageDetails.packageManager} ${script.name} (${script.command})${portText}\n`);
  }
}

function printPackageCategorized(packageDetails) {
  process.stdout.write(`\n[${packageDetails.packagePath}] ${packageDetails.packageName}\n`);
  const categoryOrder = categoryOptions;

  for (const category of categoryOrder) {
    const scripts = packageDetails.scripts.filter((script) => script.category === category);
    if (scripts.length === 0) continue;
    process.stdout.write(`  ${category}:\n`);
    for (const script of scripts) {
      const portText = script.port !== undefined ? ` :${script.port}` : '';
      process.stdout.write(`    ${packageDetails.packageManager} ${script.name} (${script.command})${portText}\n`);
    }
  }
}

if (packages.length === 0) {
  process.stdout.write('No package scripts found.\n');
  process.exit(0);
}

if (recursive) {
  for (const packageDetails of packages) {
    printPackageCategorized(packageDetails);
  }
  process.stdout.write('\n');
} else {
  printPackage(packages[0], false);
}
NODE
