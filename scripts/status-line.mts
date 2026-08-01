#!/usr/bin/env node
// Claude Code `statusLine` renderer: one JSON object on stdin, the rendered
// status text on stdout. It is re-run on every render tick, so the render path
// stays cheap — a single git call, cache reads, and nothing else. Claude Code
// cancels a status line that blocks, so every network touch is pushed into a
// detached child (`--warm-usage`, `--warm-czk`, status-line-mr-refresh.sh) that
// only ever writes a cache for a *later* render to pick up.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { connect as connectTls } from "node:tls";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    BOLD,
    RESET,
    cacheKey,
    effortGauge,
    isNonNegativeInt,
    readFileOrEmpty,
    readStdin,
    toNonNegativeInt
} from "./lib/statusline-ansi.mts";
import { loadPalette } from "./lib/terminal-theme.mts";
import {
    type CompactionStyle,
    type CompactionTally,
    NO_COMPACTIONS,
    autoCompactLimit,
    buildCompactionLines,
    countCompactions,
    readCompactionHistory,
    subagentTranscriptPath
} from "./lib/compaction.mts";
import {
    AGENT_TYPE_ROWS,
    DRIFT,
    DRIFT_MARKER,
    type SubagentSummary,
    TIER_COLORS,
    agentDefinitionPath,
    capitalize,
    countLabel,
    formatDuration,
    formatTokens,
    readSessionRecords,
    readSubagentMeta,
    sessionStateFile,
    statusStyle,
    summarizeFinishedAgents
} from "./lib/subagent-history.mts";

export { cacheKey };

// --- Theme -------------------------------------------------------------------

/**
 * Every color below is derived from the terminal's own color scheme and the
 * launching account's background, rather than being a fixed xterm-256 index —
 * see lib/terminal-theme.mts for why, and for the blend factors that keep the
 * default scheme looking exactly as it did before. Switching scheme in Windows
 * Terminal now recolors the bar; the hue picker that used to live here (`COLOR`
 * plus a nine-entry ACCENT_BY_THEME table) is gone, because the scheme is the
 * single place that choice belongs.
 */
const PALETTE = loadPalette();

const GRAY = PALETTE.gray;
const DIM = PALETTE.dim;
const AMBER = PALETTE.amber;

const ACCENT = PALETTE.accent;
const BAR_EMPTY = PALETTE.barEmpty;

/**
 * Brightest foreground, spent on the one field that answers "where am I" — the
 * directory name. Everything else on that line is gray, so the eye lands there
 * first without any glyph or box drawing to carry the emphasis.
 */
const WHITE = PALETTE.white;

/** Warning color for a state the user has to act on (coral red). */
const WARN = PALETTE.warn;

// Age notes — "last fetched 3d ago", "this cache is 11m old" — are always DIM,
// never WARN. They answer "how much do I trust the number beside me", which is
// context, not a call to action; coloring them as warnings trains the eye to
// ignore coral everywhere else. The one exception is the quota line, where an
// age past USAGE_WARN_SECONDS means the percentages themselves are wrong.

// Context-consumption escalation (absolute input tokens): the 🔥 token count
// shifts yellow -> orange -> red as context fills, so a heavy session is
// obvious at a glance.
const CONTEXT_YELLOW = PALETTE.contextYellow; // >=100k tokens
const CONTEXT_ORANGE = PALETTE.contextOrange; // >=140k tokens
const CONTEXT_RED = PALETTE.contextRed; // >=180k tokens

/**
 * Compaction history ranks its own fields: `auto` is the only thing on the row
 * you did not decide, so it is the only thing that gets a color of its own.
 * `manual`, the token change and the tree glyphs stay at reading weight, and the
 * clock drops to DIM — knowing a compaction happened at 11:48 rather than 11:12
 * never changes what you do next.
 */
const COMPACTION_STYLE: CompactionStyle = {
    tree: DIM,
    auto: AMBER,
    manual: GRAY,
    tokens: GRAY,
    time: DIM,
    reset: RESET
};

// Account colors — distinct from ACCENT and from each other, so
// model/account/work-vs-personal all read as separate signals at a glance.
const PERSONAL = PALETTE.personal; // green
const WORK = PALETTE.work; // orange

// Line-edit colors: green additions, red deletions.
const ADD = PALETTE.add;
const DEL = PALETTE.del;

// Git/MR colors: sand for "never left this machine" (local branch, draft MR),
// blue for the MR/PR reference itself.
const LOCAL = PALETTE.local;
const DRAFT = PALETTE.local;
const MR = PALETTE.mr;

/**
 * Session name (line 1): bold magenta. It is the title of the thing you are
 * looking at, so it is the one field allowed weight as well as hue — every
 * other rank on this bar is carried by color alone. Lavender fg(141) sat too
 * close to the panel's `max` effort purple to read as a heading of its own.
 */
const SESSION = `${BOLD}${PALETTE.session}`;

// --- Glyph vocabulary --------------------------------------------------------

// The terminal font is Cascadia Mono NF (installed 2026-07-30, set in Windows
// Terminal settings.json), which carries the full Nerd Font symbol set in the
// Private Use Area on top of glyphs identical to plain Cascadia Mono. That is
// what licenses the two pictograms below; every other glyph on the bar
// (≡ ◆ ◇ █ ░ ↑ ↓ ·) was verified against plain Cascadia Mono's cmap, so a
// fallback to the non-NF font degrades only the two icons, not the layout.
//
// Anything outside that verified set font-falls-back to Segoe UI Emoji, which
// draws double-width into the one cell the terminal reserved and smears over
// the neighbouring text — the reason ✎ ⟳ ⊘ ⇅ ✗ ✔ were purged, and the reason
// new glyphs get added to the cmap probe in the docs before they get used here.

/** Git branch glyph (U+E725, Nerd Font devicons) — compact and centred, unlike the full-height powerline U+E0A0 it replaced. */
const BRANCH_ICON = "";

/** VS Code logo (U+F0A1E, Nerd Font Material Design set) — drawn larger than the devicon U+E70C it replaced. */
const VSCODE_ICON = "󰨞";

/** Pencil (U+F03EB, Nerd Font Material Design set) — the edit-this-config click target beside the dev-server ports. */
const PENCIL_ICON = "󰏫";

/**
 * Braille pattern blank (U+2800): the first character of any indented row.
 * Claude Code trims whitespace off each status-line row before rendering it, so
 * an indent made of plain spaces never reaches the screen. U+2800 draws as an
 * empty cell but is not whitespace to any trim, and once it survives as the
 * first character the ordinary spaces behind it are interior and safe.
 */
export const INDENT_GUARD = "⠀";

/**
 * "Opus 5 (1M context)" -> "Opus 5 (1M)". The payload's display_name spells the
 * enlarged window out in words; the number alone says the same thing.
 */
export function trimModelName(model: string): string {
    return model.replace(/\((\d+[KMG]?) context\)/i, "($1)");
}

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

/**
 * `autoCompactWindow` from settings.json — the window auto-compaction measures
 * against, which for a 1M model is the only number that governs anything. Absent
 * or malformed falls back to 0, which leaves the model's own window in charge.
 */
function readAutoCompactWindow(configDir: string): number {
    try {
        const settings = JSON.parse(readFileOrEmpty(path.join(configDir, "settings.json"))) as {
            autoCompactWindow?: unknown;
        };
        return toNonNegativeInt(settings.autoCompactWindow, 0);
    } catch {
        return 0;
    }
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

/**
 * `color` defaults to ACCENT for the quota bars, whose hue means nothing beyond
 * "this is a bar". The context bar passes its own escalating color instead, so
 * the bar and the token count beside it always agree.
 */
export function progressBar(pct: number, width = 10, color: string = ACCENT): string {
    const filled = Math.trunc((pct * width) / 100);
    let out = "";
    for (let i = 0; i < width; i++) {
        out += i < filled ? `${color}█${RESET}` : `${BAR_EMPTY}░${RESET}`;
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
    transcriptPath: string;
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
        transcriptPath: field(root, ["transcript_path"]),
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

/**
 * The branch-state line is deliberately quiet: it restates work you already
 * know about (you made those edits), so everything routine is DIM and symbolic
 * — `≡` in sync, `+n` staged, `!n` modified, `?n` untracked. Color survives
 * only where git is telling you something you might not know: a diverged or
 * deleted upstream, a conflict, an unpushed/unpulled count.
 *
 * An unpushed count links to `compareUrl` when the caller has one: commits
 * ahead of the default branch are the ones a PR would carry, so the count is
 * the natural place to click through to the compare view.
 */
export function buildGitSigns(status: GitStatus, compareUrl = ""): string {
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
    const unpushed = (color: string, label: string): string =>
        `${color}${compareUrl === "" ? label : hyperlink(compareUrl, label)}${RESET}`;
    if (status.ahead > 0 && status.behind > 0) {
        return unpushed(WARN, `↑${status.ahead}↓${status.behind}`);
    }
    if (status.ahead > 0) {
        return unpushed(ADD, `↑${status.ahead}`);
    }
    if (status.behind > 0) {
        return `${DEL}↓${status.behind}${RESET}`;
    }
    return `${DIM}≡${RESET}`;
}

/** One segment per non-zero count; the caller joins them. */
export function buildGitDirt(status: GitStatus): string[] {
    if (status.branch === "") {
        return [];
    }
    const segments: string[] = [];
    if (status.staged > 0) {
        segments.push(`${DIM}+${status.staged}${RESET}`);
    }
    if (status.unstaged > 0) {
        segments.push(`${DIM}!${status.unstaged}${RESET}`);
    }
    if (status.untracked > 0) {
        segments.push(`${DIM}?${status.untracked}${RESET}`);
    }
    if (status.conflicts > 0) {
        segments.push(`${WARN}~${status.conflicts}${RESET}`);
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

// --- Worktree awareness --------------------------------------------------------

export interface WorktreePaths {
    commonDir: string;
    toplevel: string;
}

/** The two lines `git rev-parse --git-common-dir --show-toplevel` prints, in order. */
export function parseWorktreePaths(output: string): WorktreePaths | undefined {
    const [commonDir = "", toplevel = ""] = output.split("\n").map((line) => line.trim());
    return commonDir === "" || toplevel === "" ? undefined : { commonDir, toplevel };
}

/** Case- and separator-insensitive path equality, because git mixes `/` into Windows paths. */
function samePath(a: string, b: string): boolean {
    const normalize = (value: string) => path.resolve(value).replace(/\\/g, "/").toLowerCase();
    return normalize(a) === normalize(b);
}

export interface ProjectLocation {
    projectName: string;
    projectUrl: string;
    /** Both empty when the cwd is the main checkout rather than a linked worktree. */
    worktreeName: string;
    worktreeUrl: string;
    /** Main project folder — the stable identity used to key dev-server config. */
    projectDir: string;
}

/**
 * In a linked worktree the shared `.git` lives under the *main* checkout, so
 * `dirname(--git-common-dir)` is the original project folder while
 * `--show-toplevel` is the worktree — when the two differ, both get named and
 * both get a link. In the main checkout (or outside git) the location is just
 * the cwd, exactly as before.
 */
export function resolveProjectLocation(cwd: string, worktree: WorktreePaths | undefined): ProjectLocation {
    const plain: ProjectLocation = {
        projectName: basename(cwd),
        projectUrl: cwd === "" ? "" : `${toFileUrl(cwd)}/`,
        worktreeName: "",
        worktreeUrl: "",
        projectDir: cwd
    };
    if (worktree === undefined) {
        return plain;
    }
    const mainProjectDir = path.dirname(worktree.commonDir);
    if (samePath(mainProjectDir, worktree.toplevel)) {
        return plain;
    }
    return {
        projectName: basename(mainProjectDir),
        projectUrl: `${toFileUrl(mainProjectDir)}/`,
        worktreeName: basename(worktree.toplevel),
        worktreeUrl: `${toFileUrl(worktree.toplevel)}/`,
        projectDir: mainProjectDir
    };
}

/** One extra fast git call (~10ms), only made when the cwd is already known to be a repo. */
function readWorktreePaths(cwd: string): WorktreePaths | undefined {
    try {
        const output = execFileSync(
            "git",
            ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"],
            { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
        );
        return parseWorktreePaths(output);
    } catch {
        return undefined;
    }
}

// --- Remote branch -------------------------------------------------------------

/**
 * The remote's web root — `https://host/owner/repo`, no trailing slash — or ""
 * when the remote is missing or unparseable. Handles the three spellings git
 * remotes come in: scp-like `git@host:owner/repo.git`, `ssh://git@host/owner/repo`,
 * and plain `http(s)://`.
 */
function remoteWebRoot(remote: string): string {
    let url = remote.trim();
    if (url === "") {
        return "";
    }
    const scpLike = url.match(/^[\w.+-]+@([^:/]+):(.+)$/);
    if (scpLike) {
        url = `https://${scpLike[1]}/${scpLike[2]}`;
    }
    url = url
        .replace(/^(?:ssh|git):\/\/(?:[\w.+-]+@)?/, "https://")
        .replace(/^https:\/\/([^/:]+):\d+\//, "https://$1/") // ssh port, meaningless over https
        .replace(/\.git$/, "")
        .replace(/\/+$/, "");
    return /^https?:\/\/[^/]+\/./.test(url) ? url : "";
}

/**
 * Views live at different depths per host: GitLab nests them under `/-/`,
 * GitHub and everything else serve `/tree/…` and `/compare/…` directly.
 */
function webViewPath(webRoot: string, view: "tree" | "compare"): string {
    return /^https?:\/\/[^/]*gitlab/i.test(webRoot) ? `/-/${view}/` : `/${view}/`;
}

/** Encoded per segment: slashes in a branch name stay path separators. */
function encodeBranchPath(branch: string): string {
    return branch.split("/").map(encodeURIComponent).join("/");
}

/** Web URL of `branch` on the remote the `origin` URL points at, or "". */
export function buildBranchUrl(remote: string, branch: string): string {
    const webRoot = remoteWebRoot(remote);
    if (webRoot === "" || branch === "") {
        return "";
    }
    return webRoot + webViewPath(webRoot, "tree") + encodeBranchPath(branch);
}

/**
 * Web URL of the `base...head` compare view — the page that lists the commits
 * `head` carries on top of `base` and offers to open a PR/MR from them. "" when
 * the remote is unparseable or the two branches are the same, which compares to
 * nothing.
 */
export function buildCompareUrl(remote: string, base: string, head: string): string {
    const webRoot = remoteWebRoot(remote);
    if (webRoot === "" || base === "" || head === "" || base === head) {
        return "";
    }
    return `${webRoot}${webViewPath(webRoot, "compare")}${encodeBranchPath(base)}...${encodeBranchPath(head)}`;
}

/**
 * The remote's default branch from `git for-each-ref` output over
 * `refs/remotes/origin/{HEAD,main,master}`, formatted `%(refname:short)\t%(symref:short)`.
 * `origin/HEAD` sorts first and wins when the clone recorded one; the usual
 * names are the fallback for clones that did not.
 */
export function parseDefaultBranch(output: string): string {
    for (const line of output.split("\n")) {
        const [name = "", symref = ""] = line.split("\t");
        const target = symref === "" ? name : symref; // only origin/HEAD is symbolic
        if (target.startsWith("origin/") && target !== "origin/HEAD") {
            return target.slice("origin/".length);
        }
    }
    return "";
}

/** Refs only, never the network — a status line may not wait on a remote. */
function defaultBranch(cwd: string): string {
    try {
        const output = execFileSync(
            "git",
            [
                "-C",
                cwd,
                "for-each-ref",
                "--format=%(refname:short)\t%(symref:short)",
                "refs/remotes/origin/HEAD",
                "refs/remotes/origin/main",
                "refs/remotes/origin/master"
            ],
            { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
        );
        return parseDefaultBranch(output);
    } catch {
        return "";
    }
}

/**
 * The `origin` URLs for a live checkout, from a single `remote get-url` call.
 * The compare view costs one further ref read, so it is resolved only when the
 * caller has something to compare — an unpushed commit.
 */
function remoteUrls(cwd: string, branch: string, wantCompare: boolean): { branchUrl: string; compareUrl: string } {
    if (cwd === "" || branch === "") {
        return { branchUrl: "", compareUrl: "" };
    }
    let remote = "";
    try {
        remote = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"]
        }).trim();
    } catch {
        return { branchUrl: "", compareUrl: "" };
    }
    return {
        branchUrl: buildBranchUrl(remote, branch),
        compareUrl: wantCompare ? buildCompareUrl(remote, defaultBranch(cwd), branch) : ""
    };
}

// --- Dev servers ---------------------------------------------------------------

// Which ports belong to which project cannot be detected — a dev server is
// usually a `node` grandchild whose working directory Windows will not cheaply
// reveal — so it is declared once in statusline-projects.json at the repo root,
// keyed by main project folder name (worktrees inherit their project's ports).

const PORT_PROBE_TTL = 15; // seconds between background port probes
const PORT_PROBE_TIMEOUT_MS = 400;

/** Computed lazily because SELF_PATH is declared further down the file. */
function portsConfigPath(): string {
    return path.resolve(path.dirname(SELF_PATH), "..", "statusline-projects.json");
}

function devServerPortsFor(projectName: string): number[] {
    if (projectName === "") {
        return [];
    }
    try {
        const config = JSON.parse(readFileOrEmpty(portsConfigPath())) as unknown;
        const ports = lookup(config, ["devServers", projectName]);
        return Array.isArray(ports) ? ports.filter((port) => isNonNegativeInt(port)).map(Number) : [];
    } catch {
        return [];
    }
}

/** The protocol a listening dev server turned out to speak. */
export type PortScheme = "http" | "https";

/**
 * Scheme per port from the last background probe. A port that was down — or has
 * never been probed, the cache being absent — is simply missing from the map.
 */
export function parsePortSchemes(cacheContents: string): Map<number, PortScheme> {
    const schemes = new Map<number, PortScheme>();
    for (const line of cacheContents.split("\n")) {
        const [port, state] = line.split(UNIT_SEPARATOR);
        if (isNonNegativeInt(port) && (state === "http" || state === "https")) {
            schemes.set(Number(port), state);
        }
    }
    return schemes;
}

/**
 * `:8100`-style segments: green while the server answers, DIM while it does
 * not, and a browser link either way — Windows Terminal opens http links in
 * the default browser, and clicking a dead one just shows the browser's
 * connection error, which is a fine way to learn the server is down.
 *
 * The link carries the scheme the probe saw the server speak. It matters: an
 * `http://` request to a TLS listener is answered with zero bytes, which the
 * browser reports as ERR_EMPTY_RESPONSE rather than as the wrong scheme. A port
 * that is down has no known scheme and falls back to `http`.
 *
 * `configUrl` links to statusline-projects.json, where the ports live: a bare
 * pencil closes a configured list, and a project with no ports at all gets a
 * dim `pencil ports` hint instead, so the config is one click away either way.
 * The pencil glyph is double-width (Symbols Nerd Font), so a plain space always
 * follows it — provided by the label here, by the separator or line end after
 * a trailing segment.
 */
export function buildDevServerSegments(
    ports: readonly number[],
    portSchemes: ReadonlyMap<number, PortScheme>,
    configUrl: string
): string[] {
    const segments = ports.map((port) => {
        const scheme = portSchemes.get(port);
        const color = scheme === undefined ? DIM : ADD;
        return `${color}${hyperlink(`${scheme ?? "http"}://localhost:${port}`, `:${port}`)}${RESET}`;
    });
    if (configUrl === "") {
        return segments;
    }
    const pencilLabel = ports.length === 0 ? `${PENCIL_ICON} ports` : PENCIL_ICON;
    return [...segments, `${DIM}${hyperlink(configUrl, pencilLabel)}${RESET}`];
}

/**
 * TCP probe against localhost, resolving to the scheme the listener speaks, or
 * "" when nothing is there — refused and ignored alike, within the timeout.
 *
 * The host is `localhost` rather than 127.0.0.1 because a dev server may bind
 * ::1 only; Node's happy-eyeballs (autoSelectFamily, on by default since 20)
 * then tries both address families instead of reporting an IPv6-only server as
 * down. Once connected, a TLS handshake over the same connection decides the
 * scheme: a handshake the listener completes means https, one it rejects or
 * ignores means a plain http server received a ClientHello it could not parse.
 */
function probePort(port: number): Promise<PortScheme | ""> {
    return new Promise((resolve) => {
        const socket = connect({ port, host: "localhost" });
        let connected = false;
        let settled = false;
        const finish = (scheme: PortScheme | "") => {
            if (settled) {
                return;
            }
            settled = true;
            socket.destroy();
            resolve(scheme);
        };
        socket.setTimeout(PORT_PROBE_TIMEOUT_MS);
        socket.once("timeout", () => finish(""));
        socket.once("error", () => finish(connected ? "http" : ""));
        socket.once("connect", () => {
            connected = true;
            socket.setTimeout(0); // the TLS socket owns the deadline from here
            const secure = connectTls({ socket, servername: "localhost", rejectUnauthorized: false });
            secure.setTimeout(PORT_PROBE_TIMEOUT_MS);
            secure.once("secureConnect", () => finish("https"));
            secure.once("timeout", () => finish("http"));
            secure.once("error", () => finish("http"));
        });
    });
}

/** Runs only as a detached child (`--warm-ports <cacheFile> <csv>`), like the other warmers. */
async function warmPortsCache(cacheFile: string, portsCsv: string): Promise<void> {
    const ports = portsCsv.split(",").filter((port) => isNonNegativeInt(port)).map(Number);
    if (ports.length === 0) {
        return;
    }
    const results = await Promise.all(ports.map(probePort));
    const lines = ports.map((port, index) => `${port}${UNIT_SEPARATOR}${results[index] || "down"}`);
    try {
        writeFileSync(cacheFile, lines.join("\n") + "\n");
    } catch {
        // A failed write only means the ports stay at their last known state.
    }
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

/**
 * Path to a generated `.url` shortcut that opens `folder` in VS Code, or "" when
 * it cannot be written. Called once per rendered VS Code icon — the cwd always,
 * plus the main checkout when the cwd is a linked worktree.
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
function vscodeShortcutFile(folder: string): string {
    const file = path.join(CACHE_DIR, `claude-open-${cacheKey(folder)}.url`);
    const url = toFileUrl(folder).replace("file:///", "vscode://file/");
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

/**
 * Account · title · id: whose session, what it is about, how to refer to it.
 * The id links to the transcript `.jsonl` when its path is known, so the raw
 * session log is one click away from the very identifier that names it.
 */
export function buildSessionLine(
    accountLabel: string,
    accountColor: string,
    sessionName: string,
    shortId: string,
    transcriptUrl: string
): string {
    return joinSegments([
        `${accountColor}${accountLabel}${RESET}`,
        sessionName === "" ? "" : `${SESSION}${sessionName}${RESET}`,
        shortId === "" ? "" : `${GRAY}${maybeLink(transcriptUrl, `#${shortId}`)}${RESET}`
    ]);
}

export function buildModelLine(model: string, effortLevel: string): string {
    return joinSegments([
        `${ACCENT}${trimModelName(model)}${RESET}`,
        effortLevel === "" ? "" : `${GRAY}${effortGauge(effortLevel)}${RESET}`
    ]);
}

export interface LocationLineInput {
    /** Main project folder name; in a worktree this is the *original* project. */
    projectName: string;
    /** `file:` URL of the main project folder; clicking it opens Explorer there. */
    projectUrl: string;
    /** Worktree folder name, or "" when the cwd is the main checkout. */
    worktreeName: string;
    /** `file:` URL of the worktree folder. */
    worktreeUrl: string;
    /** `file:` URL of a shortcut opening VS Code at the main project folder. */
    projectEditorUrl: string;
    /** `file:` URL of a shortcut opening VS Code at the cwd; "" outside a worktree. */
    worktreeEditorUrl: string;
    branch: string;
    /** Web URL of the branch on its remote host; "" leaves the branch unlinked. */
    branchUrl: string;
    /** Pre-colored, pre-linked `:port` segments for this project's dev servers. */
    devServers: string[];
    mrBlock: string;
}

/**
 * Where you are and what you are working on: project (slash worktree), branch,
 * dev servers, MR/PR and its CI. In a worktree the two path halves are separate
 * click targets — the project name opens the original folder, the worktree name
 * opens the worktree — and the worktree half takes WHITE because it, not the
 * project, answers "where am I". Each half carries its own VS Code icon, so
 * both the original checkout and the worktree are one click away in the editor.
 */
export function buildLocationLine(input: LocationLineInput): string {
    // The icon always keeps a plain space on each side: the VS Code glyph comes
    // from the double-width Symbols Nerd Font fallback and paints into the cell
    // after its own, so any visible character glued to it would get smeared.
    const editorIcon = (url: string) =>
        url === "" ? "" : ` ${GRAY}${hyperlink(url, VSCODE_ICON)}${RESET} `;
    const project = maybeLink(input.projectUrl, input.projectName);
    const name = (
        input.worktreeName === ""
            ? `${WHITE}${project}${RESET}${editorIcon(input.projectEditorUrl)}`
            : `${GRAY}${project}${RESET}${editorIcon(input.projectEditorUrl)}${GRAY}/${RESET}` +
              `${WHITE}${maybeLink(input.worktreeUrl, input.worktreeName)}${RESET}${editorIcon(input.worktreeEditorUrl)}`
    ).trimEnd();
    return joinSegments([
        name,
        input.branch === "" ? "" : `${GRAY}${BRANCH_ICON} ${maybeLink(input.branchUrl, input.branch)}${RESET}`,
        ...input.devServers,
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
 * Indented under the location line the way compaction rows nest under the
 * usage line: visually a detail *of* the row above, not a peer.
 */
export function buildBranchStateLine(input: BranchStateInput): string {
    const line = joinSegments([input.gitSigns, ...input.gitDirt, input.fetchAge]);
    return line === "" ? "" : `${INDENT_GUARD}   ${line}`;
}

export interface UsageLineInput {
    sessionTokensIn: string;
    tokensK: string;
    ctxPct: string;
    usdDisplay: string;
    czkDisplay: string;
    /** Tokens at which auto-compaction fires; 0 renders no bar. */
    compactLimit?: number;
}

/**
 * Context escalation, as a fraction of the auto-compaction limit rather than the
 * old absolute 100k/140k/180k. At the default 200,000 limit the cut-offs land on
 * exactly those numbers, so nothing moves on screen — but they now follow
 * `autoCompactWindow` instead of silently meaning less every time it is raised.
 */
const CONTEXT_YELLOW_FRACTION = 0.5;
const CONTEXT_ORANGE_FRACTION = 0.7;
const CONTEXT_RED_FRACTION = 0.9;

export function buildUsageLine(input: UsageLineInput): string {
    const compactLimit = input.compactLimit ?? 0;
    const tokens = isNonNegativeInt(input.sessionTokensIn) ? Number(input.sessionTokensIn) : undefined;
    const scale = compactLimit > 0 ? compactLimit : 200000;

    let contextColor = GRAY;
    if (tokens !== undefined) {
        if (tokens >= scale * CONTEXT_RED_FRACTION) {
            contextColor = CONTEXT_RED;
        } else if (tokens >= scale * CONTEXT_ORANGE_FRACTION) {
            contextColor = CONTEXT_ORANGE;
        } else if (tokens >= scale * CONTEXT_YELLOW_FRACTION) {
            contextColor = CONTEXT_YELLOW;
        }
    }
    // No flame: the escalating color plus the bar carry the "how hot" signal,
    // and the emoji was the loudest thing on a line that is mostly bookkeeping.
    let contextText = "";
    if (input.tokensK !== "") {
        contextText = `${input.tokensK}k`;
        if (isNonNegativeInt(input.ctxPct)) {
            contextText += ` (${input.ctxPct}%)`;
        }
    } else if (isNonNegativeInt(input.ctxPct)) {
        contextText = `${input.ctxPct}%`;
    }
    const context = contextText === "" ? "" : `${contextColor}${contextText}${RESET}`;

    // The bar measures against the auto-compaction limit, not the model window:
    // a bar creeping toward 1M said nothing, because nothing happens at 1M. Full
    // bar now means compaction is about to fire, which is the only threshold on
    // this line anyone acts on. The percentage beside it still reads against the
    // model window, so the two answer different questions on purpose.
    let bar = "";
    if (compactLimit > 0 && tokens !== undefined) {
        bar = progressBar(Math.min(100, Math.trunc((tokens * 100) / compactLimit)), 10, contextColor);
    }

    // Cost is DIM: it is a running total you check occasionally, not a state to
    // act on, and it sat at the same weight as the context gauge beside it.
    return joinSegments([
        [context, bar].filter((part) => part !== "").join(" "),
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

/** Where the `5h`/`7d` labels lead: the account's usage page on claude.ai. */
const USAGE_DASHBOARD_URL = "https://claude.ai/settings/usage";

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
    // Each window label links to the usage dashboard, where these two numbers
    // live with their full history.
    const window = (name: string, pct: number, resets: string): string => {
        let segment = `${label}${hyperlink(USAGE_DASHBOARD_URL, name)} ${progressBar(pct, 8)}${text} ${pct}%`;
        const countdown = timeUntil(resets, now);
        return countdown === "" ? segment : `${segment} ${DIM}${countdown}${RESET}`;
    };

    const five = Math.min(100, Number(fivePct));
    const seven = sevenPct !== "" && isNonNegativeInt(sevenPct) ? Math.min(100, Number(sevenPct)) : undefined;

    let line = isOld ? `${WARN}⚠ ` : "";
    line += window("5h", five, input.fiveResets);
    line += SEPARATOR;
    line +=
        seven === undefined
            ? `${label}${hyperlink(USAGE_DASHBOARD_URL, "7d")} n/a`
            : window("7d", seven, input.sevenResets);

    if (isOld) {
        line += `${SEPARATOR}${WARN}${humanAge(input.usageAgeSeconds)} old ⚠${RESET}`;
    } else if (isStale) {
        line += `${SEPARATOR}${DIM}${humanAge(input.usageAgeSeconds)}${RESET}`;
    } else {
        line += RESET;
    }
    return line;
}

export interface SubagentLineInput {
    summary: SubagentSummary;
    /** The *session* transcript; each agent's own sits beneath it. */
    sessionTranscript: string;
    /** The `.md` that defines an agent type, or "" when the type has no file. */
    agentDefinition: (agentType: string) => string;
    /** How often one agent compacted. Called only for agents that get a row. */
    compactions: (agentId: string) => CompactionTally;
}

/** Widths the detail rows pad to. The name and tier columns size themselves. */
const AGENT_EFFORT_WIDTH = 5; // one gauge: ◆◆◇◇◇
const AGENT_DURATION_WIDTH = 6; // 1h06m
const AGENT_TOKENS_WIDTH = 7; // 612.4k

/**
 * Every sub-agent that has *finished* this session: a tally row — how many, of
 * which tiers, for how many tokens each tier cost, and which agent types they
 * were — followed by one row per agent for the handful worth spelling out.
 *
 * Rendered last, so it sits directly above the tasks panel: the ledger and the
 * live view read as one block, and the block grows downward into empty terminal
 * rather than pushing the quota bars around as agents accumulate.
 *
 * The tasks panel below this bar owns the live view and evicts a task 30s after
 * it ends, so before these rows a completed agent left no trace anywhere.
 * Running agents are deliberately absent: the panel is on screen for exactly as
 * long as one is alive, so including them would double up while it runs and
 * still say nothing once it stops.
 *
 * Two different links, because a name and a run are two different questions. An
 * agent *type* — on the tally and at the head of each row — opens the file that
 * defines it, which is where its model and effort are set and the only place a
 * surprise on this bar can be fixed. A single *run* hangs off its own status
 * glyph, which is the one cell on the row that belongs to that run alone.
 */
export function buildSubagentLine(input: SubagentLineInput): string[] {
    const { summary } = input;
    if (summary.agents === 0) {
        return [];
    }

    // Tokens per tier rather than one total: what a session spent is only worth
    // reading next to what it spent it on, and the sum of the parts is still
    // right there to be added up.
    const tiers = summary.tiers
        .map((group) => {
            const color = TIER_COLORS[group.label] ?? GRAY;
            return `${color}${countLabel(group.count, capitalize(group.label))} ${DIM}${formatTokens(group.tokens)}${RESET}`;
        })
        .join(" ");

    const shownTypes = summary.types.slice(0, AGENT_TYPE_ROWS);
    const types = shownTypes.map((group) => {
        const name = group.count === 1 ? group.label : countLabel(group.count, group.label);
        // Same `!` the tasks panel prefixes a drifted cell with, and the same
        // red — a rule broken means one thing on both renderers. Here it names
        // the agent that broke it, which the tier tally beside it cannot.
        const label = group.drifted ? `${DRIFT_MARKER}${name}` : name;
        return `${group.drifted ? DRIFT : GRAY}${maybeLink(definitionUrl(input, group.label), label)}${RESET}`;
    });
    const hiddenTypes = summary.types.length - shownTypes.length;
    if (hiddenTypes > 0) {
        types.push(`${DIM}+${hiddenTypes}${RESET}`);
    }

    // DIM throughout: this is a ledger you consult, never a state to act on —
    // the same weight the compaction history and the cost totals carry. The tier
    // counts keep their palette because that is the one comparison worth making
    // at a glance.
    const lines = [
        joinSegments([
            `${DIM}Σ ${summary.agents} agent${summary.agents === 1 ? "" : "s"}${RESET}`,
            tiers,
            types.join(" ")
        ])
    ];

    // Both columns size to the widest value actually on screen: an all-`Explore`
    // session should not be indented for the width of `mp-reviewer-security`,
    // and the gauges still have to start at one column so their filled slots
    // compare down the block.
    const nameWidth = Math.max(...summary.rows.map((agent) => agent.type.length));
    const tierWidth = Math.max(...summary.rows.map((agent) => agent.tier.length + (agent.drifted ? 1 : 0)));
    for (const agent of summary.rows) {
        lines.push(buildAgentRow(agent, nameWidth, tierWidth, input));
    }
    if (summary.hiddenRows > 0) {
        lines.push(`${INDENT_GUARD} ${DIM}+${summary.hiddenRows} more${RESET}`);
    }
    return lines;
}

function definitionUrl(input: SubagentLineInput, agentType: string): string {
    const definition = input.agentDefinition(agentType);
    return definition === "" ? "" : toFileUrl(definition);
}

function buildAgentRow(
    agent: SubagentSummary["rows"][number],
    nameWidth: number,
    tierWidth: number,
    input: SubagentLineInput
): string {
    const status = statusStyle(agent.status);
    const transcript = subagentTranscriptPath(input.sessionTranscript, agent.id);
    const runUrl = transcript === "" || !existsSync(transcript) ? "" : toFileUrl(transcript);

    const tierText = `${agent.drifted ? DRIFT_MARKER : ""}${agent.tier}`;
    const tierColor = agent.drifted ? DRIFT : (TIER_COLORS[agent.tier] ?? GRAY);

    // Padded outside the link, so the underline a terminal draws on hover covers
    // the name and not the empty column behind it.
    const name = maybeLink(definitionUrl(input, agent.type), agent.type) + " ".repeat(nameWidth - agent.type.length);

    let row =
        `${INDENT_GUARD} ${status.color}${maybeLink(runUrl, status.glyph)}${RESET}` +
        ` ${GRAY}${name}${RESET}` +
        ` ${tierColor}${tierText.padEnd(tierWidth)}${RESET}` +
        ` ${DIM}${effortGauge(agent.effort).padEnd(AGENT_EFFORT_WIDTH)}${RESET}` +
        ` ${DIM}${formatDuration(agent.elapsedMs).padStart(AGENT_DURATION_WIDTH)}${RESET}` +
        ` ${GRAY}${formatTokens(agent.tokens).padStart(AGENT_TOKENS_WIDTH)}${RESET}`;

    // Counts, not the tasks panel's full history: after the fact, three
    // auto-compactions says the agent was handed more than it could hold, and
    // which tokens it shed at 14:02 no longer changes anything.
    const { auto, manual } = input.compactions(agent.id);
    if (auto > 0) {
        row += ` ${AMBER}${countLabel(auto, "auto")}${RESET}`;
    }
    if (manual > 0) {
        row += ` ${GRAY}${countLabel(manual, "manual")}${RESET}`;
    }
    return row;
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

function spawnSelf(...args: string[]): void {
    spawnDetached(process.execPath, [SELF_PATH, ...args]);
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
    const cwdShortcut = fields.cwd === "" ? "" : vscodeShortcutFile(fields.cwd);
    const cwdEditorUrl = cwdShortcut === "" ? "" : toFileUrl(cwdShortcut);

    const accountLabel = resolveAccountLabel(resolveConfigDir());
    const accountColor = accountLabel === "Work" ? WORK : PERSONAL;

    const git = readGitStatus(fields.cwd);
    const branch = git?.branch ?? "";
    const remote = remoteUrls(fields.cwd, branch, (git?.ahead ?? 0) > 0);
    const gitSigns = git ? buildGitSigns(git, remote.compareUrl) : "";
    const gitDirt = git ? buildGitDirt(git) : [];

    const location = resolveProjectLocation(fields.cwd, branch === "" ? undefined : readWorktreePaths(fields.cwd));

    // In a worktree the cwd shortcut belongs to the worktree half; the project
    // half gets its own shortcut into the original checkout.
    const inWorktree = location.worktreeName !== "";
    const projectShortcut = inWorktree ? vscodeShortcutFile(location.projectDir) : "";
    const projectEditorUrl = inWorktree
        ? projectShortcut === ""
            ? ""
            : toFileUrl(projectShortcut)
        : cwdEditorUrl;
    const worktreeEditorUrl = inWorktree ? cwdEditorUrl : "";

    // --- Dev servers: cached probe results, refreshed by a detached child ---
    const devServerPorts = devServerPortsFor(location.projectName);
    let devServers: string[] = [];
    if (location.projectName !== "") {
        const portsConfigUrl = existsSync(portsConfigPath()) ? toFileUrl(portsConfigPath()) : "";
        let portSchemes: ReadonlyMap<number, PortScheme> = new Map();
        if (devServerPorts.length > 0) {
            const portsCache = path.join(CACHE_DIR, `claude-ports-${cacheKey(location.projectDir)}.tsv`);
            const probedAt = mtimeSeconds(portsCache);
            if (probedAt === undefined || nowSeconds() - probedAt >= PORT_PROBE_TTL) {
                spawnSelf("--warm-ports", portsCache, devServerPorts.join(","));
            }
            portSchemes = parsePortSchemes(readFileOrEmpty(portsCache));
        }
        devServers = buildDevServerSegments(devServerPorts, portSchemes, portsConfigUrl);
    }

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

    // --- Compaction history ---
    // Pure incremental file read: the transcript is already on disk, so unlike
    // the MR block this needs no child process and no network.
    const compactLimit = autoCompactLimit(maxContext, readAutoCompactWindow(resolveConfigDir()));
    const compactions =
        fields.transcriptPath === ""
            ? []
            : readCompactionHistory(
                  fields.transcriptPath,
                  path.join(CACHE_DIR, `claude-compact-${cacheKey(fields.transcriptPath)}.tsv`)
              );

    // --- Sub-agent history ---
    // Two cheap reads: the tasks panel's own session state file, plus one small
    // `agent-<id>.meta.json` per finished agent. No network, no child process,
    // and nothing at all when the session has spawned no agents.
    const configDir = resolveConfigDir();
    const subagentRecords = readSessionRecords(sessionStateFile(configDir, fields.sessionId));
    const subagents = summarizeFinishedAgents(subagentRecords, (agentId) =>
        readSubagentMeta(fields.transcriptPath, agentId)
    );
    // Only the agents that get a row of their own are scanned for compactions,
    // so a session with forty finished agents still costs at most five reads —
    // and each is the same incremental, cached scan the compaction history above
    // already pays for the main transcript.
    const subagentLines = buildSubagentLine({
        summary: subagents,
        sessionTranscript: fields.transcriptPath,
        agentDefinition: (agentType) => agentDefinitionPath(agentType, fields.cwd, configDir),
        compactions: (agentId): CompactionTally => {
            const transcript = subagentTranscriptPath(fields.transcriptPath, agentId);
            if (transcript === "") {
                return NO_COMPACTIONS;
            }
            return countCompactions(
                readCompactionHistory(transcript, path.join(CACHE_DIR, `claude-compact-${cacheKey(transcript)}.tsv`))
            );
        }
    });

    const transcriptUrl = fields.transcriptPath === "" ? "" : toFileUrl(fields.transcriptPath);
    const lines = [
        buildSessionLine(accountLabel, accountColor, fields.sessionName, shortId, transcriptUrl),
        buildModelLine(fields.model, fields.effortLevel),
        buildLocationLine({
            projectName: location.projectName,
            projectUrl: location.projectUrl,
            worktreeName: location.worktreeName,
            worktreeUrl: location.worktreeUrl,
            projectEditorUrl,
            worktreeEditorUrl,
            branch,
            branchUrl: remote.branchUrl,
            devServers,
            mrBlock
        }),
        buildBranchStateLine({ gitSigns, gitDirt, fetchAge }),
        buildUsageLine({ sessionTokensIn: fields.sessionTokensIn, tokensK, ctxPct, usdDisplay, czkDisplay, compactLimit }),
        ...buildCompactionLines(compactions, `${INDENT_GUARD} `, COMPACTION_STYLE),
        quotaLine,
        ...subagentLines
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
    } else if (flag === "--warm-ports") {
        await warmPortsCache(process.argv[3] ?? "", process.argv[4] ?? "");
    } else {
        process.stdout.write(render());
    }
}
