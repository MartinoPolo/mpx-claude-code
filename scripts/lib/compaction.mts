// Compaction history, shared by both status-line renderers. Claude Code writes
// one `compact_boundary` line into a session's transcript every time that
// session compacts, and sub-agents write their own into their own transcripts,
// so a single reader serves the main bar and the tasks panel alike.
//
// The read is incremental. A transcript reaches tens of megabytes in a long
// session and the renderers run on every tick, so a cache remembers the byte
// offset already scanned and each tick parses only what was appended since.
// A cold start on a 16 MB transcript costs one full pass; every tick after it
// costs the handful of bytes one turn adds.

import { closeSync, openSync, readSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readFileOrEmpty } from "./statusline-ansi.mts";

/**
 * Tokens Claude Code withholds from `autoCompactWindow` before auto-compaction
 * fires: a 20k reserve for the model's own output plus a 13k compaction buffer.
 * Read off the 2.1.220 bundle, where the trigger is
 * `window - min(maxOutputTokens, 20000) - 13000`, and confirmed against a real
 * boundary — a 213,000 window tripped at `preTokens: 181,106`.
 *
 * It is an offset, not a fraction: moving the trigger by 20k means moving
 * `autoCompactWindow` by 20k, not scaling it.
 */
export const AUTO_COMPACT_RESERVE = 33000;

/** Rows of history the renderers show before collapsing the rest into a count. */
export const COMPACTION_ROWS = 3;

export interface CompactionEvent {
    /** "auto" or "manual" — the only two values Claude Code emits. */
    trigger: string;
    preTokens: number;
    postTokens: number;
    /** ISO-8601, as written. Formatted to a local clock only at render time, so
     *  a cached history survives a timezone change. */
    timestamp: string;
}

/**
 * The token count at which auto-compaction fires. `autoCompactWindow` caps the
 * window the math runs against, so a 1M model with a 233,000 window compacts at
 * 200,000 rather than near a million.
 */
export function autoCompactLimit(contextWindowSize: number, autoCompactWindow: number): number {
    const window = autoCompactWindow > 0 ? Math.min(contextWindowSize, autoCompactWindow) : contextWindowSize;
    return Math.max(0, window - AUTO_COMPACT_RESERVE);
}

/** `~/.claude/projects/<slug>/<session>.jsonl` -> that session's sub-agent transcript. */
export function subagentTranscriptPath(sessionTranscript: string, agentId: string): string {
    if (sessionTranscript === "" || agentId === "") {
        return "";
    }
    const directory = path.dirname(sessionTranscript);
    const session = path.basename(sessionTranscript).replace(/\.jsonl$/, "");
    return path.join(directory, session, "subagents", `agent-${agentId}.jsonl`);
}

/**
 * Parses one transcript line. The substring test comes first because a cold
 * start feeds every line of the file through here and `JSON.parse` on a 16 MB
 * transcript is the one cost worth avoiding.
 */
export function parseCompactionEvent(line: string): CompactionEvent | undefined {
    if (!line.includes("compact_boundary")) {
        return undefined;
    }
    let entry: unknown;
    try {
        entry = JSON.parse(line);
    } catch {
        return undefined;
    }
    const record = entry as { subtype?: unknown; timestamp?: unknown; compactMetadata?: Record<string, unknown> };
    if (record.subtype !== "compact_boundary") {
        return undefined;
    }
    const meta = record.compactMetadata;
    if (meta === null || typeof meta !== "object") {
        return undefined;
    }
    return {
        trigger: meta.trigger === "auto" ? "auto" : "manual",
        preTokens: typeof meta.preTokens === "number" ? meta.preTokens : 0,
        postTokens: typeof meta.postTokens === "number" ? meta.postTokens : 0,
        timestamp: typeof record.timestamp === "string" ? record.timestamp : ""
    };
}

/** Cache line format: `trigger<TAB>pre<TAB>post<TAB>timestamp`, after a lone offset line. */
function serializeCache(offset: number, events: CompactionEvent[]): string {
    const rows = events.map((event) => [event.trigger, event.preTokens, event.postTokens, event.timestamp].join("\t"));
    return [String(offset), ...rows].join("\n") + "\n";
}

function parseCache(text: string): { offset: number; events: CompactionEvent[] } | undefined {
    const lines = text.split("\n");
    const offset = Number(lines[0]);
    if (!Number.isInteger(offset) || offset < 0) {
        return undefined;
    }
    const events: CompactionEvent[] = [];
    for (const line of lines.slice(1)) {
        if (line === "") continue;
        const [trigger, pre, post, timestamp] = line.split("\t");
        if (trigger === undefined || timestamp === undefined) continue;
        events.push({ trigger, preTokens: Number(pre) || 0, postTokens: Number(post) || 0, timestamp });
    }
    return { offset, events };
}

/**
 * Reads `[from, to)` and parses the whole lines in it. A tick can land midway
 * through a line Claude Code is still writing, so the trailing partial is left
 * unconsumed and re-read next time rather than parsed and lost.
 */
function scanRange(file: string, from: number, to: number): { events: CompactionEvent[]; consumed: number } {
    const length = to - from;
    if (length <= 0) {
        return { events: [], consumed: 0 };
    }
    let read = 0;
    const buffer = Buffer.allocUnsafe(length);
    let handle: number | undefined;
    try {
        handle = openSync(file, "r");
        read = readSync(handle, buffer, 0, length, from);
    } catch {
        return { events: [], consumed: 0 };
    } finally {
        if (handle !== undefined) {
            try {
                closeSync(handle);
            } catch {
                // A leaked descriptor outlives this process by microseconds.
            }
        }
    }
    const text = buffer.toString("utf8", 0, read);
    const lastBreak = text.lastIndexOf("\n");
    if (lastBreak === -1) {
        return { events: [], consumed: 0 };
    }
    const complete = text.slice(0, lastBreak);
    const events: CompactionEvent[] = [];
    for (const line of complete.split("\n")) {
        const event = parseCompactionEvent(line);
        if (event !== undefined) {
            events.push(event);
        }
    }
    // Byte length, not character count: the offset indexes the file, and one
    // emoji in a tool result would otherwise drift it permanently.
    return { events, consumed: Buffer.byteLength(complete, "utf8") + 1 };
}

/**
 * Every compaction the transcript records, oldest first. Returns `[]` for a
 * transcript that does not exist, which is the normal case for a session that
 * has never compacted and for every sub-agent that stayed under the limit.
 */
export function readCompactionHistory(transcriptPath: string, cachePath: string): CompactionEvent[] {
    if (transcriptPath === "") {
        return [];
    }
    let size: number;
    try {
        size = statSync(transcriptPath).size;
    } catch {
        return [];
    }

    let offset = 0;
    let events: CompactionEvent[] = [];
    const cached = parseCache(readFileOrEmpty(cachePath));
    // A cache ahead of the file means the transcript was replaced or truncated
    // (a resumed session forks a new file), so the scan restarts from zero.
    if (cached !== undefined && cached.offset <= size) {
        offset = cached.offset;
        events = cached.events;
    }

    if (offset < size) {
        const scanned = scanRange(transcriptPath, offset, size);
        if (scanned.consumed > 0) {
            events = events.concat(scanned.events);
            offset += scanned.consumed;
            try {
                writeFileSync(cachePath, serializeCache(offset, events));
            } catch {
                // Losing the cache write only costs a rescan on the next tick.
            }
        }
    }
    return events;
}

export interface CompactionTally {
    auto: number;
    manual: number;
}

export const NO_COMPACTIONS: CompactionTally = { auto: 0, manual: 0 };

/**
 * How many of each trigger. The main bar's ledger has one line per agent and no
 * room for the full history the tasks panel draws, and after the fact the count
 * is the part that still means something: three auto-compactions says the agent
 * was given more than it could hold, whichever tokens it shed and when.
 */
export function countCompactions(events: readonly CompactionEvent[]): CompactionTally {
    let auto = 0;
    for (const event of events) {
        if (event.trigger === "auto") {
            auto += 1;
        }
    }
    return { auto, manual: events.length - auto };
}

// --- Rendering ---------------------------------------------------------------

/** `227148` -> `227k`, right-aligned so the arrows line up down the column. */
export function formatTokensK(tokens: number): string {
    return `${Math.round(tokens / 1000)}k`.padStart(4);
}

/** ISO-8601 -> local `HH:MM`. Local, because "when was I away" is a wall-clock question. */
export function formatClock(timestamp: string): string {
    const at = new Date(timestamp);
    if (Number.isNaN(at.getTime())) {
        return "";
    }
    return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

export interface CompactionStyle {
    /** Tree glyphs — structure, never signal. */
    tree: string;
    /** `auto`: the one you did not choose, and the only thing here worth catching. */
    auto: string;
    /** `manual`: you were there when it happened. */
    manual: string;
    /** The `227k -> 11k` change. */
    tokens: string;
    /** Wall clock — the least important field on the row. */
    time: string;
    reset: string;
}

/**
 * One row per compaction, oldest first, under the context line that owns them.
 * A long session compacts more times than a status line has room for, so only
 * the last `COMPACTION_ROWS` are spelled out and the rest collapse into a count
 * — the recent ones are what tell you whether the session you came back to is
 * still the session you left.
 */
export function buildCompactionLines(
    events: CompactionEvent[],
    indent: string,
    style: CompactionStyle,
    maxRows: number = COMPACTION_ROWS
): string[] {
    if (events.length === 0) {
        return [];
    }
    const shown = events.slice(-maxRows);
    const hidden = events.length - shown.length;
    const lines: string[] = [];

    if (hidden > 0) {
        lines.push(`${indent}${style.tree}├─ ${hidden} earlier${style.reset}`);
    }
    shown.forEach((event, index) => {
        const isLast = index === shown.length - 1;
        const glyph = `${style.tree}${isLast ? "└─" : "├─"}${style.reset}`;
        const label = event.trigger === "auto" ? style.auto : style.manual;
        const change = `${formatTokensK(event.preTokens)} → ${formatTokensK(event.postTokens)}`;
        const clock = formatClock(event.timestamp);
        let line = `${indent}${glyph} ${label}${event.trigger.padEnd(6)}${style.reset}`;
        line += ` ${style.tokens}·${style.reset} ${style.tokens}${change}${style.reset}`;
        if (clock !== "") {
            line += ` ${style.time}·${style.reset} ${style.time}${clock}${style.reset}`;
        }
        lines.push(line);
    });
    return lines;
}
