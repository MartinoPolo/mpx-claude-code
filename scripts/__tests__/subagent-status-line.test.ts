import { describe, it, expect } from "vitest";

import { RESET } from "../lib/statusline-ansi.mts";
import { loadPalette } from "../lib/terminal-theme.mts";

// Resolved from the palette, not written as literal escapes: these colors are
// derived from the terminal's color scheme now, so pinning the bytes would only
// assert whichever scheme the machine running the tests happens to use. What has
// to hold is that each cell draws the semantic color it is specified to.
const PALETTE = loadPalette();
const GRAY = PALETTE.gray;
const DIM = PALETTE.dim;
const AMBER = PALETTE.amber;
const DRIFT = PALETTE.contextRed;
const DRIFT_REASON = PALETTE.warn;
const CTX_YELLOW = PALETTE.contextYellow;
const EFFORT_LOW = PALETTE.effortLow;
const EFFORT_HIGH = PALETTE.effortHigh;
const EFFORT_BUDGET = PALETTE.effortBudget;
const TIER_OPUS = PALETTE.accent;
import {
    buildSummaryLine,
    effortDriftReasons,
    extractTasks,
    formatDuration,
    formatTokens,
    mergeSessionState,
    modelTier,
    renderTaskRow,
    tierDriftReasons,
    type StateRecord,
    type TaskFields,
} from "../subagent-status-line.mts";

const DEFAULT_TASK: TaskFields = {
    id: "task_a",
    model: "opus",
    effort: "high",
    status: "running",
    startTime: "0",
    tokenCount: "1000",
    contextWindowSize: "200000",
    name: "",
    description: "agent a",
};

function task(overrides: Partial<TaskFields> = {}): TaskFields {
    return { ...DEFAULT_TASK, ...overrides };
}

function render(overrides: Partial<TaskFields> = {}, columns = 100) {
    return renderTaskRow(task(overrides), {
        columns,
        sessionEffort: "medium",
        nowMs: 0,
    });
}

/** Reduces a row to what the terminal actually shows, so column widths can be
 *  asserted without pinning the colors that wrap them. */
function visibleFirstLine(content: string): string {
    return (content.split("\n")[0] ?? "").replace(/\[[0-9;]*m/g, "");
}

function record(overrides: Partial<StateRecord> = {}): StateRecord {
    return {
        id: "a",
        tier: "opus",
        effort: "high",
        tokens: "1000",
        elapsedMs: "0",
        status: "running",
        ...overrides,
    };
}

describe("formatTokens", () => {
    it("truncates rather than rounds the tenths digit", () => {
        // (25032+50)/1000 = 25 and (25082%1000)/100 = 0, so 25.0k — not the
        // 25.1k a float divide would produce.
        expect(formatTokens(25032)).toBe("25.0k");
    });

    it("formats thousands with a truncated tenth", () => {
        expect(formatTokens(1000)).toBe("1.0k");
        expect(formatTokens(1950)).toBe("2.0k");
        expect(formatTokens(180000)).toBe("180.0k");
        expect(formatTokens(999999)).toBe("1000.0k");
    });

    it("passes values below 1000 through unchanged", () => {
        expect(formatTokens(999)).toBe("999");
        expect(formatTokens(0)).toBe("0");
        expect(formatTokens("903")).toBe("903");
    });

    it("renders an empty or non-numeric value as the raw text", () => {
        expect(formatTokens("")).toBe("0");
        expect(formatTokens("null")).toBe("null");
    });
});

describe("formatDuration", () => {
    it("switches from seconds to minutes at 60s", () => {
        expect(formatDuration(59_000)).toBe("59s");
        expect(formatDuration(60_000)).toBe("1m00s");
    });

    it("switches from minutes to hours at 3600s", () => {
        expect(formatDuration(3_599_000)).toBe("59m59s");
        expect(formatDuration(3_600_000)).toBe("1h00m");
    });

    it("zero-pads the trailing unit", () => {
        expect(formatDuration(65_000)).toBe("1m05s");
        expect(formatDuration(3_960_000)).toBe("1h06m");
    });

    it("clamps negative elapsed time to zero", () => {
        expect(formatDuration(-5_000)).toBe("0s");
    });
});

describe("modelTier", () => {
    it("normalizes an alias", () => {
        expect(modelTier("sonnet")).toBe("sonnet");
        expect(modelTier("opus")).toBe("opus");
    });

    it("normalizes a full model id", () => {
        expect(modelTier("claude-sonnet-5")).toBe("sonnet");
        expect(modelTier("claude-opus-5[1m]")).toBe("opus");
        expect(modelTier("claude-haiku-4-5")).toBe("haiku");
    });

    it("returns empty for an unrecognized model", () => {
        expect(modelTier("gpt-9")).toBe("");
        expect(modelTier("")).toBe("");
    });
});

describe("tierDriftReasons", () => {
    it("flags fable, independent of any effort the row carries", () => {
        expect(tierDriftReasons("fable")).toEqual(["fable is never allowed"]);
    });

    it("allows every other tier", () => {
        expect(tierDriftReasons("opus")).toEqual([]);
        expect(tierDriftReasons("sonnet")).toEqual([]);
        expect(tierDriftReasons("haiku")).toEqual([]);
        expect(tierDriftReasons("unknown")).toEqual([]);
    });
});

describe("effortDriftReasons", () => {
    it("flags a declared effort above the high ceiling", () => {
        expect(effortDriftReasons("opus", "xhigh", false, true)).toEqual([
            "effort above the high ceiling",
        ]);
        expect(effortDriftReasons("opus", "max", false, true)).toEqual([
            "effort above the high ceiling",
        ]);
    });

    it("allows sonnet at high", () => {
        expect(effortDriftReasons("sonnet", "high", false, true)).toEqual([]);
    });

    it("allows opus at high", () => {
        expect(effortDriftReasons("opus", "high", false, true)).toEqual([]);
    });

    it("flags haiku for declaring any effort at all", () => {
        expect(effortDriftReasons("haiku", "medium", false, true)).toEqual([
            "haiku has no effort setting",
        ]);
    });

    it("spares an inherited effort from every effort rule", () => {
        // The agent declared nothing, so the session level is on the session —
        // there is no agent configuration here to be in violation.
        expect(effortDriftReasons("opus", "max", false, false)).toEqual([]);
        expect(effortDriftReasons("sonnet", "high", false, false)).toEqual([]);
        expect(effortDriftReasons("haiku", "high", false, false)).toEqual([]);
        expect(effortDriftReasons("fable", "max", false, false)).toEqual([]);
    });

    it("exempts a numeric token budget from every effort rule", () => {
        expect(effortDriftReasons("sonnet", "32000", true, true)).toEqual([]);
        expect(effortDriftReasons("opus", "999", true, true)).toEqual([]);
        expect(effortDriftReasons("haiku", "999", true, true)).toEqual([]);
    });

    it("collects every violated effort rule", () => {
        expect(effortDriftReasons("haiku", "max", false, true)).toEqual([
            "effort above the high ceiling",
            "haiku has no effort setting",
        ]);
    });
});

describe("renderTaskRow", () => {
    it("lays the row out cell by cell, with nothing between tokens and text", () => {
        expect(render().content).toBe(
            `${EFFORT_BUDGET}●${RESET}` +
                ` ${TIER_OPUS} opus  ${RESET}` +
                ` ${EFFORT_HIGH} ◆◆◆◇◇ ${RESET}` +
                ` ${DIM}     0s${RESET}` +
                ` ${GRAY}1.0k (0%)    ${RESET} ` +
                `${GRAY}agent a${RESET}`,
        );
    });

    it("draws a named level as the main bar's gauge while recording the word", () => {
        expect(render({ effort: "low" }).content).toContain(`${EFFORT_LOW} ◆◇◇◇◇ ${RESET}`);
        expect(render({ effort: "high" }).record.effort).toBe("high");
    });

    it("question-marks an inherited effort and records it without the marker", () => {
        const row = render({ effort: "" });
        expect(row.content).toContain(`${AMBER}?◆◆◇◇◇ ${RESET}`);
        expect(row.record.effort).toBe("medium");
    });

    it("colors the whole inherited effort cell amber and adds no reason", () => {
        const row = render({ model: "sonnet", effort: "" });
        expect(row.content).toContain(`${AMBER}?◆◆◇◇◇ ${RESET}`);
        expect(row.content).not.toContain("^ ");
    });

    it("leaves a declared effort unmarked in its own level color", () => {
        const row = render({ model: "sonnet", effort: "high" });
        expect(row.content).toContain(`${EFFORT_HIGH} ◆◆◆◇◇ ${RESET}`);
        expect(row.content).not.toContain("^ ");
    });

    it("marks the model for a tier violation, not the effort", () => {
        // fable inherits its effort here, so the tier rule is the only one that
        // fires — and it is a fact about the model, so it marks the model. The
        // effort cell keeps the amber `?` it earns for being substituted.
        const row = render({ model: "fable", effort: "" });
        expect(row.content).toContain(`${DRIFT}!fable ${RESET}`);
        expect(row.content).toContain(`${AMBER}?◆◆◇◇◇ ${RESET}`);
        expect(row.content).toContain(`\n${DRIFT_REASON}    ^ fable is never allowed${RESET}`);
    });

    it("marks the effort for an effort violation and leaves the model alone", () => {
        const row = render({ model: "opus", effort: "max" });
        expect(row.content).toContain(`${DRIFT}!◆◆◆◆◆ ${RESET}`);
        expect(row.content).toContain(`${TIER_OPUS} opus  ${RESET}`);
    });

    describe("haiku", () => {
        it("blanks the effort column and adds no marker when inherited", () => {
            const row = render({ model: "haiku", effort: "" });
            // Two pad spaces after the model, then the six the empty effort
            // column still occupies, then the right-aligned duration.
            expect(visibleFirstLine(row.content)).toMatch(/^● {2}haiku {15}0s/);
            expect(row.content).not.toContain("◆");
            expect(row.content).toContain(`${RESET} ${GRAY}agent a`);
            expect(row.record.effort).toBe("");
        });

        it("shows a declared effort marked, since blanking would hide the violation", () => {
            const row = render({ model: "haiku", effort: "medium" });
            expect(row.content).toContain(`${DRIFT}!◆◆◇◇◇ ${RESET}`);
            expect(row.record.effort).toBe("medium");
            expect(row.content).toContain(
                `\n${DRIFT_REASON}    ^ haiku has no effort setting${RESET}`,
            );
        });
    });

    it("keeps every column aligned across marker and blanking cases", () => {
        const prefixWidth = (overrides: Partial<TaskFields>): number =>
            visibleFirstLine(render(overrides).content).indexOf("agent a");
        const widths = [
            { model: "sonnet", effort: "high" },
            { model: "sonnet", effort: "" },
            { model: "haiku", effort: "" },
            { model: "haiku", effort: "medium" },
            { model: "opus", effort: "max" },
            { model: "opus", effort: "" },
            { model: "fable", effort: "" },
            { model: "opus", effort: "32000" },
        ].map(prefixWidth);
        expect(widths).toEqual(widths.map(() => widths[0]));
        expect(widths[0]).toBeGreaterThan(0);
    });

    it("renders a numeric budget in cyan through formatTokens, with no gauge to draw", () => {
        const row = render({ effort: "32000" });
        expect(row.content).toContain(`${EFFORT_BUDGET} 32.0k ${RESET}`);
        expect(row.record.effort).toBe("32.0k");
    });

    it("appends the drift reason on its own line", () => {
        const row = render({ model: "opus", effort: "max" });
        expect(row.content).toContain(
            `\n${DRIFT_REASON}    ^ effort above the high ceiling${RESET}`,
        );
    });

    it("joins multiple drift reasons with a bare semicolon", () => {
        // The reference joined through `IFS='; '`, which uses only the first
        // IFS character, so multiple reasons are separated by a bare semicolon.
        const row = render({ model: "fable", effort: "max" });
        expect(row.content).toContain(
            "^ fable is never allowed;effort above the high ceiling",
        );
        // One violation per cell, each marking the value it is about.
        expect(row.content).toContain(`${DRIFT}!fable ${RESET}`);
        expect(row.content).toContain(`${DRIFT}!◆◆◆◆◆ ${RESET}`);
    });

    it("separates the tokens column from the description with a single space", () => {
        expect(render().content).toContain(`${RESET} ${GRAY}agent a`);
    });

    it("falls back to the raw model, then to a question mark", () => {
        expect(render({ model: "gpt-9" }).content).toContain(`${GRAY} gpt-9 ${RESET}`);
        expect(render({ model: "" }).content).toContain(`${GRAY} ?     ${RESET}`);
        expect(render({ model: "gpt-9" }).record.tier).toBe("unknown");
    });

    it("prefixes the description with name when the payload carries one", () => {
        expect(render({ name: "teammate-one" }).content).toContain(
            "teammate-one · agent a",
        );
    });

    describe("context color thresholds", () => {
        const tokensAt = (percent: number, color: string): void => {
            const row = render({
                contextWindowSize: "100",
                tokenCount: String(percent),
            });
            expect(row.content).toContain(`${color}${percent} (${percent}%)`);
        };

        it("stays gray below 50 percent", () => tokensAt(49, GRAY));
        it("turns yellow at exactly 50 percent", () => tokensAt(50, CTX_YELLOW));
        it("stays yellow below 70 percent", () => tokensAt(69, CTX_YELLOW));
        it("turns orange at exactly 70 percent", () => tokensAt(70, EFFORT_HIGH));
        it("stays orange below 90 percent", () => tokensAt(89, EFFORT_HIGH));
        it("turns red at exactly 90 percent", () => tokensAt(90, DRIFT));

        it("reports zero percent when the window size is missing", () => {
            expect(render({ contextWindowSize: "0" }).content).toContain(
                `${GRAY}1.0k (0%)`,
            );
        });
    });

    describe("description truncation", () => {
        const description = "0123456789abcdefghijklmnopqrstuvwxyz";

        it("gives the description whatever the fixed columns leave over", () => {
            // 40 columns of fixed layout, so 64 leaves exactly 24.
            expect(render({ description }, 64).content).toContain(
                `${GRAY}0123456789abcdefghijklmn${RESET}`,
            );
        });

        it("floors the description at ten characters on a narrow terminal", () => {
            expect(render({ description }, 40).content).toContain(
                `${GRAY}0123456789${RESET}`,
            );
            expect(render({ description }, 10).content).toContain(
                `${GRAY}0123456789${RESET}`,
            );
        });

        it("leaves a description shorter than the budget untouched", () => {
            expect(render({ description: "short" }, 200).content).toContain(
                `${GRAY}short${RESET}`,
            );
        });

        it("truncates by character, not by UTF-8 byte", () => {
            expect(render({ description: "αβγδεζηθικλμν" }, 40).content).toContain(
                `${GRAY}αβγδεζηθικ${RESET}`,
            );
        });
    });

    it("computes elapsed time from startTime and ignores a non-numeric one", () => {
        const withStart = renderTaskRow(task({ startTime: "1000" }), {
            columns: 100,
            sessionEffort: "medium",
            nowMs: 91_000,
        });
        expect(withStart.record.elapsedMs).toBe("90000");
        expect(withStart.content).toContain("1m30s");

        const withoutStart = renderTaskRow(task({ startTime: "not-a-number" }), {
            columns: 100,
            sessionEffort: "medium",
            nowMs: 91_000,
        });
        expect(withoutStart.record.elapsedMs).toBe("0");
    });
});

describe("mergeSessionState", () => {
    it("overwrites a still-running record with the fresh reading", () => {
        const { records } = mergeSessionState(
            [record({ tokens: "5000" })],
            [record({ tokens: "1000" })],
        );
        expect(records).toEqual([record({ tokens: "5000" })]);
    });

    it("freezes a record whose stored status is terminal", () => {
        const frozen = record({ tokens: "50000", status: "completed" });
        const { records } = mergeSessionState(
            [record({ tokens: "999999", elapsedMs: "60000", status: "completed" })],
            [frozen],
        );
        expect(records).toEqual([frozen]);
    });

    it.each(["completed", "failed", "killed"])(
        "treats %s as terminal",
        (status) => {
            const { records, tally } = mergeSessionState(
                [record({ tokens: "999999" })],
                [record({ tokens: "7", status })],
            );
            expect(records[0]?.tokens).toBe("7");
            expect(tally.running).toBe(0);
        },
    );

    it("records the terminal reading on the tick the status first flips", () => {
        const { records } = mergeSessionState(
            [record({ tokens: "50000", status: "completed" })],
            [record({ tokens: "1000", status: "running" })],
        );
        expect(records[0]).toEqual(record({ tokens: "50000", status: "completed" }));
    });

    it("keeps first-seen order and appends new ids at the end", () => {
        const first = mergeSessionState(
            [record({ id: "a" }), record({ id: "b" })],
            [],
        );
        // Second tick reports them out of order and adds one.
        const second = mergeSessionState(
            [record({ id: "c" }), record({ id: "b" }), record({ id: "a" })],
            first.records,
        );
        expect(second.records.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    });

    it("keeps agents the panel has already evicted from the payload", () => {
        const { records, tally } = mergeSessionState(
            [record({ id: "b" })],
            [record({ id: "a", status: "completed" })],
        );
        expect(records.map((entry) => entry.id)).toEqual(["a", "b"]);
        expect(tally.agents).toBe(2);
    });

    it("skips stored lines with an empty id", () => {
        const { records } = mergeSessionState([], [record({ id: "" })]);
        expect(records).toEqual([]);
    });

    it("groups tiers and efforts in the fixed order, omitting empty groups", () => {
        const { tally } = mergeSessionState(
            [
                record({ id: "a", tier: "unknown", effort: "max" }),
                record({ id: "b", tier: "sonnet", effort: "low" }),
                record({ id: "c", tier: "opus", effort: "low" }),
            ],
            [],
        );
        expect(tally.tierText).toBe("1×Opus 1×Sonnet 1×Unknown");
        expect(tally.effortText).toBe("2×Low 1×Max");
    });

    it("omits an effort group for values that are not named levels", () => {
        const { tally } = mergeSessionState([record({ effort: "32.0k" })], []);
        expect(tally.effortText).toBe("");
    });

    it("sums tokens and counts non-terminal records as running", () => {
        const { tally } = mergeSessionState(
            [
                record({ id: "a", tokens: "1000" }),
                record({ id: "b", tokens: "2500", status: "completed" }),
                record({ id: "c", tokens: "not-a-number" }),
            ],
            [],
        );
        expect(tally.totalTokens).toBe(3500);
        expect(tally.running).toBe(2);
        expect(tally.agents).toBe(3);
    });
});

describe("buildSummaryLine", () => {
    it("renders every group present", () => {
        expect(
            buildSummaryLine({
                agents: 3,
                tierText: "2×Opus 1×Haiku",
                effortText: "1×Low 2×High",
                totalTokens: 53_500,
                running: 2,
            }),
        ).toBe(
            "Σ 3 agents this session · 2×Opus 1×Haiku · 1×Low 2×High · 53.5k tokens · 2 running",
        );
    });

    it("omits the running count when nothing is running", () => {
        expect(
            buildSummaryLine({
                agents: 1,
                tierText: "1×Opus",
                effortText: "1×High",
                totalTokens: 900,
                running: 0,
            }),
        ).toBe("Σ 1 agents this session · 1×Opus · 1×High · 900 tokens");
    });

    it("reproduces the reference field shift when no named effort group exists", () => {
        // `IFS=$'\t' read` collapses the run of tabs an empty effort group
        // leaves behind, so the token total lands in the effort slot and the
        // running count lands in the token slot.
        expect(
            buildSummaryLine({
                agents: 1,
                tierText: "1×Opus",
                effortText: "",
                totalTokens: 1000,
                running: 1,
            }),
        ).toBe("Σ 1 agents this session · 1×Opus · 1000 · 1 tokens");
    });
});

describe("extractTasks", () => {
    it("prefers label over description and flattens its whitespace", () => {
        const [extracted] = extractTasks({
            tasks: [{ id: "a", label: "one\ttwo\nthree", description: "ignored" }],
        });
        expect(extracted?.description).toBe("one two three");
    });

    it("falls back to description when label is null", () => {
        const [extracted] = extractTasks({
            tasks: [{ id: "a", label: null, description: "fallback" }],
        });
        expect(extracted?.description).toBe("fallback");
    });

    it("defaults every absent field the way the reference jq filter did", () => {
        expect(extractTasks({ tasks: [{}] })).toEqual([
            {
                id: "",
                model: "",
                effort: "",
                status: "",
                startTime: "0",
                tokenCount: "0",
                contextWindowSize: "0",
                name: "",
                description: "",
            },
        ]);
    });

    it("stringifies numeric fields", () => {
        const [extracted] = extractTasks({
            tasks: [{ id: 7, startTime: 1_753_795_200_000, tokenCount: 25_032 }],
        });
        expect(extracted?.id).toBe("7");
        expect(extracted?.startTime).toBe("1753795200000");
        expect(extracted?.tokenCount).toBe("25032");
    });

    it("returns nothing when tasks is absent or not an array", () => {
        expect(extractTasks({})).toEqual([]);
        expect(extractTasks({ tasks: null })).toEqual([]);
        expect(extractTasks(null)).toEqual([]);
    });
});
