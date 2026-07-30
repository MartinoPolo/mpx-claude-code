// Shared primitives for the two status-line renderers (status-line.mts and
// subagent-status-line.mts). Deliberately tiny: the two renderers have almost
// no overlap beyond ANSI emission, stdin handling, cache-file reads, and the
// integer guard that stands in for the bash `[[ $x =~ ^[0-9]+$ ]]` test they
// both leaned on.

import { readFileSync } from "node:fs";

export const RESET = "\x1b[0m";

/** 256-color foreground escape. Mirrors the bash `$'\033[38;5;Nm'` literals. */
export function fg(code: number): string {
    return `\x1b[38;5;${code}m`;
}

/**
 * Weight, not hue — the one emphasis that survives a recolor. Reserved for a
 * field that has to be found before the eye has read anything else; every other
 * rank on both renderers is carried by color alone.
 */
export const BOLD = "\x1b[1m";

/** Gray used for default text in both renderers. */
export const GRAY = fg(245);

/**
 * One step darker than GRAY, for facts that are context rather than signal —
 * how stale a cache is, how long ago a fetch ran, the sub-agent session tally.
 * Reserving a dimmer shade for "you never need to act on this" is what lets the
 * eye skip it, so both renderers have to use the same one.
 */
export const DIM = fg(240);

/**
 * Amber: a fact you did not choose and would want to catch. Already the hue the
 * tasks panel uses to qualify an inherited effort level; the compaction history
 * reuses it for `auto`, which is the same kind of statement — this happened
 * without you.
 */
export const AMBER = fg(214);

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
