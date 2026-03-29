/**
 * PreToolUse hook (matcher: Bash)
 * Blocks genuinely dangerous commands from AI agents.
 * Exit 0 = allow, Exit 2 = block (stderr fed back to Claude)
 */

const { readStdin } = require("./shared");

const RM_RF_ALLOWED_TARGETS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".svelte-kit",
  ".nuxt",
  "coverage",
  ".cache",
  "tmp",
  ".turbo",
  ".parcel-cache",
  ".output",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "target",
]);

/**
 * @param {string} command
 * @returns {{ blocked: boolean, message?: string }}
 */
function checkDangerousCommand(command) {
  const trimmed = command.trim();

  // 1. Detect rm with recursive+force — both short and long form
  if (/\brm\s+/.test(trimmed)) {
    const afterRm = trimmed.match(/\brm\s+(.*)/)?.[1] ?? "";
    const hasRecursive = /-[a-zA-Z]*r/.test(afterRm) || /--recursive/.test(afterRm);
    const hasForce = /-[a-zA-Z]*f/.test(afterRm) || /--force/.test(afterRm);

    if (hasRecursive && hasForce) {
      // Find the target: skip flags (start with -) and -- separator
      const tokens = afterRm.trim().split(/\s+/);
      let target = null;
      let pastSeparator = false;
      for (const token of tokens) {
        if (token === "--") { pastSeparator = true; continue; }
        if (!token.startsWith("-") || pastSeparator) { target = token; break; }
      }

      if (target) {
        // Block: /, ~, ., .., *
        if (/^[\/~.*]$/.test(target) || target === "..") {
          return blocked("broad recursive deletion", command);
        }

        // Single-component path (no slashes) not in allowlist
        if (
          !target.includes("/") &&
          !target.includes("\\") &&
          !RM_RF_ALLOWED_TARGETS.has(target)
        ) {
          return blocked("broad recursive deletion", command);
        }
      }
    }
  }

  // 2. Windows destructive commands
  if (/\brmdir\s+\/s\b/i.test(trimmed)) {
    return blocked("Windows recursive directory deletion", command);
  }
  if (
    /\bdel\s+.*\/f\b.*\/q\b.*\/s\b/i.test(trimmed) ||
    /\bdel\s+.*\/s\b.*\/q\b.*\/f\b/i.test(trimmed)
  ) {
    return blocked("Windows recursive forced deletion", command);
  }

  // 3. Permission destruction on broad paths
  if (/\bchmod\s+(-R\s+)?(777|000)\s+[\/~.]/.test(trimmed)) {
    return blocked("broad permission change", command);
  }

  // 4. Disk operations
  if (/\bmkfs\b/.test(trimmed)) {
    return blocked("filesystem format", command);
  }
  if (/\bdd\s+.*if=\/dev\/zero\s+.*of=\/dev\//.test(trimmed)) {
    return blocked("device overwrite via dd", command);
  }

  // 5. Fork bomb
  if (/:\(\)\s*\{.*:\|:.*\}/.test(trimmed)) {
    return blocked("fork bomb", command);
  }

  // 6. SQL destruction (case-insensitive)
  if (/\bDROP\s+(TABLE|DATABASE)\b/i.test(trimmed)) {
    return blocked("SQL destructive operation", command);
  }
  if (/\bTRUNCATE\s+TABLE\b/i.test(trimmed)) {
    return blocked("SQL destructive operation", command);
  }

  // 7. Git force-push to protected branches (negative lookahead excludes --force-with-lease)
  if (
    /\bgit\s+push\s+.*(-f|--force(?!-with-lease))\b.*\b(origin|upstream)\s+(main|master)\b/.test(trimmed) ||
    /\bgit\s+push\s+(-f|--force(?!-with-lease))\s+(origin|upstream)\s+(main|master)\b/.test(trimmed) ||
    /\bgit\s+push\s+(-f|--force(?!-with-lease))\s+(main|master)\b/.test(trimmed)
  ) {
    return blocked("force push to protected branch", command);
  }

  // 8. git clean -fdx (removes all untracked+ignored)
  if (/\bgit\s+clean\b/.test(trimmed)) {
    const flags = trimmed.match(/\bgit\s+clean\s+(.*)/)?.[1] ?? "";
    if (/f/.test(flags) && /d/.test(flags) && /x/.test(flags)) {
      return blocked("git clean that removes all untracked and ignored files", command);
    }
  }

  // 9. Device overwrite via redirect
  if (/>\s*\/dev\/sd[a-z]/.test(trimmed)) {
    return blocked("device overwrite", command);
  }

  // 10. Persistent environment variable modification (Windows)
  // setx PATH with %PATH% or $PATH bakes the full combined PATH into User PATH, causing corruption
  if (/\bsetx\s+.*\bPATH\b/i.test(trimmed)) {
    return blocked("persistent PATH modification via setx (corrupts Windows PATH)", command);
  }
  // PowerShell [Environment]::SetEnvironmentVariable targeting PATH
  if (/SetEnvironmentVariable\s*\(\s*['"]PATH['"]/i.test(trimmed)) {
    return blocked("persistent PATH modification via PowerShell (corrupts Windows PATH)", command);
  }
  // reg add targeting Environment key (direct registry PATH edit)
  if (/\breg\s+add\b.*\\Environment\b/i.test(trimmed) && /\bPATH\b/i.test(trimmed)) {
    return blocked("persistent PATH modification via registry", command);
  }

  return { blocked: false };
}

function blocked(reason, command) {
  return {
    blocked: true,
    message: `Blocked: ${reason} is not allowed for AI agents.\nTo run it yourself: ! ${command.trim()}`,
  };
}

async function main() {
  const input = await readStdin();
  const command = input.tool_input?.command ?? "";
  if (!command) process.exit(0);

  const result = checkDangerousCommand(command);
  if (result.blocked) {
    process.stderr.write(result.message + "\n");
    process.exit(2);
  }
  process.exit(0);
}

module.exports = { checkDangerousCommand, RM_RF_ALLOWED_TARGETS };

if (require.main === module) {
  main().catch(() => process.exit(0));
}
