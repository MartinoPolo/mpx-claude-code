/**
 * Deterministic base-branch detector.
 * Usage: node detect-base-branch.js [explicit-branch]
 *
 * Returns a single branch name to stdout.
 * Priority order: dev > develop > main > master
 * Fallback: "main"
 */

const { execSync: defaultExecSync } = require("child_process");

const CANDIDATE_BRANCHES = ["dev", "develop", "main", "master"];

/**
 * Run a git command, return trimmed stdout or null on failure.
 */
function gitExec(command, exec) {
  try {
    return exec(command, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

/**
 * Check whether origin/<branch> exists on the remote.
 */
function remoteBranchExists(branch, exec) {
  return gitExec(`git rev-parse --verify origin/${branch}`, exec) !== null;
}

/**
 * Count how many commits HEAD is ahead of the merge-base with origin/<branch>.
 * Returns the count, or null if the commands fail.
 */
function commitsAhead(branch, exec) {
  const mergeBase = gitExec(`git merge-base origin/${branch} HEAD`, exec);
  if (mergeBase === null) return null;
  const count = gitExec(`git rev-list --count ${mergeBase}..HEAD`, exec);
  if (count === null) return null;
  const parsed = parseInt(count, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Core detection logic.
 * @param {string|undefined} explicitBranch - Optional branch passed as CLI arg
 * @param {{ execSync?: Function }} options - Optional overrides for testing
 * @returns {string} The detected base branch name
 */
function detectBaseBranch(explicitBranch, options = {}) {
  const exec = options.execSync || defaultExecSync;

  // 1. Explicit branch — verify it exists on remote
  if (explicitBranch) {
    if (remoteBranchExists(explicitBranch, exec)) {
      return explicitBranch;
    }
    // Doesn't exist → fall through to auto-detection
  }

  // 2. Score each candidate
  let bestBranch = null;
  let bestCount = Infinity;

  for (const branch of CANDIDATE_BRANCHES) {
    if (!remoteBranchExists(branch, exec)) continue;

    const ahead = commitsAhead(branch, exec);
    if (ahead === null) continue;

    // Strict less-than keeps the first (higher-priority) winner on ties
    if (ahead < bestCount) {
      bestCount = ahead;
      bestBranch = branch;
    }
  }

  // 3. Return best match or fallback
  return bestBranch ?? "main";
}

function main() {
  const explicitBranch = process.argv[2] || undefined;
  const result = detectBaseBranch(explicitBranch);
  process.stdout.write(result + "\n");
}

if (require.main === module) {
  main();
}

module.exports = { detectBaseBranch };
