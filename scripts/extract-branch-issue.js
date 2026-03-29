/**
 * Extract GitHub issue number from the current git branch name.
 * Usage: node extract-branch-issue.js
 * Output: issue number to stdout, or empty string if none found.
 */

const { execSync } = require("child_process");

// Matches: 42-desc, prefix/42-desc, 42
// Does NOT match: feature-42-desc, v2-feature (avoids version/word-prefix false positives)
// For branches like feature-42-fix, the agent issue-finder is used as fallback.
const ISSUE_NUMBER_PATTERN = /(?:^|\/)(\d+)(?:-|$)/;

function extractIssueNumber(branchName) {
  const match = branchName.match(ISSUE_NUMBER_PATTERN);
  return match ? match[1] : "";
}

function main() {
  const branch = execSync("git branch --show-current", {
    encoding: "utf8",
  }).trim();
  const issueNumber = extractIssueNumber(branch);
  process.stdout.write(issueNumber);
}

if (require.main === module) {
  main();
}

module.exports = { extractIssueNumber };
