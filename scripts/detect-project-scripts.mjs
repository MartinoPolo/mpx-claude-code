#!/usr/bin/env node
// Discover runnable scripts from package.json files.
// Default: concise root-only output.
// Optional: --recursive to scan nested packages.
// Optional: --category <name> to filter scripts by category.
// Optional: --json for machine-readable output.
// Categories: frontend, backend, database, build, typecheck, lint, test, other
// Usage: node $HOME/.claude/scripts/detect-project-scripts.mjs [project_dir] [--recursive] [--category <name>] [--json]

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const VALID_CATEGORIES = ["frontend", "backend", "database", "build", "typecheck", "lint", "test", "other"];

function usage() {
    console.log("Usage: node $HOME/.claude/scripts/detect-project-scripts.mjs [project_dir] [--recursive] [--category <name>] [--json]");
    console.log("  --recursive, -r   Scan nested package.json files");
    console.log("  --category, -c    Filter by category");
    console.log("  --json            Output JSON (for automation)");
    console.log(`  Categories: ${VALID_CATEGORIES.join(" ")}`);
    console.log("  --help, -h        Show this help");
}

let projectDir = ".";
let recursive = false;
let jsonMode = false;
let categoryFilter = "";

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--recursive" || arg === "-r") {
        recursive = true;
    } else if (arg === "--json") {
        jsonMode = true;
    } else if (arg === "--category" || arg === "-c") {
        const value = args[i + 1];
        if (value === undefined) {
            console.error(`Missing value for ${arg}`);
            usage();
            process.exit(1);
        }
        categoryFilter = value;
        i++;
    } else if (arg === "--help" || arg === "-h") {
        usage();
        process.exit(0);
    } else if (arg.startsWith("--")) {
        console.error(`Unknown option: ${arg}`);
        usage();
        process.exit(1);
    } else if (projectDir === ".") {
        projectDir = arg;
    } else {
        console.error(`Unexpected argument: ${arg}`);
        usage();
        process.exit(1);
    }
}

if (categoryFilter && !VALID_CATEGORIES.includes(categoryFilter)) {
    console.error(`Invalid category '${categoryFilter}'. Allowed: ${VALID_CATEGORIES.join(" ")}`);
    process.exit(1);
}

const rootDir = path.resolve(projectDir);

if (!existsSync(path.join(rootDir, "package.json"))) {
    if (jsonMode) {
        console.log('{"error":"no-root-package-json","message":"No package.json found at project root."}');
    } else {
        console.log("Error: No package.json found at project root.");
    }
    process.exit(0);
}

function readJson(filePath) {
    try {
        return JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
        return null;
    }
}

function detectPackageManager() {
    if (existsSync(path.join(rootDir, "bun.lockb")) || existsSync(path.join(rootDir, "bun.lock"))) return "bun";
    if (existsSync(path.join(rootDir, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(path.join(rootDir, "yarn.lock"))) return "yarn";
    if (existsSync(path.join(rootDir, "package-lock.json"))) return "npm";
    return "npm";
}

function walkForPackageJsons(startDir, results = []) {
    const ignore = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".cache"]);
    const entries = readdirSync(startDir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(startDir, entry.name);
        if (entry.isDirectory()) {
            if (ignore.has(entry.name)) continue;
            walkForPackageJsons(fullPath, results);
            continue;
        }
        if (entry.isFile() && entry.name === "package.json") {
            results.push(fullPath);
        }
    }
    return results;
}

function inferScriptCategory(scriptName, commandText) {
    const script = scriptName.toLowerCase();
    const command = String(commandText || "").toLowerCase();
    if (/^(dev|start|serve|preview)(:|$)/.test(script) || /vite|next\s+dev|nuxt\s+dev|webpack\s+serve|react-scripts\s+start/.test(command)) return "frontend";
    if (/api|server|backend/.test(script) || /express|fastify|nest\s+start|node\s+.*server|uvicorn|gunicorn/.test(command)) return "backend";
    if (/db|migrate|migration|seed|prisma/.test(script) || /prisma|knex|typeorm|sequelize/.test(command)) return "database";
    if (/test/.test(script)) return "test";
    if (/lint/.test(script)) return "lint";
    if (/type/.test(script) || /tsc/.test(command)) return "typecheck";
    if (/build/.test(script)) return "build";
    return "other";
}

function inferPort(commandText) {
    const text = String(commandText || "");
    const patterns = [/(?:--port|-p)\s+(\d{2,5})/i, /PORT\s*=\s*(\d{2,5})/i, /(?:localhost|127\.0\.0\.1):(\d{2,5})/i];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return Number(match[1]);
    }
    return undefined;
}

function relative(filePath) {
    const rel = path.relative(rootDir, filePath).replace(/\\/g, "/");
    return rel || ".";
}

function createScriptDetails(name, command) {
    const details = {
        name,
        command,
        category: inferScriptCategory(name, command)
    };
    const port = inferPort(command);
    if (port !== undefined) details.port = port;
    return details;
}

const packageManager = detectPackageManager();
const packageJsonPaths = recursive
    ? walkForPackageJsons(rootDir).sort((a, b) => a.localeCompare(b))
    : [path.join(rootDir, "package.json")];

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
        packageName: parsed.name || path.basename(path.dirname(packageJsonPath)) || "root",
        packageManager,
        scripts
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
                category: script.category
            };
            if (script.port !== undefined) base.port = script.port;
            if (script.category === "frontend") frontendCandidates.push(base);
            if (script.category === "backend") backendCandidates.push(base);
            if (script.category === "database") databaseCandidates.push(base);
        }
    }

    const response = {
        packageManager,
        recursive,
        categoryFilter: categoryFilter || null,
        categoryOptions: VALID_CATEGORIES,
        generatedAt: new Date().toISOString(),
        packageCount: packages.length,
        packages,
        frontendCandidates,
        backendCandidates,
        databaseCandidates
    };

    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    process.exit(0);
}

function printPackage(packageDetails) {
    for (const script of packageDetails.scripts) {
        const portText = script.port !== undefined ? ` :${script.port}` : "";
        process.stdout.write(`${packageDetails.packageManager} ${script.name} (${script.command})${portText}\n`);
    }
}

function printPackageCategorized(packageDetails) {
    process.stdout.write(`\n[${packageDetails.packagePath}] ${packageDetails.packageName}\n`);

    for (const category of VALID_CATEGORIES) {
        const scripts = packageDetails.scripts.filter((script) => script.category === category);
        if (scripts.length === 0) continue;
        process.stdout.write(`  ${category}:\n`);
        for (const script of scripts) {
            const portText = script.port !== undefined ? ` :${script.port}` : "";
            process.stdout.write(`    ${packageDetails.packageManager} ${script.name} (${script.command})${portText}\n`);
        }
    }
}

if (packages.length === 0) {
    process.stdout.write("No package scripts found.\n");
    process.exit(0);
}

if (recursive) {
    for (const packageDetails of packages) {
        printPackageCategorized(packageDetails);
    }
    process.stdout.write("\n");
} else {
    printPackage(packages[0]);
}
