// Shared primitives for the two status-line renderers (status-line.mts and
// subagent-status-line.mts). Deliberately tiny: the two renderers have almost
// no overlap beyond ANSI emission, stdin handling, and the integer guard that
// stands in for the bash `[[ $x =~ ^[0-9]+$ ]]` test they both leaned on.

import { readFileSync } from "node:fs";

export const RESET = "\x1b[0m";

/** 256-color foreground escape. Mirrors the bash `$'\033[38;5;Nm'` literals. */
export function fg(code: number): string {
    return `\x1b[38;5;${code}m`;
}

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
