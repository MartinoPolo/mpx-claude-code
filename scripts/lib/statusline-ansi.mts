// Shared primitives for the two status-line renderers (status-line.mts and
// subagent-status-line.mts). Deliberately tiny: the two renderers have almost
// no overlap beyond ANSI emission, stdin handling, cache-file reads, and the
// integer guard that stands in for the bash `[[ $x =~ ^[0-9]+$ ]]` test they
// both leaned on.

import { readFileSync } from "node:fs";

export const RESET = "\x1b[0m";

/**
 * Weight, not hue — the one emphasis that survives a recolor. Reserved for a
 * field that has to be found before the eye has read anything else; every other
 * rank on both renderers is carried by color alone.
 */
export const BOLD = "\x1b[1m";

// GRAY, DIM and AMBER used to live here as fixed xterm-256 indices, alongside an
// `fg(code)` helper that emitted them. They are now derived per scheme in
// terminal-theme.mts and emitted as 24-bit color by its `rgb()` — GRAY and DIM in
// particular are blends of the scheme's own foreground toward its background, so
// they cannot be constants. Their meanings are unchanged and documented there:
// GRAY is default text, DIM one step back for facts that are context rather than
// signal, and AMBER marks a fact you did not choose and would want to catch.

// Effort levels, weakest to strongest — a filled/empty gauge reads instantly
// where the old `<high>` word had to be parsed. Five slots because Claude Code
// has five levels; daily driving tops out at high (three filled).
const EFFORT_RANK: Readonly<Record<string, number>> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
const EFFORT_SLOTS = 5;

/**
 * `high` -> `◆◆◆◇◇`; an unrecognized level keeps the old `<level>` spelling.
 *
 * Shared by both renderers: the main bar states the session's level once, the
 * tasks panel repeats it down a column, and a level has to mean the same shape
 * in both or the eye has to learn two scales.
 */
export function effortGauge(level: string): string {
    const rank = EFFORT_RANK[level];
    if (rank === undefined) {
        return level === "" ? "" : `<${level}>`;
    }
    return "◆".repeat(rank) + "◇".repeat(EFFORT_SLOTS - rank);
}

/**
 * Rendered column width of a status-line string — what the terminal advances the
 * cursor by — so a caller can right-align other content against it. Zero-cell
 * sequences are removed first: OSC-8 hyperlink wrappers (the visible label
 * between them is kept) and SGR color runs. Each surviving code point then counts
 * as one cell, except the ones this bar draws double-width — Private Use Area
 * Nerd Font icons (branch, VS Code, console, pencil) and real emoji (💬), which
 * Symbols Nerd Font / the emoji face draw into two cells.
 *
 * The double-width set is deliberately over-inclusive rather than exact: a line
 * measured too *narrow* lets right-aligned content run past the margin and wrap,
 * which breaks the whole layout, while measuring an icon row a cell too *wide*
 * only shifts that row's right column left by a cell. Every non-PUA, non-emoji
 * glyph the bar uses (◆ ◇ █ ░ ≡ · ✓ × ⠀ Σ ↑ ↓ ±) is single-width and verified
 * against the terminal face, so the default of one is correct for them.
 */
export function visibleWidth(input: string): number {
    const stripped = input
        // OSC sequences (incl. the OSC-8 open `ESC]8;;URL BEL` and close
        // `ESC]8;; BEL`), terminated by BEL or ST — the label between two of them
        // is ordinary text and survives.
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
        .replace(/\x1b\[[0-9;]*m/g, "");
    let width = 0;
    for (const character of stripped) {
        width += isDoubleWidth(character.codePointAt(0)!) ? 2 : 1;
    }
    return width;
}

/** The code points this bar draws into two cells: PUA icons and emoji. */
function isDoubleWidth(codePoint: number): boolean {
    return (
        (codePoint >= 0xe000 && codePoint <= 0xf8ff) || // BMP Private Use Area
        (codePoint >= 0xf0000 && codePoint <= 0xffffd) || // Supplementary PUA-A
        (codePoint >= 0x100000 && codePoint <= 0x10fffd) || // Supplementary PUA-B
        codePoint >= 0x1f000 // emoji planes
    );
}

/** Sanitizing the path is enough for a cache key; hashing would cost a process. */
export function cacheKey(value: string): string {
    const key = value.replace(/[^a-zA-Z0-9]/g, "_");
    return key.length > 100 ? key.slice(key.length - 100) : key;
}

/** Cache reads are best-effort everywhere: an absent cache is a cold start, not an error. */
export function readFileOrEmpty(file: string): string {
    try {
        return readFileSync(file, "utf8");
    } catch {
        return "";
    }
}

/**
 * Reads the whole of stdin. Claude Code always delivers one JSON object and
 * closes, so a single blocking read is correct and avoids the async plumbing.
 */
export function readStdin(): string {
    try {
        return readFileSync(0, "utf8");
    } catch {
        return "";
    }
}

/**
 * The bash scripts gate nearly every numeric render on `=~ ^[0-9]+$`, which
 * rejects negatives, decimals, empty strings and the literal "null". Keeping
 * that exact predicate is what makes the ported output byte-identical.
 */
export function isNonNegativeInt(value: unknown): value is number {
    if (typeof value === "number") {
        return Number.isInteger(value) && value >= 0;
    }
    return typeof value === "string" && /^[0-9]+$/.test(value);
}

/** Coerces to a non-negative integer, or returns `fallback` when the guard fails. */
export function toNonNegativeInt(value: unknown, fallback: number): number {
    return isNonNegativeInt(value) ? Number(value) : fallback;
}
