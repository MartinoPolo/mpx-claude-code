/**
 * PreToolUse hook (matcher: Bash)
 * Blocks git commit and git push when fallow audit returns verdict fail.
 * Port of the fallow-generated fallow-gate.sh to Node.js for Windows compatibility.
 * Runtime errors fail open (exit 0) with a stderr notice so skips stay visible.
 * Exit 0 = allow, Exit 2 = block
 */

// Skip in VS Code Copilot — hooks run in PowerShell/WSL there and cause path errors.
if (process.env.TERM_PROGRAM === 'vscode') {
  process.exit(0);
}

const { execFileSync, spawnSync } = require('child_process');
const { readStdin } = require('./shared');

const MIN_VERSION = process.env.FALLOW_GATE_MIN_VERSION ?? '2.46.0';

/** Compare two plain semver strings. Returns -1 | 0 | 1. */
function semverCompare(a, b) {
  const parse = (v) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [aMajor, aMinor, aPatch] = parse(a);
  const [bMajor, bMinor, bPatch] = parse(b);
  if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
  if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
  if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
  return 0;
}

/** Check if a command exists on PATH. */
function commandExists(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Run fallow audit --format json --quiet --explain. */
function runFallowAudit(runner) {
  const args = [...runner.slice(1), 'audit', '--format', 'json', '--quiet', '--explain'];
  const result = spawnSync(runner[0], args, { encoding: 'utf8', stdio: 'pipe' });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
}

/** Get fallow version string (e.g. "2.48.4"). */
function getFallowVersion(runner) {
  try {
    const result = spawnSync(runner[0], [...runner.slice(1), '--version'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return (result.stdout ?? '').trim().replace(/^fallow\s+/, '').split(/\s+/)[0] ?? '';
  } catch {
    return '';
  }
}

const GIT_COMMIT_OR_PUSH = /(^|[\s;|&()])git[\s]+(commit|push)([\s]|$)/;

async function main() {
  let input;
  try {
    input = await readStdin();
  } catch {
    process.stderr.write('fallow-gate: failed to parse stdin JSON, skipping.\n');
    process.exit(0);
  }

  const cmd = input?.tool_input?.command ?? '';
  if (!GIT_COMMIT_OR_PUSH.test(cmd)) process.exit(0);

  // Resolve fallow runner.
  let runner;
  let binDesc;

  if (commandExists('fallow')) {
    runner = ['fallow'];
    binDesc = 'fallow';
  } else if (commandExists('npx')) {
    const probe = spawnSync('npx', ['--no-install', 'fallow', '--version'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if ((probe.stdout ?? '').startsWith('fallow')) {
      runner = ['npx', '--no-install', 'fallow'];
      binDesc = 'npx --no-install fallow';
    }
  }

  if (!runner) {
    process.stderr.write('fallow-gate: fallow binary not found (tried PATH and npx --no-install), skipping.\n');
    process.exit(0);
  }

  // Version floor check.
  if (MIN_VERSION) {
    const version = getFallowVersion(runner);
    if (version && semverCompare(version, MIN_VERSION) < 0) {
      process.stderr.write(
        `fallow-gate: blocked: ${binDesc} is fallow ${version}, below required ${MIN_VERSION}.\n` +
        `fallow-gate: older binaries miss the uncommitted-changes fix (v2.46.0) and can\n` +
        `fallow-gate: silently pass audits that would otherwise fail.\n` +
        `fallow-gate: upgrade fallow (npm install -g fallow@latest), or set FALLOW_GATE_MIN_VERSION= to disable.\n`
      );
      process.exit(2);
    }
  }

  // Run the audit.
  const { stdout, stderr, status } = runFallowAudit(runner);

  let parsed = null;
  try { parsed = JSON.parse(stdout); } catch { /* fail open */ }

  const verdict = parsed?.verdict ?? null;
  const isError = parsed?.error === true;

  if (verdict === 'fail') {
    const version = getFallowVersion(runner);
    process.stderr.write(`fallow-gate: blocked by fallow ${version || 'unknown'} at ${binDesc}\n`);
    process.stderr.write(stdout);
    process.exit(2);
  }

  if (status === 2 || isError) {
    const msg = parsed?.message ?? '';
    process.stderr.write(
      msg
        ? `fallow-gate: fallow audit runtime error (${msg}), skipping.\n`
        : `fallow-gate: fallow audit runtime error, skipping.\n`
    );
    process.exit(0);
  }

  if (status !== 0) {
    const errLine = (stderr.split('\n')[0] ?? '').trim();
    process.stderr.write(
      errLine
        ? `fallow-gate: fallow audit exited ${status} (${errLine}), skipping.\n`
        : `fallow-gate: fallow audit exited ${status}, skipping.\n`
    );
    process.exit(0);
  }

  process.exit(0);
}

main();
