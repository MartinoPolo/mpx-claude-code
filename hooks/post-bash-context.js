/**
 * PostToolUse/Bash hook — injects context after certain commands.
 * Triggers: git push, package install (npm/yarn/pnpm/bun), gh pr create.
 */

const { readStdin } = require("./shared");
const { execSync } = require("child_process");

/**
 * Determine context message to inject based on the command and its response.
 * @param {string} command - The bash command that was run
 * @param {object} response - { stdout, stderr, exit_code }
 * @param {string} cwd - Working directory
 * @param {object} [options] - Dependency injection (e.g. { execSync })
 * @returns {string|null} Context message or null
 */
function determineContext(command, response, cwd, options = {}) {
  const exec = options.execSync || execSync;
  const exitCode = response.exit_code ?? null;
  const stdout = response.stdout ?? "";
  const stderr = response.stderr ?? "";

  // 1. After successful git push — check if PR exists
  if (/\bgit\s+push\b/.test(command) && exitCode === 0) {
    try {
      exec("gh pr view --json url", { cwd, stdio: "pipe", timeout: 10000 });
      // PR exists — no noise
      return null;
    } catch (err) {
      const msg = String(err?.stderr || err?.message || "");
      // Only inject "no PR" when gh explicitly says so; stay silent on auth/network errors
      if (/no pull requests found|no open pull requests/i.test(msg) || err?.status === 1) {
        return "Pushed to remote. No PR exists for this branch yet.";
      }
      return null;
    }
  }

  // 2. After package install — check for vulnerability warnings
  if (
    /\b(npm\s+install|yarn\s+add|pnpm\s+add|bun\s+add)\b/.test(command)
  ) {
    if (/vulnerabilit(y|ies)/i.test(stderr)) {
      return "Package install detected vulnerabilities in stderr. Consider running audit.";
    }
    return null;
  }

  // 3. After successful gh pr create — extract PR URL
  if (/\bgh\s+pr\s+create\b/.test(command) && exitCode === 0) {
    const urlMatch = stdout.match(/(https:\/\/github\.com\/\S+)/);
    if (urlMatch) {
      return `PR created: ${urlMatch[1]}`;
    }
    return null;
  }

  return null;
}

async function main() {
  const input = await readStdin();
  const command = input.tool_input?.command ?? "";
  const response = input.tool_response ?? {};
  const cwd = input.cwd ?? process.cwd();

  const context = determineContext(command, response, cwd);
  if (context) {
    const output = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: context,
      },
    });
    process.stdout.write(output);
  }
  process.exit(0);
}

module.exports = { determineContext };
if (require.main === module) main().catch(() => process.exit(0));
