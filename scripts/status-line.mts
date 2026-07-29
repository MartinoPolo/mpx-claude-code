#!/usr/bin/env node
// Claude Code `statusLine` renderer: one JSON object on stdin, the rendered
// status text on stdout. It is re-run on every render tick, so the render path
// stays cheap — a single git call, cache reads, and nothing else. Claude Code
// cancels a status line that blocks, so every network touch is pushed into a
// detached child (`--warm-usage`, `--warm-czk`, status-line-mr-refresh.sh) that
// only ever writes a cache for a *later* render to pick up.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DIM, GRAY, RESET, fg, isNonNegativeInt, readStdin, toNonNegativeInt } from "./lib/statusline-ansi.mts";

// --- Theme -------------------------------------------------------------------

/** Color theme: gray, orange, blue, teal, green, lavender, rose, gold, slate, cyan */
const COLOR = "blue";

const ACCENT_BY_THEME: Record<string, string> = {
    orange: fg(173),
    blue: fg(74),
    teal: fg(66),
    green: fg(71),
    lavender: fg(139),
    rose: fg(132),
    gold: fg(136),
    slate: fg(60),
    cyan: fg(37)
};

const ACCENT = ACCENT_BY_THEME[COLOR] ?? GRAY;
const BAR_EMPTY = fg(238);

/**
 * Brightest foreground, spent on the one field that answers "where am I" — the
 * directory name. Everything else on that line is gray, so the eye lands there
 * first without any glyph or box drawing to carry the emphasis.
 */
const WHITE = fg(255);

/** Warning color for a state the user has to act on (coral red). */
const WARN = fg(203);

// Age notes — "last fetched 3d ago", "this cache is 11m old" — are always DIM,
// never WARN. They answer "how much do I trust the number beside me", which is
// context, not a call to action; coloring them as warnings trains the eye to
// ignore coral everywhere else. The one exception is the quota line, where an
// age past USAGE_WARN_SECONDS means the percentages themselves are wrong.

// Context-consumption escalation (absolute input tokens): the 🔥 token count
// shifts yellow -> orange -> red as context fills, so a heavy session is
// obvious at a glance.
const CONTEXT_YELLOW = fg(220); // >=100k tokens
const CONTEXT_ORANGE = fg(208); // >=140k tokens
const CONTEXT_RED = fg(196); // >=180k tokens

// Account colors — distinct from ACCENT and from each other, so
// model/account/work-vs-personal all read as separate signals at a glance.
const PERSONAL = fg(71); // green
const WORK = fg(173); // orange

// Line-edit colors: green additions, red deletions.
const ADD = fg(71);
const DEL = fg(167);

// Git/MR colors: sand for "never left this machine" (local branch, draft MR),
// blue for the MR/PR reference itself.
const LOCAL = fg(180);
const DRAFT = fg(180);
const MR = fg(74);

/** Session name (line 1): lavender — distinct from the blue model line. */
const SESSION = fg(141);

// --- Glyph vocabulary --------------------------------------------------------

// States are spelled as words, not dingbats, and every glyph is followed by a
// space. Two separate reasons, worth keeping apart:
//
// Correctness. A glyph the terminal font lacks font-falls-back to Segoe UI
// Emoji, which draws double-width into the one cell the terminal reserved and
// smears over the neighbouring text. Measured against Cascadia Mono (Windows
// Terminal's default when no "face" is set), exactly five of the old glyphs
// were absent: ✎ U+270E, ⟳ U+27F3, ⊘ U+2298, ⇅ U+21C5, ✗ U+2717. Those had to
// go. Real emoji (📁 🔀 🔥 💬 ⚠) come from the emoji font by design and are
// fine once spaced.
//
// Legibility. ≡ ● ◐ ⬤ ⌂ ✓ do render in Cascadia Mono, but they were replaced
// anyway: none of them says what it means, and the four CI states were the same
// ⬤ separated only by color, which a screenshot or a colorblind reader loses
// entirely. Dropping them also buys portability — Consolas is missing ◐ ⬤ ✓ as
// well, so a font change would have reintroduced the overlap.

/**
 * The one field separator, on every line. `|` drew a wall between fields that
 * are merely adjacent, and once the git section spelled its states as words
 * (`in sync 2 staged 28 modified`) something lighter was needed *inside* a
 * section too — so one glyph now means "next field" at every level rather than
 * two glyphs meaning two ranks of the same thing. U+00B7 renders in both
 * Cascadia Mono and Consolas.
 */
export const SEPARATOR = ` ${GRAY}·${RESET} `;

/** Joins pre-colored segments, dropping the empty ones so no separator dangles. */
function joinSegments(segments: string[]): string {
    return segments.filter((segment) => segment !== "").join(SEPARATOR);
}

/**
 * OSC-8 hyperlink, terminated with BEL rather than the usual `ESC \`. Every line
 * is emitted through `expandBackslashEscapes`, which would pair that trailing
 * backslash with the first character of the label: a directory named `trace`
 * would render as a tab followed by `race`, and one named `code` would truncate
 * the whole line at `\c`. BEL contains no backslash, so no label can collide.
 */
export function hyperlink(url: string, label: string): string {
    return `\x1b]8;;${url}\x07${label}\x1b]8;;\x07`;
}

/** A link when the URL could be built, the bare label when it could not. */
function maybeLink(url: string, label: string): string {
    return url === "" ? label : hyperlink(url, label);
}

/**
 * `file:` URL for an absolute path, no trailing slash.
 *
 * Windows Terminal opens a hyperlink only when its scheme is http, https or file
 * (`TerminalPage::_IsUriSupported`); anything else raises a dialog instead of
 * reaching the registered handler. So file is the only scheme worth emitting.
 * Backslashes are not legal in a URL path, and `#`/`?` would start a fragment or
 * a query — `encodeURI` leaves both alone, hence the explicit replacements.
 */
export function toFileUrl(absolutePath: string): string {
    const forwardSlashed = absolutePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
    return `file:///${encodeURI(forwardSlashed).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}

/** Pipeline state -> the color and label the MR block renders for it. */
const CI_STATE_BY_PIPELINE: Record<string, { color: string; text: string }> = {
    SUCCESS: { color: ADD, text: "ci ok" },
    FAILED: { color: WARN, text: "ci fail" },
    RUNNING: { color: CONTEXT_YELLOW, text: "ci run" },
    CANCELED: { color: GRAY, text: "ci skip" },
    SKIPPED: { color: GRAY, text: "ci skip" }
};

// --- Cache layout ------------------------------------------------------------

const CACHE_DIR = process.env.TMPDIR || "/tmp";

/**
 * ASCII Unit Separator. The on-disk caches (written here and by
 * status-line-mr-refresh.sh) are delimited with it despite the `.tsv` names, so
 * a field that happens to contain a tab or a space can never shift a column.
 */
const UNIT_SEPARATOR = "\x1f";

const USAGE_STALE_SECONDS = 900; // 15 min: cached quota older than this gets a muted age note
const USAGE_WARN_SECONDS = 1800; // 30 min: older than this is flagged coral (genuinely outdated)
const WARM_MIN_INTERVAL = 300; // min seconds between background endpoint warm-fetches
const USAGE_RETRY_CAP = 3600; // clamp for a server Retry-After we honor

const CZK_CACHE = path.join(CACHE_DIR, "claude-czk-cache.txt");
const CZK_CACHE_TTL = 3600; // 1 hour

const MR_TTL = 90; // refetch cached MR/PR data past this
const MR_ATTEMPT_MIN = 30; // floor between refresh attempts (also covers failures / no-MR)
const MR_STALE_NOTE = 600; // show an age note past this

const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const FX_ENDPOINT = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=CZK";

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "";

/**
 * Account (work vs personal). `.claude-work` = work account (ccw/ccwd aliases);
 * anything else (default ~/.claude via cc/ccd) = personal.
 */
function resolveConfigDir(): string {
    return process.env.CLAUDE_CONFIG_DIR || `${HOME_DIR}/.claude`;
}

export type AccountLabel = "Work" | "Personal";

export function resolveAccountLabel(configDir: string): AccountLabel {
    return configDir.includes("claude-work") ? "Work" : "Personal";
}

/**
 * Quota cache keyed by account, NOT by config-dir path — the path arrives in two
 * forms (C:\Users\... vs /c/Users/...) which used to split one account across
 * two caches and double the fetch rate.
 */
function usagePaths(account: AccountLabel) {
    return {
        cache: path.join(CACHE_DIR, `claude-usage-${account}.tsv`),
        attempt: path.join(CACHE_DIR, `claude-usage-attempt-${account}`),
        retry: path.join(CACHE_DIR, `claude-usage-retry-${account}`)
    };
}

// --- Small filesystem/format primitives --------------------------------------

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

/** Seconds-resolution mtime, matching the `stat -c %Y` the caches were sized against. */
function mtimeSeconds(file: string): number | undefined {
    try {
        return Math.floor(statSync(file).mtimeMs / 1000);
    } catch {
        return undefined;
    }
}

function readFileOrEmpty(file: string): string {
    try {
        return readFileSync(file, "utf8");
    } catch {
        return "";
    }
}

/**
 * Splits one cache line into exactly `count` fields. The final field absorbs any
 * remaining separators, and missing fields come back as empty strings.
 */
export function readFields(line: string, count: number): string[] {
    const parts = line.split(UNIT_SEPARATOR);
    if (parts.length > count) {
        return [...parts.slice(0, count - 1), parts.slice(count - 1).join(UNIT_SEPARATOR)];
    }
    while (parts.length < count) {
        parts.push("");
    }
    return parts;
}

/** Leading-numeric prefix parse, matching the string-to-number coercion in awk/printf. */
export function numericPrefix(value: string): number {
    const match = /^[ \t]*[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(value);
    return match ? Number(match[0]) : 0;
}

function incrementDecimalDigits(digits: string): string {
    const out = digits.split("");
    for (let i = out.length - 1; i >= 0; i--) {
        if (out[i] === "9") {
            out[i] = "0";
        } else {
            out[i] = String(Number(out[i]) + 1);
            return out.join("");
        }
    }
    return `1${out.join("")}`;
}

/**
 * C `printf("%.*f")`, which is what both `format_pct` and `round_n` ultimately
 * were. It differs from `toFixed` on exact ties: libc rounds half to even
 * (0.5 -> "0", 1.5 -> "2", 2.5 -> "2") while `toFixed` always rounds up.
 */
export function formatFixed(value: number, decimals: number): string {
    if (!Number.isFinite(value)) {
        return Number.isNaN(value) ? "nan" : value > 0 ? "inf" : "-inf";
    }
    const negative = value < 0 || Object.is(value, -0);
    const magnitude = Math.abs(value);

    // Enough extra digits to tell an exact tie (which terminates) from a double
    // that merely rounds to one; a tie shows only zeros past this point.
    const guardDigits = Math.min(100, decimals + 40);
    const [integerPart, fractionPart = ""] = magnitude.toFixed(guardDigits).split(".");
    const kept = fractionPart.slice(0, decimals).padEnd(decimals, "0");
    const rest = fractionPart.slice(decimals);

    let roundUp = false;
    if (rest.length > 0) {
        const first = rest[0]!;
        if (first > "5") {
            roundUp = true;
        } else if (first === "5") {
            const lastKeptDigit = decimals > 0 ? kept[decimals - 1]! : integerPart[integerPart.length - 1]!;
            roundUp = /[1-9]/.test(rest.slice(1)) || Number(lastKeptDigit) % 2 === 1;
        }
    }

    let digits = integerPart + kept;
    if (roundUp) {
        digits = incrementDecimalDigits(digits);
    }

    const whole = decimals > 0 ? digits.slice(0, digits.length - decimals) : digits;
    const fraction = decimals > 0 ? digits.slice(digits.length - decimals) : "";
    const rendered = decimals > 0 ? `${whole}.${fraction}` : whole;
    // libc keeps the sign even when every rendered digit rounded to zero ("-0").
    return negative ? `-${rendered}` : rendered;
}

/** `printf '%.0f'` over a raw stdin field; empty for absent values. */
export function formatPct(raw: string): string {
    if (raw === "" || raw === "null") {
        return "";
    }
    return formatFixed(numericPrefix(raw), 0);
}

/** `awk printf("%.*f")` over a raw stdin field; empty for absent values. */
export function roundN(raw: string, decimals: number): string {
    if (raw === "" || raw === "null") {
        return "";
    }
    return formatFixed(numericPrefix(raw), decimals);
}

/**
 * `basename`, splitting on both separators: under Git Bash it treats a Windows
 * `\` as a path separator, so a `C:\...\repo` cwd must still yield `repo`.
 */
export function basename(input: string): string {
    if (input === "") {
        return "";
    }
    const trimmed = input.replace(/[/\\]+$/, "");
    if (trimmed === "") {
        return input[0] === "/" ? "/" : "\\";
    }
    const lastSeparator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return lastSeparator === -1 ? trimmed : trimmed.slice(lastSeparator + 1);
}

const BACKSLASH_ESCAPES: Record<string, string> = {
    a: "\x07",
    b: "\b",
    e: "\x1b",
    E: "\x1b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    "\\": "\\"
};

/**
 * The bash renderer emitted every line through `printf '%b'`, which expands
 * backslash escapes in the *data* too — a branch or session name containing
 * `\t` really did render as a tab. Reproduced so no payload can diverge.
 * `\c` truncates the rest of the output, newline included.
 */
export function expandBackslashEscapes(input: string): { text: string; truncated: boolean } {
    if (!input.includes("\\")) {
        return { text: input, truncated: false };
    }
    let out = "";
    let i = 0;
    while (i < input.length) {
        const char = input[i]!;
        if (char !== "\\" || i + 1 >= input.length) {
            out += char;
            i++;
            continue;
        }
        const next = input[i + 1]!;
        if (next === "c") {
            return { text: out, truncated: true };
        }
        const simple = BACKSLASH_ESCAPES[next];
        if (simple !== undefined) {
            out += simple;
            i += 2;
            continue;
        }
        if (/[0-7]/.test(next)) {
            const start = next === "0" ? i + 2 : i + 1;
            const octal = /^[0-7]{1,3}/.exec(input.slice(start))?.[0] ?? "";
            out += String.fromCharCode(octal === "" ? 0 : parseInt(octal, 8));
            i = start + octal.length;
            continue;
        }
        const hexMatch = next === "x" ? /^[0-9a-fA-F]{1,2}/.exec(input.slice(i + 2)) : null;
        if (hexMatch) {
            out += String.fromCharCode(parseInt(hexMatch[0], 16));
            i += 2 + hexMatch[0].length;
            continue;
        }
        const unicodeWidth = next === "u" ? 4 : next === "U" ? 8 : 0;
        const unicodeMatch = unicodeWidth
            ? new RegExp(`^[0-9a-fA-F]{1,${unicodeWidth}}`).exec(input.slice(i + 2))
            : null;
        if (unicodeMatch) {
            out += String.fromCodePoint(parseInt(unicodeMatch[0], 16));
            i += 2 + unicodeMatch[0].length;
            continue;
        }
        out += char + next;
        i += 2;
    }
    return { text: out, truncated: false };
}

// --- Display helpers ---------------------------------------------------------

export function progressBar(pct: number, width = 10): string {
    const filled = Math.trunc((pct * width) / 100);
    let out = "";
    for (let i = 0; i < width; i++) {
        out += i < filled ? `${ACCENT}█${RESET}` : `${BAR_EMPTY}░${RESET}`;
    }
    return out;
}

/**
 * Accepts either a Unix epoch (stdin `rate_limits.*.resets_at`) or an ISO-8601
 * string (endpoint fallback). Renders a compact "1h 21m" / "5d 5h", or nothing
 * once the reset is in the past.
 */
export function timeUntil(value: string, now: number = nowSeconds()): string {
    if (value === "" || value === "null") {
        return "";
    }
    let resetEpoch: number;
    if (/^[0-9]+(\.[0-9]+)?$/.test(value)) {
        resetEpoch = Number(value.replace(/\.[^.]*$/, ""));
    } else {
        const parsed = Date.parse(value);
        if (Number.isNaN(parsed)) {
            return "";
        }
        resetEpoch = Math.floor(parsed / 1000);
    }
    const diff = resetEpoch - now;
    if (diff <= 0) {
        return "";
    }
    const days = Math.trunc(diff / 86400);
    const hours = Math.trunc((diff % 86400) / 3600);
    const minutes = Math.trunc((diff % 3600) / 60);
    if (days > 0) {
        return `${days}d ${hours}h`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

/** Compact age like "2d", "2h", "7m", "45s". */
export function humanAge(seconds: number | string): string {
    if (!isNonNegativeInt(seconds)) {
        return "?";
    }
    const value = Number(seconds);
    if (value >= 86400) {
        return `${Math.trunc(value / 86400)}d`;
    }
    if (value >= 3600) {
        return `${Math.trunc(value / 3600)}h`;
    }
    if (value >= 60) {
        return `${Math.trunc(value / 60)}m`;
    }
    return `${value}s`;
}

// --- stdin payload -----------------------------------------------------------

export interface PayloadFields {
    sessionName: string;
    sessionId: string;
    model: string;
    cwd: string;
    maxContext: string;
    sessionTokensIn: string;
    contextUsedPct: string;
    sessionCostUsdRaw: string;
    effortLevel: string;
    fiveRaw: string;
    fiveResets: string;
    sevenRaw: string;
    sevenResets: string;
}

function lookup(root: unknown, keys: string[]): unknown {
    let current = root;
    for (const key of keys) {
        if (current === null || typeof current !== "object") {
            return undefined;
        }
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

/** jq's `//` operator: null and false count as absent, 0 and "" do not. */
function alternative(value: unknown, fallback: unknown): unknown {
    return value === null || value === undefined || value === false ? fallback : value;
}

function toDisplayString(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return (JSON.stringify(value) ?? "").replace(/[\n\r]/g, " ");
}

function field(root: unknown, keys: string[], fallback: unknown = ""): string {
    return toDisplayString(alternative(lookup(root, keys), fallback)).replace(/[\n\r]/g, " ");
}

export function extractPayloadFields(input: string): PayloadFields {
    let root: unknown;
    try {
        root = JSON.parse(input);
    } catch {
        root = undefined;
    }
    const model = alternative(lookup(root, ["model", "display_name"]), alternative(lookup(root, ["model", "id"]), "?"));
    return {
        sessionName: field(root, ["session_name"]),
        sessionId: field(root, ["session_id"]),
        model: toDisplayString(model).replace(/[\n\r]/g, " ") || "?",
        cwd: field(root, ["cwd"]),
        maxContext: field(root, ["context_window", "context_window_size"], 200000),
        sessionTokensIn: field(root, ["context_window", "total_input_tokens"]),
        contextUsedPct: field(root, ["context_window", "used_percentage"]),
        sessionCostUsdRaw: field(root, ["cost", "total_cost_usd"]),
        effortLevel: field(root, ["effort", "level"]),
        fiveRaw: field(root, ["rate_limits", "five_hour", "used_percentage"]),
        fiveResets: field(root, ["rate_limits", "five_hour", "resets_at"]),
        sevenRaw: field(root, ["rate_limits", "seven_day", "used_percentage"]),
        sevenResets: field(root, ["rate_limits", "seven_day", "resets_at"])
    };
}

// --- Git ---------------------------------------------------------------------

export interface GitStatus {
    branch: string;
    hasUpstream: boolean;
    hasAheadBehind: boolean;
    ahead: number;
    behind: number;
    staged: number;
    unstaged: number;
    conflicts: number;
    untracked: number;
}

export function parsePorcelainV2(output: string): GitStatus {
    const status: GitStatus = {
        branch: "",
        hasUpstream: false,
        hasAheadBehind: false,
        ahead: 0,
        behind: 0,
        staged: 0,
        unstaged: 0,
        conflicts: 0,
        untracked: 0
    };
    const lines = output.split("\n");
    lines.pop(); // a final unterminated line is never consumed by `while read`
    for (const line of lines) {
        if (line.startsWith("# branch.head ")) {
            status.branch = line.slice("# branch.head ".length);
        } else if (line.startsWith("# branch.upstream ")) {
            status.hasUpstream = true;
        } else if (line.startsWith("# branch.ab ")) {
            status.hasAheadBehind = true;
            const fields = line.trim().split(/\s+/);
            status.ahead = numericPrefix((fields[2] ?? "").replace(/^\+/, ""));
            status.behind = numericPrefix((fields[3] ?? "").replace(/^-/, ""));
        } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
            const xy = line.trim().split(/\s+/)[1] ?? "";
            if (xy.slice(0, 1) !== ".") {
                status.staged++;
            }
            if (xy.slice(1, 2) !== ".") {
                status.unstaged++;
            }
        } else if (line.startsWith("u ")) {
            status.conflicts++;
        } else if (line.startsWith("? ")) {
            status.untracked++;
        }
    }
    if (status.branch === "(detached)") {
        status.branch = "detached";
    }
    return status;
}

export function buildGitSigns(status: GitStatus): string {
    if (status.branch === "") {
        return "";
    }
    if (!status.hasUpstream) {
        return `${LOCAL}local${RESET}`;
    }
    // An upstream with no branch.ab line is exactly how git reports a deleted
    // remote branch.
    if (!status.hasAheadBehind) {
        return `${WARN}remote deleted${RESET}`;
    }
    if (status.ahead > 0 && status.behind > 0) {
        return `${WARN}↑${status.ahead}↓${status.behind}${RESET}`;
    }
    if (status.ahead > 0) {
        return `${ADD}↑${status.ahead}${RESET}`;
    }
    if (status.behind > 0) {
        return `${DEL}↓${status.behind}${RESET}`;
    }
    return `${ADD}in sync${RESET}`;
}

/** One segment per non-zero count; the caller joins them. */
export function buildGitDirt(status: GitStatus): string[] {
    if (status.branch === "") {
        return [];
    }
    const segments: string[] = [];
    if (status.staged > 0) {
        segments.push(`${ADD}${status.staged} staged${RESET}`);
    }
    if (status.unstaged > 0) {
        segments.push(`${DEL}${status.unstaged} modified${RESET}`);
    }
    if (status.untracked > 0) {
        segments.push(`${LOCAL}${status.untracked} untracked${RESET}`);
    }
    if (status.conflicts > 0) {
        segments.push(`${WARN}${status.conflicts} conflicted${RESET}`);
    }
    return segments;
}

/**
 * One git call carries branch name, upstream, ahead/behind and dirty state.
 * `--untracked-files=normal` walks the working tree, which the index-only `=no`
 * avoided — measured at 98ms against 92ms here, and untracked files are the one
 * class of uncommitted change the line could not otherwise show. `normal`
 * (rather than `all`) collapses an untracked directory to one entry, so the
 * count matches what `git status` shows a human and a large unignored tree
 * cannot inflate it. git's stderr is discarded outright so a non-repo cwd cannot
 * leak into the line.
 */
function readGitStatus(cwd: string): GitStatus | undefined {
    if (cwd === "") {
        return undefined;
    }
    try {
        if (!statSync(cwd).isDirectory()) {
            return undefined;
        }
    } catch {
        return undefined;
    }
    let output = "";
    try {
        output = execFileSync("git", ["-C", cwd, "status", "--porcelain=v2", "--branch", "--untracked-files=normal"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"]
        });
    } catch {
        output = "";
    }
    return parsePorcelainV2(output);
}

// --- MR/PR block -------------------------------------------------------------

export interface MrFields {
    timestamp: string;
    provider: string;
    iid: string;
    draft: string;
    conflicts: string;
    approved: string;
    approvalsRequired: string;
    approvalsLeft: string;
    status: string;
    notes: string;
    pipeline: string;
    url: string;
    fetchEpoch: string;
}

const EMPTY_MR_FIELDS: MrFields = {
    timestamp: "",
    provider: "",
    iid: "",
    draft: "",
    conflicts: "",
    approved: "",
    approvalsRequired: "",
    approvalsLeft: "",
    status: "",
    notes: "",
    pipeline: "",
    url: "",
    fetchEpoch: ""
};

export function parseMrCacheLine(line: string): MrFields {
    const [
        timestamp,
        provider,
        iid,
        draft,
        conflicts,
        approved,
        approvalsRequired,
        approvalsLeft,
        status,
        notes,
        pipeline,
        url,
        fetchEpoch
    ] = readFields(line, 13);
    return {
        timestamp: timestamp!,
        provider: provider!,
        iid: iid!,
        draft: draft!,
        conflicts: conflicts!,
        approved: approved!,
        approvalsRequired: approvalsRequired!,
        approvalsLeft: approvalsLeft!,
        status: status!,
        notes: notes!,
        pipeline: pipeline!,
        url: url!,
        fetchEpoch: fetchEpoch!
    };
}

/**
 * Ahead/behind compares against the local copy of the remote ref, so `in sync`
 * silently lies until a fetch happens; the age says how far to trust it.
 */
export function buildFetchAge(fetchEpoch: string, now: number): string {
    if (!isNonNegativeInt(fetchEpoch)) {
        return "";
    }
    const seconds = now - Number(fetchEpoch);
    if (seconds >= 86400) {
        return `${DIM}${Math.trunc(seconds / 86400)}d ago${RESET}`;
    }
    if (seconds >= 3600) {
        return `${DIM}${Math.trunc(seconds / 3600)}h ago${RESET}`;
    }
    if (seconds >= 600) {
        return `${DIM}${Math.trunc(seconds / 60)}m ago${RESET}`;
    }
    return "";
}

/**
 * The one review state worth showing, or "". Mutually exclusive by construction:
 * a draft's conflicts and approvals are noise until it is marked ready.
 */
function buildMrState(mr: MrFields): string {
    if (mr.draft === "true") {
        return `${DRAFT}draft${RESET}`;
    }
    if (mr.conflicts === "true") {
        return `${WARN}conflicts${RESET}`;
    }
    if (mr.status === "CHANGES_REQUESTED") {
        return `${WARN}changes-req${RESET}`;
    }
    if (mr.approved === "true") {
        return `${ADD}approved${RESET}`;
    }
    if (isNonNegativeInt(mr.approvalsLeft) && Number(mr.approvalsLeft) > 0) {
        return `${GRAY}${mr.approvalsLeft}/${mr.approvalsRequired} approvals${RESET}`;
    }
    if (mr.status === "MERGEABLE") {
        return `${ADD}mergeable${RESET}`;
    }
    if (mr.status !== "") {
        return `${GRAY}${mr.status.toLowerCase()}${RESET}`;
    }
    return "";
}

/**
 * The provider's own list of runs for this MR/PR — GitHub's Checks tab, GitLab's
 * Pipelines tab. Both are paths under the MR/PR URL already in the cache, so the
 * link costs no extra field and no extra API call. It targets the tab rather than
 * the newest run: the tab is a valid destination while the run is still queued,
 * and it shows the earlier attempts, which is what "why did this break" needs.
 */
export function buildCiUrl(mr: MrFields): string {
    if (mr.url === "") {
        return "";
    }
    return mr.provider === "github" ? `${mr.url}/checks` : `${mr.url}/pipelines`;
}

export function buildMrBlock(mr: MrFields, cacheAge: number): string {
    if (mr.iid === "") {
        return "";
    }
    const reference = mr.provider === "github" ? `#${mr.iid}` : `!${mr.iid}`;
    // The review state qualifies the reference — `#42 draft` names one thing, the
    // way `📁 repo` does — so a space binds them. CI is a separate fact about the
    // branch and takes the separator, as does every field after it.
    const state = buildMrState(mr);
    const head = `${MR}${maybeLink(mr.url, reference)}${RESET}${state === "" ? "" : ` ${state}`}`;

    const ci = CI_STATE_BY_PIPELINE[mr.pipeline];
    const notes = isNonNegativeInt(mr.notes) && Number(mr.notes) > 0 ? `${GRAY}💬 ${mr.notes}${RESET}` : "";

    return joinSegments([
        head,
        ci ? `${ci.color}${maybeLink(buildCiUrl(mr), ci.text)}${RESET}` : "",
        notes,
        cacheAge >= MR_STALE_NOTE ? `${DIM}${Math.trunc(cacheAge / 60)}m ago${RESET}` : ""
    ]);
}

/** Sanitizing the path is enough for a cache key; hashing would cost a process. */
export function cacheKey(value: string): string {
    const key = value.replace(/[^a-zA-Z0-9]/g, "_");
    return key.length > 100 ? key.slice(key.length - 100) : key;
}

/**
 * Path to a generated `.url` shortcut that opens `cwd` in VS Code, or "" when it
 * cannot be written.
 *
 * `vscode://file/...` is the direct way to open a folder in VS Code, and it is
 * unreachable from a hyperlink here — Windows Terminal refuses every scheme
 * outside http/https/file, so the click never reaches the registered `vscode:`
 * handler. A `.url` file gets the URL there anyway: it is inert data, `.url` is
 * bound to InternetShortcut on every Windows install, and opening one hands its
 * URL back to the shell, which dispatches `vscode:` to Code.exe. `.code-workspace`
 * was tried first and silently opened the wrong folder — its ProgID exists but no
 * extension is bound to it, so the click had no handler at all. Rewritten every
 * render rather than guarded by `existsSync`, so a change of format can never be
 * shadowed by a stale file left in the temp directory.
 */
function vscodeShortcutFile(cwd: string): string {
    const file = path.join(CACHE_DIR, `claude-open-${cacheKey(cwd)}.url`);
    const url = toFileUrl(cwd).replace("file:///", "vscode://file/");
    try {
        writeFileSync(file, `[InternetShortcut]\nURL=${url}\n`);
        return file;
    } catch {
        return "";
    }
}

// --- Line builders -----------------------------------------------------------

// Builders are named for what they say, not for the row they land on: the branch
// state moved onto its own row and renumbered everything below it once already.

export function buildSessionLine(sessionName: string, shortId: string): string {
    let line = sessionName !== "" ? `${SESSION}${sessionName}${RESET}` : "";
    if (shortId !== "") {
        if (line !== "") {
            line += " ";
        }
        line += `${GRAY}#${shortId}${RESET}`;
    }
    return line;
}

export function buildModelLine(model: string, effortLevel: string, accountLabel: string, accountColor: string): string {
    return joinSegments([
        `${ACCENT}${model}${RESET}`,
        effortLevel === "" ? "" : `${GRAY}<${effortLevel}>${RESET}`,
        `${accountColor}${accountLabel}${RESET}`
    ]);
}

export interface LocationLineInput {
    dir: string;
    /** `file:` URL of the working directory; clicking it opens Explorer there. */
    folderUrl: string;
    /** `file:` URL of the generated shortcut; clicking it opens VS Code there. */
    editorUrl: string;
    branch: string;
    mrBlock: string;
}

/** Where you are and what you are working on: directory, branch, MR/PR and its CI. */
export function buildLocationLine(input: LocationLineInput): string {
    const name = `📁 ${input.dir}`;
    // Two destinations for one directory: the name opens the folder, `IDE` opens
    // the editor. Both are fields in their own right, so both take the separator.
    const folder = maybeLink(input.folderUrl, name);
    const editor = input.editorUrl === "" ? "" : `${GRAY}${hyperlink(input.editorUrl, "IDE")}${RESET}`;
    return joinSegments([
        `${WHITE}${folder}${RESET}`,
        editor,
        input.branch === "" ? "" : `${GRAY}🔀 ${input.branch}${RESET}`,
        input.mrBlock
    ]);
}

export interface BranchStateInput {
    gitSigns: string;
    gitDirt: string[];
    fetchAge: string;
}

/**
 * How the branch stands: upstream relation, uncommitted work, fetch age. Split
 * off the location line because those three counts grow without bound during a
 * working session and used to push the MR reference off the right edge.
 */
export function buildBranchStateLine(input: BranchStateInput): string {
    return joinSegments([input.gitSigns, ...input.gitDirt, input.fetchAge]);
}

export interface UsageLineInput {
    sessionTokensIn: string;
    tokensK: string;
    ctxPct: string;
    usdDisplay: string;
    czkDisplay: string;
}

export function buildUsageLine(input: UsageLineInput): string {
    let contextColor = GRAY;
    if (isNonNegativeInt(input.sessionTokensIn)) {
        const tokens = Number(input.sessionTokensIn);
        if (tokens >= 180000) {
            contextColor = CONTEXT_RED;
        } else if (tokens >= 140000) {
            contextColor = CONTEXT_ORANGE;
        } else if (tokens >= 100000) {
            contextColor = CONTEXT_YELLOW;
        }
    }
    let context = `${contextColor}🔥 `;
    if (input.tokensK !== "") {
        context += `${input.tokensK}k`;
        if (isNonNegativeInt(input.ctxPct)) {
            context += ` (${input.ctxPct}%)`;
        }
    } else if (isNonNegativeInt(input.ctxPct)) {
        context += `${input.ctxPct}%`;
    }
    context += RESET;

    // Cost is DIM: it is a running total you check occasionally, not a state to
    // act on, and it sat at the same weight as the context gauge beside it.
    return joinSegments([
        context,
        input.usdDisplay === "" ? "" : `${DIM}$${input.usdDisplay}${RESET}`,
        input.usdDisplay === "" || input.czkDisplay === "" ? "" : `${DIM}${input.czkDisplay}${RESET}`
    ]);
    // Lines added/removed (`cost.total_lines_added` / `_removed`) used to close
    // this line as `+120 -34`. Dropped as noise — session-wide edit totals never
    // changed a decision. Restore by re-adding the two payload fields and an
    // `${ADD}+n${RESET} ${DEL}-n${RESET}` segment here.
}

export interface QuotaInput {
    fiveRaw: string;
    fiveResets: string;
    sevenRaw: string;
    sevenResets: string;
    /** Staleness applies only to the cache path; live stdin data is always current. */
    usageSource: "live" | "cache" | "";
    usageAgeSeconds: number;
    now?: number;
}

export function buildQuotaLine(input: QuotaInput): string {
    const now = input.now ?? nowSeconds();
    const isCache = input.usageSource === "cache" && isNonNegativeInt(input.usageAgeSeconds);
    const isStale = isCache && input.usageAgeSeconds > USAGE_STALE_SECONDS;
    const isOld = isCache && input.usageAgeSeconds > USAGE_WARN_SECONDS;

    const fivePct = formatPct(input.fiveRaw);
    const sevenPct = formatPct(input.sevenRaw);
    if (fivePct === "" || !isNonNegativeInt(fivePct)) {
        return "";
    }

    const label = isOld ? WARN : GRAY;
    const text = isOld ? WARN : "";

    // A reset countdown is a time value like any other, so it is DIM even while
    // the rest of the line is coral: knowing the window reopens in 1h 21m never
    // asks anything of you, and at WARN weight it competed with the percentage.
    const window = (name: string, pct: number, resets: string): string => {
        let segment = `${label}${name} ${progressBar(pct, 8)}${text} ${pct}%`;
        const countdown = timeUntil(resets, now);
        return countdown === "" ? segment : `${segment} ${DIM}${countdown}${RESET}`;
    };

    const five = Math.min(100, Number(fivePct));
    const seven = sevenPct !== "" && isNonNegativeInt(sevenPct) ? Math.min(100, Number(sevenPct)) : undefined;

    let line = isOld ? `${WARN}⚠ ` : "";
    line += window("5h", five, input.fiveResets);
    line += SEPARATOR;
    line += seven === undefined ? `${label}7d n/a` : window("7d", seven, input.sevenResets);

    if (isOld) {
        line += `${SEPARATOR}${WARN}${humanAge(input.usageAgeSeconds)} old ⚠${RESET}`;
    } else if (isStale) {
        line += `${SEPARATOR}${DIM}${humanAge(input.usageAgeSeconds)}${RESET}`;
    } else {
        line += RESET;
    }
    return line;
}

// --- Background workers ------------------------------------------------------

const SELF_PATH = fileURLToPath(import.meta.url);

/** Detached and unref'd so the worker outlives this render's process. */
function spawnDetached(command: string, args: string[]): void {
    try {
        spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
    } catch {
        // A render must never fail because a background refresh could not start.
    }
}

function spawnSelf(flag: string): void {
    spawnDetached(process.execPath, [SELF_PATH, flag]);
}

function getOauthToken(): string {
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
        return process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
    // Respect CLAUDE_CONFIG_DIR so each account (personal ~/.claude vs work
    // ~/.claude-work) reads its own token.
    const configDir = resolveConfigDir();
    for (const name of [".credentials.json", "credentials.json"]) {
        const file = path.join(configDir, name);
        if (!existsSync(file)) {
            continue;
        }
        try {
            const token = lookup(JSON.parse(readFileSync(file, "utf8")), ["claudeAiOauth", "accessToken"]);
            if (typeof token === "string" && token !== "") {
                return token;
            }
        } catch {
            // Unreadable or malformed credentials fall through to the next source.
        }
    }
    if (process.platform === "darwin") {
        try {
            const raw = execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"]
            });
            const token = lookup(JSON.parse(raw), ["claudeAiOauth", "accessToken"]);
            if (typeof token === "string" && token !== "") {
                return token;
            }
        } catch {
            // No Keychain entry.
        }
    }
    return "";
}

/**
 * Endpoint fetch -> cache. Runs ONLY as a detached child (never blocks/kills the
 * render) and ONLY as a cold-start fallback when stdin has no rate_limits yet.
 */
async function warmUsageCache(): Promise<void> {
    const token = getOauthToken();
    if (token === "") {
        return;
    }
    const paths = usagePaths(resolveAccountLabel(resolveConfigDir()));
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
        response = await fetch(USAGE_ENDPOINT, {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
                "anthropic-beta": "oauth-2025-04-20",
                "User-Agent": "claude-code/2.1.206"
            },
            signal: AbortSignal.timeout(4000)
        });
    } catch {
        return;
    }

    if (response.status === 200) {
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            return;
        }
        const five = field(body, ["five_hour", "utilization"]);
        const fiveResets = field(body, ["five_hour", "resets_at"]);
        const seven = field(body, ["seven_day", "utilization"]);
        const sevenResets = field(body, ["seven_day", "resets_at"]);
        if (five !== "") {
            try {
                writeFileSync(paths.cache, [five, fiveResets, seven, sevenResets].join(UNIT_SEPARATOR) + "\n");
                rmSync(paths.retry, { force: true });
            } catch {
                // A failed cache write just means the next render refetches.
            }
        }
        return;
    }

    // Honor a server Retry-After if present so we stay off the endpoint.
    const retryAfter = (response.headers.get("retry-after") ?? "").trim();
    if (/^[0-9]+$/.test(retryAfter) && Number(retryAfter) > 0) {
        const delay = Math.min(Number(retryAfter), USAGE_RETRY_CAP);
        try {
            writeFileSync(paths.retry, `${nowSeconds() + delay}\n`);
        } catch {
            // Non-fatal: we simply retry sooner than the server asked.
        }
    }
}

/** Rate-limited to WARM_MIN_INTERVAL and gated by any server cooldown. */
function maybeWarmUsage(paths: ReturnType<typeof usagePaths>): void {
    const now = nowSeconds();
    if (existsSync(paths.retry)) {
        const until = readFileOrEmpty(paths.retry).split("\n")[0]!;
        if (/^[0-9]+$/.test(until) && now < Number(until)) {
            return;
        }
    }
    const attemptedAt = mtimeSeconds(paths.attempt);
    if (attemptedAt !== undefined && now - attemptedAt < WARM_MIN_INTERVAL) {
        return;
    }
    try {
        writeFileSync(paths.attempt, "");
    } catch {
        return;
    }
    spawnSelf("--warm-usage");
}

async function warmCzkCache(): Promise<void> {
    try {
        const response = await fetch(FX_ENDPOINT, { signal: AbortSignal.timeout(3000) });
        if (!response.ok) {
            return;
        }
        const rate = lookup(await response.json(), ["rates", "CZK"]);
        if (rate === null || rate === undefined || rate === "") {
            return;
        }
        // Written to a sibling then renamed so a render never reads a half file.
        writeFileSync(`${CZK_CACHE}.tmp`, `${toDisplayString(rate)}\n`);
        renameSync(`${CZK_CACHE}.tmp`, CZK_CACHE);
    } catch {
        // Leave the previous cache in place.
    }
}

/**
 * Network-free in steady state: serve cache immediately, refresh in a detached
 * child when stale so the render never blocks on the FX call.
 */
function fetchUsdCzkRate(): string {
    if (existsSync(CZK_CACHE)) {
        const cached = readFileOrEmpty(CZK_CACHE).replace(/\n+$/, "");
        const age = nowSeconds() - (mtimeSeconds(CZK_CACHE) ?? 0);
        if (age >= CZK_CACHE_TTL) {
            spawnSelf("--warm-czk");
        }
        return cached;
    }
    // No cache yet — fetch once synchronously (rare), so a cold start still
    // shows a converted cost on the very first render.
    try {
        const raw = execFileSync("curl", ["-s", "--max-time", "3", FX_ENDPOINT], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"]
        });
        const rate = lookup(JSON.parse(raw), ["rates", "CZK"]);
        if (rate === null || rate === undefined || rate === "") {
            return "";
        }
        const value = toDisplayString(rate);
        writeFileSync(CZK_CACHE, `${value}\n`);
        return value;
    } catch {
        return "";
    }
}

// --- Render ------------------------------------------------------------------

function emit(line: string): string {
    const { text, truncated } = expandBackslashEscapes(line);
    return truncated ? text : `${text}\n`;
}

function render(): string {
    const fields = extractPayloadFields(readStdin());
    const maxContext = toNonNegativeInt(fields.maxContext, 200000);
    const shortId = fields.sessionId.slice(0, 8);
    const dir = basename(fields.cwd);
    const folderUrl = fields.cwd === "" ? "" : `${toFileUrl(fields.cwd)}/`;
    const shortcutFile = fields.cwd === "" ? "" : vscodeShortcutFile(fields.cwd);
    const editorUrl = shortcutFile === "" ? "" : toFileUrl(shortcutFile);

    const accountLabel = resolveAccountLabel(resolveConfigDir());
    const accountColor = accountLabel === "Work" ? WORK : PERSONAL;

    const git = readGitStatus(fields.cwd);
    const branch = git?.branch ?? "";
    const gitSigns = git ? buildGitSigns(git) : "";
    const gitDirt = git ? buildGitDirt(git) : [];

    // --- Session cost (USD + CZK) ---
    let usdDisplay = "";
    let czkDisplay = "";
    if (fields.sessionCostUsdRaw !== "" && fields.sessionCostUsdRaw !== "null") {
        usdDisplay = roundN(fields.sessionCostUsdRaw, 3);
        if (usdDisplay !== "") {
            const rate = fetchUsdCzkRate();
            if (rate !== "" && rate !== "null") {
                czkDisplay = `${formatFixed(numericPrefix(usdDisplay) * numericPrefix(rate), 2)}Kč`;
            }
        }
    }

    // --- Quota utilization (5h + 7d) ---
    // Source order: (1) stdin rate_limits — live, no network; (2) cached
    // last-known (covers the seconds before a fresh session's first API
    // response). The endpoint is only ever touched by a background warm when we
    // have neither.
    const usage = usagePaths(accountLabel);
    let { fiveRaw, fiveResets, sevenRaw, sevenResets } = fields;
    let usageSource: "live" | "cache" | "" = "";
    let usageAgeSeconds = 0;

    if (fiveRaw !== "") {
        usageSource = "live";
        try {
            writeFileSync(usage.cache, [fiveRaw, fiveResets, sevenRaw, sevenResets].join(UNIT_SEPARATOR) + "\n");
        } catch {
            // Losing the cache write only costs the next cold start.
        }
    } else if (existsSync(usage.cache)) {
        [fiveRaw, fiveResets, sevenRaw, sevenResets] = readFields(
            readFileOrEmpty(usage.cache).split("\n")[0]!,
            4
        ) as [string, string, string, string];
        usageSource = "cache";
        const cachedAt = mtimeSeconds(usage.cache);
        if (cachedAt !== undefined) {
            usageAgeSeconds = nowSeconds() - cachedAt;
        }
    }

    // Cold start (no live data and no fresh cache) -> warm in the background.
    if (usageSource !== "live" && (fiveRaw === "" || usageAgeSeconds > USAGE_STALE_SECONDS)) {
        maybeWarmUsage(usage);
    }

    const quotaLine = buildQuotaLine({
        fiveRaw,
        fiveResets,
        sevenRaw,
        sevenResets,
        usageSource,
        usageAgeSeconds
    });

    // --- Context tokens + %: from stdin, fall back to tokens/max ---
    let ctxPct = formatPct(fields.contextUsedPct);
    if (!isNonNegativeInt(ctxPct) && isNonNegativeInt(fields.sessionTokensIn)) {
        ctxPct = maxContext === 0 ? "" : String(Math.trunc((Number(fields.sessionTokensIn) * 100) / maxContext));
    }
    if (isNonNegativeInt(ctxPct) && Number(ctxPct) > 100) {
        ctxPct = "100";
    }
    const tokensK = isNonNegativeInt(fields.sessionTokensIn)
        ? String(Math.trunc((Number(fields.sessionTokensIn) + 500) / 1000))
        : "";

    // --- MR/PR block + fetch age ---
    // Pure cache read plus a possible detached spawn: the render itself never
    // touches the network, since Claude Code cancels a status line that blocks.
    let mrBlock = "";
    let fetchAge = "";
    if (branch !== "") {
        const key = cacheKey(`${fields.cwd}|${branch}`);
        const mrCache = path.join(CACHE_DIR, `claude-mr-${key}.tsv`);
        const mrAttempt = path.join(CACHE_DIR, `claude-mr-attempt-${key}`);

        const mr = existsSync(mrCache)
            ? parseMrCacheLine(readFileOrEmpty(mrCache).split("\n")[0]!)
            : EMPTY_MR_FIELDS;

        const now = nowSeconds();
        const cacheAge = isNonNegativeInt(mr.timestamp) ? now - Number(mr.timestamp) : 999999;

        if (cacheAge >= MR_TTL) {
            // The marker's own mtime would need an extra stat, so it carries its
            // timestamp as its contents instead.
            const attemptTimestamp = existsSync(mrAttempt) ? readFileOrEmpty(mrAttempt).split("\n")[0]! : "";
            const attemptAge = isNonNegativeInt(attemptTimestamp) ? now - Number(attemptTimestamp) : 999999;
            if (attemptAge >= MR_ATTEMPT_MIN) {
                try {
                    writeFileSync(mrAttempt, String(now));
                } catch {
                    // Without the marker we just retry on the next render.
                }
                const refresher = path.join(path.dirname(SELF_PATH), "status-line-mr-refresh.sh");
                if (existsSync(refresher)) {
                    spawnDetached("bash", [refresher, fields.cwd, branch, mrCache]);
                }
            }
        }

        fetchAge = buildFetchAge(mr.fetchEpoch, now);
        mrBlock = buildMrBlock(mr, cacheAge);
    }

    const lines = [
        buildSessionLine(fields.sessionName, shortId),
        buildModelLine(fields.model, fields.effortLevel, accountLabel, accountColor),
        buildLocationLine({ dir, folderUrl, editorUrl, branch, mrBlock }),
        buildBranchStateLine({ gitSigns, gitDirt, fetchAge }),
        buildUsageLine({ sessionTokensIn: fields.sessionTokensIn, tokensK, ctxPct, usdDisplay, czkDisplay }),
        quotaLine
    ];
    // A row with nothing to say is dropped rather than emitted blank — outside a
    // repo the branch state has no content at all.
    return lines.filter((line) => line !== "").map(emit).join("");
}

/**
 * Both sides are compared through realpath because Claude Code invokes this via
 * `~/.claude/scripts`, which is a symlink to the repo. Node resolves
 * `import.meta.url` to the link target while `process.argv[1]` keeps the link
 * path, so a plain string compare silently fails and the status line renders
 * nothing at all.
 */
function isEntryPoint(): boolean {
    const invoked = process.argv[1];
    if (!invoked) {
        return false;
    }
    return resolveRealPath(invoked) === resolveRealPath(SELF_PATH);
}

function resolveRealPath(target: string): string {
    try {
        return realpathSync(path.resolve(target));
    } catch {
        return path.resolve(target);
    }
}

if (isEntryPoint()) {
    const flag = process.argv[2];
    if (flag === "--warm-usage") {
        await warmUsageCache();
    } else if (flag === "--warm-czk") {
        await warmCzkCache();
    } else {
        process.stdout.write(render());
    }
}
