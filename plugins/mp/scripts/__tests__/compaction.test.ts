import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    AUTO_COMPACT_RESERVE,
    autoCompactLimit,
    buildCompactionLines,
    formatClock,
    formatTokensK,
    parseCompactionEvent,
    readCompactionHistory,
    subagentTranscriptPath
} from "../lib/compaction.mts";

const RESET = "\x1b[0m";
const GRAY = "\x1b[38;5;245m";
const DIM = "\x1b[38;5;240m";
const AMBER = "\x1b[38;5;214m";

const STYLE = { tree: DIM, auto: AMBER, manual: GRAY, tokens: GRAY, time: DIM, reset: RESET };

/** A real boundary line, trimmed of the fields the renderers never read. */
function boundary(trigger: string, preTokens: number, postTokens: number, timestamp: string): string {
    return JSON.stringify({
        type: "system",
        subtype: "compact_boundary",
        content: "Conversation compacted",
        compactMetadata: { trigger, preTokens, postTokens, cumulativeDroppedTokens: preTokens - postTokens },
        timestamp
    });
}

/** ISO string for a local wall-clock time, so the assertion is timezone-independent. */
function localIso(hours: number, minutes: number): string {
    const at = new Date(2026, 6, 16, hours, minutes, 0);
    return at.toISOString();
}

describe("autoCompactLimit", () => {
    it("subtracts the reserve from autoCompactWindow when that window is the smaller", () => {
        expect(autoCompactLimit(1000000, 233000)).toBe(200000);
    });

    it("uses the model window when it is smaller than autoCompactWindow", () => {
        expect(autoCompactLimit(200000, 233000)).toBe(200000 - AUTO_COMPACT_RESERVE);
    });

    it("falls back to the model window when no autoCompactWindow is configured", () => {
        expect(autoCompactLimit(200000, 0)).toBe(167000);
    });

    it("never returns a negative limit", () => {
        expect(autoCompactLimit(10000, 20000)).toBe(0);
    });
});

describe("parseCompactionEvent", () => {
    it("reads trigger, both token counts and the timestamp", () => {
        expect(parseCompactionEvent(boundary("auto", 205000, 15000, "2026-07-16T06:50:00.000Z"))).toEqual({
            trigger: "auto",
            preTokens: 205000,
            postTokens: 15000,
            timestamp: "2026-07-16T06:50:00.000Z"
        });
    });

    it("treats any trigger that is not exactly auto as manual", () => {
        expect(parseCompactionEvent(boundary("manual", 1, 1, "x"))?.trigger).toBe("manual");
        expect(parseCompactionEvent(boundary("something-new", 1, 1, "x"))?.trigger).toBe("manual");
    });

    it("ignores ordinary transcript lines, including ones that merely mention compaction", () => {
        expect(parseCompactionEvent('{"type":"user","message":"tell me about compact_boundary"}')).toBeUndefined();
        expect(parseCompactionEvent('{"type":"assistant"}')).toBeUndefined();
        expect(parseCompactionEvent("not json at all")).toBeUndefined();
        expect(parseCompactionEvent("")).toBeUndefined();
    });

    it("survives a boundary whose metadata is missing the token counts", () => {
        const line = JSON.stringify({ subtype: "compact_boundary", compactMetadata: { trigger: "auto" } });
        expect(parseCompactionEvent(line)).toEqual({ trigger: "auto", preTokens: 0, postTokens: 0, timestamp: "" });
    });
});

describe("subagentTranscriptPath", () => {
    it("points at the agent file beside the session transcript", () => {
        const derived = subagentTranscriptPath("/p/projects/slug/abc-123.jsonl", "a77f7ecdb4b8f2a5c");
        expect(derived).toBe(path.join("/p/projects/slug/abc-123", "subagents", "agent-a77f7ecdb4b8f2a5c.jsonl"));
    });

    it("returns empty when either half is unknown", () => {
        expect(subagentTranscriptPath("", "agent")).toBe("");
        expect(subagentTranscriptPath("/p/a.jsonl", "")).toBe("");
    });
});

describe("readCompactionHistory", () => {
    let directory: string;
    let transcript: string;
    let cache: string;

    beforeEach(() => {
        directory = mkdtempSync(path.join(tmpdir(), "compaction-"));
        transcript = path.join(directory, "session.jsonl");
        cache = path.join(directory, "cache.tsv");
    });

    afterEach(() => {
        rmSync(directory, { recursive: true, force: true });
    });

    it("returns nothing for a transcript that does not exist", () => {
        expect(readCompactionHistory(path.join(directory, "absent.jsonl"), cache)).toEqual([]);
    });

    it("returns nothing for a session that never compacted", () => {
        writeFileSync(transcript, '{"type":"user"}\n{"type":"assistant"}\n');
        expect(readCompactionHistory(transcript, cache)).toEqual([]);
    });

    it("finds every boundary, oldest first", () => {
        writeFileSync(
            transcript,
            [
                '{"type":"user"}',
                boundary("manual", 227148, 11300, "2026-07-16T06:26:17.738Z"),
                '{"type":"assistant"}',
                boundary("auto", 239984, 8692, "2026-07-16T11:48:31.840Z"),
                ""
            ].join("\n")
        );
        const events = readCompactionHistory(transcript, cache);
        expect(events.map((event) => `${event.trigger}:${event.preTokens}`)).toEqual(["manual:227148", "auto:239984"]);
    });

    it("picks up boundaries appended after the first read without rescanning", () => {
        writeFileSync(transcript, boundary("manual", 100000, 5000, "2026-07-16T06:00:00.000Z") + "\n");
        expect(readCompactionHistory(transcript, cache)).toHaveLength(1);

        appendFileSync(transcript, boundary("auto", 200000, 9000, "2026-07-16T09:00:00.000Z") + "\n");
        const events = readCompactionHistory(transcript, cache);
        expect(events).toHaveLength(2);
        expect(events[1]?.trigger).toBe("auto");
    });

    it("leaves a half-written trailing line for the next tick", () => {
        const complete = boundary("manual", 100000, 5000, "2026-07-16T06:00:00.000Z");
        const partial = boundary("auto", 200000, 9000, "2026-07-16T09:00:00.000Z");
        writeFileSync(transcript, `${complete}\n${partial.slice(0, 40)}`);
        expect(readCompactionHistory(transcript, cache)).toHaveLength(1);

        writeFileSync(transcript, `${complete}\n${partial}\n`);
        expect(readCompactionHistory(transcript, cache)).toHaveLength(2);
    });

    it("rescans from the start when the transcript shrinks under the cached offset", () => {
        writeFileSync(
            transcript,
            [
                boundary("manual", 1000, 100, "2026-07-16T06:00:00.000Z"),
                boundary("manual", 2000, 200, "2026-07-16T07:00:00.000Z"),
                ""
            ].join("\n")
        );
        expect(readCompactionHistory(transcript, cache)).toHaveLength(2);

        writeFileSync(transcript, boundary("auto", 3000, 300, "2026-07-16T08:00:00.000Z") + "\n");
        const events = readCompactionHistory(transcript, cache);
        expect(events).toHaveLength(1);
        expect(events[0]?.trigger).toBe("auto");
    });

    it("keeps the byte offset correct across multi-byte characters", () => {
        writeFileSync(
            transcript,
            [
                '{"type":"user","message":"café 🔥 日本語"}',
                boundary("auto", 150000, 7000, "2026-07-16T06:00:00.000Z"),
                ""
            ].join("\n")
        );
        expect(readCompactionHistory(transcript, cache)).toHaveLength(1);

        appendFileSync(transcript, boundary("manual", 160000, 8000, "2026-07-16T07:00:00.000Z") + "\n");
        expect(readCompactionHistory(transcript, cache)).toHaveLength(2);
    });
});

describe("formatTokensK", () => {
    it("rounds to whole thousands and right-aligns to four columns", () => {
        expect(formatTokensK(227148)).toBe("227k");
        expect(formatTokensK(11300)).toBe(" 11k");
        expect(formatTokensK(8692)).toBe("  9k");
    });
});

describe("formatClock", () => {
    it("renders a local zero-padded HH:MM", () => {
        expect(formatClock(localIso(6, 50))).toBe("06:50");
        expect(formatClock(localIso(23, 5))).toBe("23:05");
    });

    it("renders nothing for a timestamp it cannot read", () => {
        expect(formatClock("")).toBe("");
        expect(formatClock("not-a-date")).toBe("");
    });
});

describe("buildCompactionLines", () => {
    const event = (trigger: string, pre: number, post: number, hours: number) => ({
        trigger,
        preTokens: pre,
        postTokens: post,
        timestamp: localIso(hours, 30)
    });

    it("renders nothing when nothing has compacted", () => {
        expect(buildCompactionLines([], "  ", STYLE)).toEqual([]);
    });

    it("closes the tree on the most recent compaction", () => {
        const lines = buildCompactionLines([event("manual", 227148, 11300, 6), event("auto", 239984, 8692, 11)], "  ", STYLE);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain("├─");
        expect(lines[1]).toContain("└─");
    });

    it("colors auto amber and manual gray, with the clock dim", () => {
        const [manual, auto] = buildCompactionLines(
            [event("manual", 227148, 11300, 6), event("auto", 239984, 8692, 11)],
            "  ",
            STYLE
        );
        expect(manual).toContain(`${GRAY}manual${RESET}`);
        expect(auto).toContain(`${AMBER}auto  ${RESET}`);
        expect(auto).toContain(`${DIM}11:30${RESET}`);
        expect(auto).toContain(`${GRAY}240k →   9k${RESET}`);
    });

    it("collapses everything past the row cap into a count", () => {
        const events = [1, 2, 3, 4, 5, 6, 7].map((n) => event("manual", n * 1000, 100, n));
        const lines = buildCompactionLines(events, "  ", STYLE);
        expect(lines).toHaveLength(4);
        expect(lines[0]).toContain("4 earlier");
        expect(lines[3]).toContain("  7k");
    });

    it("omits the counter when the history fits", () => {
        const lines = buildCompactionLines([event("manual", 1000, 100, 1)], "  ", STYLE);
        expect(lines).toHaveLength(1);
        expect(lines[0]).not.toContain("earlier");
    });

    it("drops the clock field entirely when the timestamp is unreadable", () => {
        const lines = buildCompactionLines([{ trigger: "auto", preTokens: 1000, postTokens: 100, timestamp: "" }], "  ", STYLE);
        expect(lines[0]).not.toContain(`${DIM}·`);
    });

    it("applies the caller's indent, so the panel can nest deeper than the bar", () => {
        expect(buildCompactionLines([event("auto", 1000, 100, 1)], "    ", STYLE)[0]).toMatch(/^ {4}/);
    });
});
