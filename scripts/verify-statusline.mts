#!/usr/bin/env node
// End-to-end contract check for the status-line renderers.
//
// Usage: node scripts/verify-statusline.mts
//
// This began as a golden-diff harness proving byte-parity against the bash
// originals, which is how the TypeScript port was validated. That contract ended
// deliberately: the renderers now spell states as words and gate effort drift on
// declared values, neither of which the shell versions do. The originals moved to
// deprecated/scripts/ and the diff went with them.
//
// What is left is what unit tests structurally cannot cover — running the real
// executables end to end, through a real stdin pipe, and through the installed
// symlink. Each fixture gets a throwaway TMPDIR and CLAUDE_CONFIG_DIR so a run
// can never see the real caches or another fixture's.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPTS = path.join(REPO_ROOT, "scripts");

interface Fixture {
    name: string;
    payload: unknown;
    /** Files pre-seeded into the throwaway cache dir, so cache-path branches are reachable and deterministic. */
    cacheFiles?: Record<string, string>;
    /** Files pre-seeded into the throwaway config dir. */
    configFiles?: Record<string, string>;
}

const UNIT_SEPARATOR = "\x1f";
const nowSeconds = Math.floor(Date.now() / 1000);

/**
 * Characters Cascadia Mono (Windows Terminal's default face) has no glyph for.
 * Each one font-falls-back to Segoe UI Emoji, which draws double-width into the
 * single cell the terminal reserved and smears over the text beside it. Measured
 * against the installed font, not assumed — see the glyph vocabulary note in
 * status-line.mts. Nothing the renderers emit may contain one.
 */
const FALLBACK_PRONE_GLYPHS = /[✎⟳⊘⇅✗]/u;

const statusLineFixtures: Fixture[] = [
    {
        name: "live rate limits, real git repo",
        payload: {
            session_name: "parity-check",
            session_id: "0123456789abcdef",
            model: { display_name: "Opus 5", id: "claude-opus-5" },
            cwd: REPO_ROOT,
            context_window: { context_window_size: 1000000, total_input_tokens: 52340, used_percentage: 12.3 },
            cost: { total_cost_usd: 1.2345, total_lines_added: 42, total_lines_removed: 7 },
            effort: { level: "high" },
            rate_limits: {
                five_hour: { used_percentage: 37, resets_at: nowSeconds + 3 * 3600 + 900 },
                seven_day: { used_percentage: 61, resets_at: nowSeconds + 5 * 86400 }
            }
        },
        cacheFiles: { "claude-czk-cache.txt": "23.417\n" }
    },
    {
        name: "no rate limits in stdin, warm cache on disk",
        payload: {
            session_name: "cache-path",
            session_id: "fedcba9876543210",
            model: { display_name: "Sonnet 5", id: "claude-sonnet-5" },
            cwd: REPO_ROOT,
            context_window: { context_window_size: 200000, total_input_tokens: 145000, used_percentage: 72.5 },
            cost: { total_cost_usd: 0.019, total_lines_added: 0, total_lines_removed: 0 },
            effort: { level: "medium" }
        },
        cacheFiles: {
            "claude-czk-cache.txt": "23.417\n",
            "claude-usage-Personal.tsv":
                ["12", String(nowSeconds + 7200), "45", String(nowSeconds + 200000)].join(UNIT_SEPARATOR) + "\n"
        }
    },
    {
        name: "context escalation red, no git repo, no cost",
        payload: {
            session_id: "deadbeefcafef00d",
            model: { display_name: "Opus 5" },
            cwd: path.join(tmpdir(), "definitely-not-a-repo"),
            context_window: { context_window_size: 200000, total_input_tokens: 187000 },
            cost: {},
            rate_limits: { five_hour: { used_percentage: 104 }, seven_day: {} }
        },
        cacheFiles: { "claude-czk-cache.txt": "23.417\n" }
    },
    {
        name: "minimal payload, every optional field absent",
        payload: { session_id: "aaaabbbbccccdddd", cwd: REPO_ROOT },
        cacheFiles: { "claude-czk-cache.txt": "23.417\n" }
    }
];

function task(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        id: "task-1",
        name: null,
        type: "local_agent",
        status: "running",
        description: "exploring the codebase for status line call sites",
        label: null,
        startTime: Date.now() - 95_000,
        model: "claude-sonnet-5",
        effort: "medium",
        contextWindowSize: 200000,
        tokenCount: 25032,
        ...overrides
    };
}

const subagentFixtures: Fixture[] = [
    {
        name: "mixed tiers, one drift row",
        payload: {
            columns: 100,
            session_id: "parity-subagent-1",
            cwd: REPO_ROOT,
            tasks: [
                task({ id: "t-opus", model: "claude-opus-5", effort: "high", tokenCount: 152000, contextWindowSize: 200000 }),
                task({ id: "t-sonnet-drift", model: "sonnet", effort: "high", status: "running" }),
                task({ id: "t-haiku", model: "haiku", effort: "low", status: "completed", tokenCount: 812, contextWindowSize: 200000 })
            ]
        },
        configFiles: { "settings.json": JSON.stringify({ effortLevel: "high" }) }
    },
    {
        name: "inherited effort, numeric budget, fable, unknown model",
        payload: {
            columns: 80,
            session_id: "parity-subagent-2",
            cwd: REPO_ROOT,
            tasks: [
                task({ id: "t-inherit", model: "claude-opus-5", effort: null }),
                task({ id: "t-budget", model: "claude-opus-5", effort: "32000" }),
                task({ id: "t-fable", model: "claude-fable-5", effort: "max" }),
                task({ id: "t-unknown", model: "some-other-model", effort: "medium", status: "failed" })
            ]
        },
        configFiles: { "settings.json": JSON.stringify({ effortLevel: "medium" }) }
    },
    {
        name: "narrow terminal forces description truncation",
        payload: {
            columns: 60,
            session_id: "parity-subagent-3",
            cwd: REPO_ROOT,
            tasks: [
                task({ id: "t-long", description: "a".repeat(200), status: "killed", tokenCount: 999, contextWindowSize: 1000 })
            ]
        },
        configFiles: { "settings.json": JSON.stringify({ effortLevel: "low" }) }
    },
    {
        name: "empty task list emits nothing",
        payload: { columns: 100, session_id: "parity-subagent-4", cwd: REPO_ROOT, tasks: [] }
    }
];

interface RunResult { stdout: string; status: number }

/** Assertions are written against LF so a stray CR cannot fail one spuriously. */
function normalizeLineEndings(text: string): string {
    return text.replaceAll("\r\n", "\n");
}

function run(command: string, args: string[], input: string, env: NodeJS.ProcessEnv): RunResult {
    try {
        const stdout = execFileSync(command, args, {
            input,
            encoding: "utf8",
            env,
            cwd: REPO_ROOT,
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 20000
        });
        return { stdout: normalizeLineEndings(stdout), status: 0 };
    } catch (error) {
        const failure = error as { stdout?: string; status?: number; message?: string };
        return {
            stdout: failure.stdout ? normalizeLineEndings(failure.stdout) : `<<spawn failed: ${failure.message}>>`,
            status: failure.status ?? -1
        };
    }
}

function isolatedEnv(fixture: Fixture): NodeJS.ProcessEnv {
    const sandbox = mkdtempSync(path.join(tmpdir(), "statusline-parity-"));
    const cacheDir = path.join(sandbox, "cache").replaceAll("\\", "/");
    const configDir = path.join(sandbox, "config").replaceAll("\\", "/");
    mkdirSync(cacheDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });

    for (const [name, contents] of Object.entries(fixture.cacheFiles ?? {})) {
        writeFileSync(path.join(cacheDir, name), contents);
    }
    for (const [name, contents] of Object.entries(fixture.configFiles ?? {})) {
        writeFileSync(path.join(configDir, name), contents);
    }

    return { ...process.env, TMPDIR: cacheDir, CLAUDE_CONFIG_DIR: configDir, SANDBOX_ROOT: sandbox };
}

interface CheckResult { name: string; failures: string[] }

/** Runs one fixture through a renderer in its own sandbox and returns the stdout. */
function renderFixture(script: string, fixture: Fixture): RunResult {
    const env = isolatedEnv(fixture);
    const result = run("node", [path.join(SCRIPTS, script)], JSON.stringify(fixture.payload), env);
    rmSync(env.SANDBOX_ROOT!, { recursive: true, force: true });
    return result;
}

function checkStatusLine(fixture: Fixture): CheckResult {
    const failures: string[] = [];
    const { stdout, status } = renderFixture("status-line.mts", fixture);

    if (status !== 0) failures.push(`exited ${status}`);
    if (stdout.trim() === "") failures.push("emitted nothing");

    const glyph = FALLBACK_PRONE_GLYPHS.exec(stdout);
    if (glyph) failures.push(`emitted the fallback-prone glyph ${JSON.stringify(glyph[0])}`);

    // A missing field reaching the terminal is the failure mode a renderer hides
    // best: the line still looks plausible, just with a literal "undefined" in it.
    for (const leak of ["undefined", "NaN", "[object Object]"]) {
        if (stdout.includes(leak)) failures.push(`leaked ${JSON.stringify(leak)} into the rendered line`);
    }
    return { name: fixture.name, failures };
}

function checkSubagentStatusLine(fixture: Fixture): CheckResult {
    const failures: string[] = [];
    const { stdout, status } = renderFixture("subagent-status-line.mts", fixture);
    if (status !== 0) failures.push(`exited ${status}`);

    const expectedIds = ((fixture.payload as { tasks?: { id: string }[] }).tasks ?? []).map((task) => task.id);
    const lines = stdout.split("\n").filter((line) => line !== "");

    // Any row whose id the hook fails to echo silently keeps Claude Code's
    // built-in rendering, so a malformed line degrades rather than erroring.
    const renderedIds: string[] = [];
    for (const [index, line] of lines.entries()) {
        try {
            const parsed = JSON.parse(line) as { id?: unknown; content?: unknown };
            if (typeof parsed.id !== "string" || typeof parsed.content !== "string") {
                failures.push(`line ${index + 1} is not a {id, content} object`);
                continue;
            }
            renderedIds.push(parsed.id);
            if (FALLBACK_PRONE_GLYPHS.test(parsed.content)) {
                failures.push(`line ${index + 1} emitted a fallback-prone glyph`);
            }
        } catch {
            failures.push(`line ${index + 1} is not valid JSON: ${JSON.stringify(line.slice(0, 80))}`);
        }
    }

    for (const id of expectedIds) {
        if (!renderedIds.includes(id)) failures.push(`no row emitted for task ${id}`);
    }
    return { name: fixture.name, failures };
}

function report(title: string, results: CheckResult[]): boolean {
    console.log(`\n=== ${title} ===`);
    let allPassed = true;
    for (const result of results) {
        const passed = result.failures.length === 0;
        console.log(`${passed ? "PASS" : "FAIL"}  ${result.name}`);
        if (!passed) {
            allPassed = false;
            for (const failure of result.failures) console.log(`  - ${failure}`);
        }
    }
    return allPassed;
}

const statusLinePassed = report("status-line", statusLineFixtures.map(checkStatusLine));
const subagentPassed = report("subagent-status-line", subagentFixtures.map(checkSubagentStatusLine));

/**
 * Claude Code invokes these through `~/.claude/scripts`, a symlink to this repo.
 * Node resolves `import.meta.url` to the link target but leaves `process.argv[1]`
 * as the link path, so an entry-point guard that compares the two without
 * realpath silently renders nothing — the status line just goes blank, with no
 * error anywhere. Running the fixtures from the repo path cannot catch that, so
 * the installed path gets its own smoke test.
 */
function checkInstalledPathRenders(): boolean {
    const installedScripts = path.join(homedir(), ".claude", "scripts");
    console.log("\n=== installed-path smoke test (via ~/.claude/scripts symlink) ===");

    if (!existsSync(installedScripts)) {
        console.log("SKIP  ~/.claude/scripts is not present");
        return true;
    }

    let allPassed = true;
    for (const [script, fixture] of [
        ["status-line.mts", statusLineFixtures[0]!],
        ["subagent-status-line.mts", subagentFixtures[0]!]
    ] as const) {
        const env = isolatedEnv(fixture);
        const result = run("node", [path.join(installedScripts, script)], JSON.stringify(fixture.payload), env);
        rmSync(env.SANDBOX_ROOT!, { recursive: true, force: true });

        const rendered = result.stdout.trim().length > 0;
        console.log(`${rendered ? "PASS" : "FAIL"}  ${script} renders output when run through the symlink`);
        if (!rendered) {
            allPassed = false;
            console.log("  emitted nothing — check the entry-point guard resolves realpaths");
        }
    }
    return allPassed;
}

const installedPassed = checkInstalledPathRenders();

console.log("");
process.exit(statusLinePassed && subagentPassed && installedPassed ? 0 : 1);
