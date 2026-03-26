const fs = require("fs");
const path = require("path");

const LOCKFILE_MAP = {
  "bun.lockb": "bun",
  "bun.lock": "bun",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
};

const RUNNER_MAP = {
  bun: "bunx",
  pnpm: "pnpm exec",
  yarn: "yarn exec",
  npm: "npx",
};

function detectPackageManager(dir) {
  for (const [file, pm] of Object.entries(LOCKFILE_MAP)) {
    if (fs.existsSync(path.join(dir, file))) return pm;
  }
  return null;
}

function findPackageManager(startDir) {
  let dir = startDir;
  while (dir && dir !== path.dirname(dir)) {
    const pm = detectPackageManager(dir);
    if (pm) return pm;
    dir = path.dirname(dir);
  }
  return null;
}

function findProjectRoot(startDir, markers = ["package.json"]) {
  let dir = startDir;
  while (dir && dir !== path.dirname(dir)) {
    if (markers.some((m) => fs.existsSync(path.join(dir, m)))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function getRunner(projectRoot) {
  const pm = detectPackageManager(projectRoot);
  return pm ? (RUNNER_MAP[pm] ?? "npx") : "npx";
}

/**
 * Detect the project's toolchain: 'vite-plus' | 'biome' | 'classic'
 * - vite-plus: Vite Plus unified toolchain (oxfmt + oxlint + tsgolint)
 * - biome: Biome formatter + linter
 * - classic: Prettier + ESLint (or manual setup)
 */
function detectToolchain(projectRoot) {
  if (!projectRoot) return "classic";
  const vpBin = path.join(projectRoot, "node_modules", ".bin", "vp");
  // Windows: .bin/vp.cmd or .bin/vp.ps1
  if (
    fs.existsSync(vpBin) ||
    fs.existsSync(vpBin + ".cmd") ||
    fs.existsSync(vpBin + ".ps1")
  ) {
    return "vite-plus";
  }
  if (
    fs.existsSync(path.join(projectRoot, "biome.json")) ||
    fs.existsSync(path.join(projectRoot, "biome.jsonc"))
  ) {
    return "biome";
  }
  return "classic";
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON on stdin"));
      }
    });
    process.stdin.resume();
  });
}

module.exports = {
  LOCKFILE_MAP,
  RUNNER_MAP,
  detectPackageManager,
  detectToolchain,
  findPackageManager,
  findProjectRoot,
  getRunner,
  readStdin,
};
