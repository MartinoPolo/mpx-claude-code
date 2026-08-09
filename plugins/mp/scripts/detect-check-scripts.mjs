#!/usr/bin/env node
// Detect package manager and check scripts from package.json
// Outputs key=value pairs for use by /mp-check-fix skill
// Usage: node $HOME/.claude/scripts/detect-check-scripts.mjs [project_dir] [package_manager]

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const RED = "\x1b[0;31m";
const YELLOW = "\x1b[1;33m";
const CYAN = "\x1b[0;36m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[0;32m";
const NC = "\x1b[0m";

const projectDir = process.argv[2] || ".";
const suppliedPm = process.argv[3];

function readJson(filePath) {
    try {
        return JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
        return null;
    }
}

function detectPackageManager(dir) {
    if (existsSync(path.join(dir, "bun.lockb")) || existsSync(path.join(dir, "bun.lock"))) return "bun";
    if (existsSync(path.join(dir, "yarn.lock"))) return "yarn";
    if (existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(path.join(dir, "package-lock.json")) || existsSync(path.join(dir, "npm-shrinkwrap.json"))) return "npm";
    return "";
}

function hasScript(pkgJsonPath, scriptName) {
    const pkg = readJson(pkgJsonPath);
    return Boolean(pkg && pkg.scripts && pkg.scripts[scriptName]);
}

function findScript(pkgJsonPath, candidates) {
    for (const candidate of candidates) {
        if (hasScript(pkgJsonPath, candidate)) return candidate;
    }
    return "";
}

function isWorkspace(pkgJsonPath) {
    const pkg = readJson(pkgJsonPath);
    return Boolean(pkg && pkg.workspaces);
}

const outputLines = [];
const stderrLines = [];

function scanPackage(pkgJsonPath, pm, prefix) {
    const dir = path.dirname(pkgJsonPath);
    const keyPrefix = prefix ? `${prefix}_` : "";

    const buildScript = findScript(pkgJsonPath, ["build"]);
    if (buildScript) {
        outputLines.push(`${keyPrefix}BUILD=${pm} run ${buildScript}`);
        outputLines.push(`${keyPrefix}BUILD_DIR=${dir}`);
    }

    const checkAllScript = findScript(pkgJsonPath, ["check:all", "check-all"]);
    if (checkAllScript) {
        outputLines.push(`${keyPrefix}CHECK_ALL=${pm} run ${checkAllScript}`);
        outputLines.push(`${keyPrefix}CHECK_ALL_DIR=${dir}`);
    } else {
        const typecheckScript = findScript(pkgJsonPath, ["check", "typecheck", "type-check", "tsc", "check:types"]);
        if (typecheckScript) {
            outputLines.push(`${keyPrefix}TYPECHECK=${pm} run ${typecheckScript}`);
            outputLines.push(`${keyPrefix}TYPECHECK_DIR=${dir}`);
        }

        const lintScript = findScript(pkgJsonPath, ["lint", "eslint", "lint:eslint", "lint:check"]);
        if (lintScript) {
            outputLines.push(`${keyPrefix}LINT=${pm} run ${lintScript}`);
            outputLines.push(`${keyPrefix}LINT_DIR=${dir}`);
        }

        const formatScript = findScript(pkgJsonPath, ["format", "fmt", "format:check", "prettier"]);
        if (formatScript) {
            outputLines.push(`${keyPrefix}FORMAT=${pm} run ${formatScript}`);
            outputLines.push(`${keyPrefix}FORMAT_DIR=${dir}`);
        }
    }

    const testUnitScript = findScript(pkgJsonPath, ["test:unit", "test-unit", "unit-test", "unit:test"]);
    if (testUnitScript) {
        outputLines.push(`${keyPrefix}TEST_UNIT=${pm} run ${testUnitScript}`);
        outputLines.push(`${keyPrefix}TEST_UNIT_DIR=${dir}`);
    } else {
        const testScript = findScript(pkgJsonPath, ["test"]);
        if (testScript) {
            outputLines.push(`${keyPrefix}TEST=${pm} run ${testScript}`);
            outputLines.push(`${keyPrefix}TEST_DIR=${dir}`);
        }
    }

    const testE2eScript = findScript(pkgJsonPath, ["test:e2e", "test-e2e", "e2e", "test:browser", "test:integration"]);
    if (testE2eScript) {
        outputLines.push(`${keyPrefix}TEST_E2E=${pm} run ${testE2eScript}`);
        outputLines.push(`${keyPrefix}TEST_E2E_DIR=${dir}`);
    }
}

const rootPkgJson = path.join(projectDir, "package.json");
if (!existsSync(rootPkgJson)) {
    stderrLines.push(`${RED}No package.json found in ${projectDir}${NC}`);
    outputLines.push("NO_PROJECT=true");
    flush();
    process.exit(0);
}

let pm = detectPackageManager(projectDir);
if (!pm) {
    if (suppliedPm) {
        pm = suppliedPm;
        outputLines.push(`PM=${pm}`);
    } else {
        outputLines.push("PM_UNKNOWN=true");
        stderrLines.push(`${YELLOW}No lock file found. Cannot determine package manager.${NC}`);
        flush();
        process.exit(0);
    }
} else {
    outputLines.push(`PM=${pm}`);
}

stderrLines.push(`${CYAN}${BOLD}Scanning project...${NC}`);

scanPackage(rootPkgJson, pm, "");

if (isWorkspace(rootPkgJson)) {
    outputLines.push("MONOREPO=true");
    stderrLines.push(`${CYAN}Workspace detected, scanning packages...${NC}`);

    for (const workspaceDir of ["packages", "apps"]) {
        const workspacePath = path.join(projectDir, workspaceDir);
        if (!existsSync(workspacePath)) continue;
        const entries = readdirSync(workspacePath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
        for (const entryName of entries) {
            const pkgJsonPath = path.join(workspacePath, entryName, "package.json");
            if (!existsSync(pkgJsonPath)) continue;
            const localDir = path.dirname(pkgJsonPath);
            const prefix = localDir.split(/[\\/]/).filter(Boolean).join("_").replace(/-/g, "_");
            scanPackage(pkgJsonPath, pm, prefix);
        }
    }
}

stderrLines.push(`${GREEN}Detection complete.${NC}`);

function flush() {
    if (outputLines.length > 0) {
        process.stdout.write(outputLines.join("\n") + "\n");
        outputLines.length = 0;
    }
}

flush();
for (const line of stderrLines) {
    process.stderr.write(line + "\n");
}
