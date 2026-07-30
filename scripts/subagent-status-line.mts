#!/usr/bin/env node

// Per-subagent status line: renders one row per agent in the tasks panel
// (Ctrl+T) showing status, model, effort, elapsed time and context consumption,
// flags any row whose model/effort violates the rules in instructions/AGENTS.md,
// and appends a session-wide tally of every subagent that has run — including
// ones the panel has already evicted.
//
// Contract (verified against the 2.1.220 bundle by capturing raw stdin): stdin
// is a JSON object {columns, session_id, cwd, prompt_id, transcript_path,
// tasks:[{id,name,type,status,description,label,startTime,model,effort,
// contextWindowSize,tokenCount,tokenSamples,cwd}]}; stdout is JSONL, one
// {"id","content"} object per row, 5s timeout. Rows whose id is not emitted keep
// the built-in "name · description · tokens" rendering.
//
// Field notes, all confirmed against captured payloads rather than the docs:
//   name    always null for Task-tool subagents. It is the agentNameRegistry
//           entry, which only teammates and named background agents get.
//   type    always the literal "local_agent", regardless of which subagent_type
//           was spawned. The task object carries a real `agentType` internally
//           (the bundle filters on it: `agentType!=="main-session"`), but it is
//           deliberately not copied into this payload.
//   status  one of running / completed / failed / killed. The three terminal
//           values are what the bundle's isTerminal check accepts.
//   label   the live progress summary when the agent has one, else description.
//   effort  drawn as the main bar's five-slot gauge (`high` -> `◆◆◆◇◇`), present
//           only when the agent declared one in its frontmatter or the spawn
//           overrode it, so a present value is authoritative — it is what
//           the agent was actually configured with. Absent means nothing was
//           declared and the session `effortLevel` applies, so the substituted
//           value is shown `?`-marked and can never be read as a config choice.
//           haiku has no effort setting at all, so its column stays blank rather
//           than showing a level it never had — except when haiku declared one
//           anyway, which is itself the violation and so has to stay on screen.
//           Requires 2.1.214.
//   tokenSamples  a rolling history of tokenCount, one entry per refresh tick,
//           capped at the bundle's 16. Deliberately not rendered: a sparkline of
//           it has to be normalized against the row's own min/max, because
//           against a 1M context window every real subagent flatlines at the
//           bottom — and that normalization destroys scale, so +200 tokens and
//           +200k draw identically. The ten columns buy more as label text.
//
// Because no field carries the agent's identity, declared-vs-actual model drift
// stays uncheckable here; only the tier/effort rules that need no identity run,
// and the effort ones only against a declared value. A substituted session level
// says nothing about how the agent was configured, so it earns the quiet `?`
// marker instead of the `!` reserved for a real violation.
//
// Both markers prefix the cell they accuse and recolor the whole of it — `!fable`
// in red on the model, `?◆◆◆◇◇` in amber or `!◆◆◆◆◆` in red on the effort. They had
// a column of their own between the tokens and the description, which put every
// mark as far from its value as the layout allowed: a bare `?` beside a task
// label reads as noise about the task. Prefixing also hands those three columns
// back to the description, and coloring the whole cell rather than the glyph
// keeps one color run per padded cell. `?` replaces the `~` that used to mark a
// substituted level, since one glyph already says "this was not declared".
//
// Both marked cells reserve the slot on every row, blank where there is no
// marker, so a mark never shifts the value it is about — the gauges have to
// start at the same column or their filled slots cannot be compared down the
// column.
//
// Terminal tasks stay in the payload for 30s (the bundle's eviction delay) and
// then vanish, so the session tally is accumulated in a state file keyed by
// session_id. A task's tokens and elapsed time freeze the first tick it is seen
// terminal, so a finished agent stops accruing time.

import {
    appendFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    realpathSync,
    renameSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    AMBER,
    DIM,
    GRAY,
    RESET,
    cacheKey,
    effortGauge,
    fg,
    isNonNegativeInt,
    readStdin,
    toNonNegativeInt,
} from "./lib/statusline-ansi.mts";
import {
    type CompactionStyle,
    buildCompactionLines,
    readCompactionHistory,
    subagentTranscriptPath,
} from "./lib/compaction.mts";

// Model tier colors. Shared with the effort scale where the hue means the same
// thing, so the two columns read as one palette rather than two. Declaration
// order is also the order the session tally groups tiers in.
const TIER_COLORS: Readonly<Record<string, string>> = {
    opus: fg(74), // blue
    sonnet: fg(220), // yellow
    haiku: fg(211), // pink
    fable: fg(208), // orange
};

const EFFORT_COLORS: Readonly<Record<string, string>> = {
    low: fg(71), // green
    medium: fg(220), // yellow
    high: fg(208), // orange
    xhigh: fg(196), // red
    max: fg(141), // purple
};
const EFFORT_BUDGET = fg(80); // cyan: a numeric token budget, not a level

interface StatusStyle {
    glyph: string;
    color: string;
}
// Glyphs are constrained to what Cascadia Mono (Windows Terminal's default face)
// actually carries. `✗ U+2717` was not one of them: it font-fell-back to Segoe UI
// Emoji, which drew double-width into this one-cell column and smeared over the
// model beside it, so `× U+00D7` replaces it. `✓ U+2713` does render in Cascadia
// and stays — it is the clearest "completed" mark and this column is too narrow
// for the words status-line.mts uses. Consolas lacks it, so a face change there
// would need the same treatment.
const STATUS_STYLES: Readonly<Record<string, StatusStyle>> = {
    running: { glyph: "●", color: fg(80) }, // cyan
    completed: { glyph: "✓", color: fg(71) }, // green
    failed: { glyph: "×", color: fg(196) }, // red
    killed: { glyph: "×", color: fg(196) },
};
const UNKNOWN_STATUS_STYLE: StatusStyle = { glyph: "○", color: GRAY };

// Context escalation mirrors status-line.sh, but keyed to percentage rather than
// absolute tokens: subagent windows vary by model, so the main bar's fixed
// 100k/140k/180k cut-offs would mean different things on different rows.
const CTX_YELLOW = fg(220); // >=50%
const CTX_ORANGE = fg(208); // >=70%
const CTX_RED = fg(196); // >=90%

const DRIFT = fg(196); // red: the cell a ! marker accuses
const DRIFT_REASON = fg(203); // coral: the explanation beneath it
const INHERITED_EFFORT = fg(214); // amber: the cell a ? marker qualifies
const DRIFT_MARKER = "!";
const INHERITED_EFFORT_MARKER = "?";
// Every marked cell reserves the slot whether or not it has a marker to put in
// it, so the value behind it starts at the same column on every row. Without
// this the gauges shift a character the moment a row is marked, and comparing
// filled slots down the column — the whole point of drawing a gauge — stops
// working.
const MARKER_SLOT = " ";

/**
 * Identical ranking to the main bar's, and deliberately the same object shape:
 * a compaction row means the same thing wherever it appears, so the two
 * renderers must not drift into two dialects of it.
 */
const COMPACTION_STYLE: CompactionStyle = {
    tree: DIM,
    auto: AMBER,
    manual: GRAY,
    tokens: GRAY,
    time: DIM,
    reset: RESET,
};

/** Matches status-line.mts: the compaction scan caches its byte offset here. */
const CACHE_DIR = process.env.TMPDIR || "/tmp";

const CONFIG_DIR =
    process.env.CLAUDE_CONFIG_DIR || `${process.env.HOME || homedir()}/.claude`;
const SETTINGS_FILE = `${CONFIG_DIR}/settings.json`;
const STATE_DIR = `${CONFIG_DIR}/subagent-statusline-state`;

// Both widths count the reserved marker slot: `!sonnet`, `?◆◆◆◇◇`, ` 120.0k`.
// An unrecognized level renders as `<level>` and may overrun rather than be
// clipped — it is an anomaly worth reading in full, and the main bar spells it
// out the same way.
const COLUMN_WIDTH_MODEL = 7;
const COLUMN_WIDTH_EFFORT = 7;
const COLUMN_WIDTH_DURATION = 7;
const COLUMN_WIDTH_TOKENS = 13;
const USED_WIDTH =
    1 +
    1 +
    COLUMN_WIDTH_MODEL +
    1 +
    COLUMN_WIDTH_EFFORT +
    1 +
    COLUMN_WIDTH_DURATION +
    1 +
    COLUMN_WIDTH_TOKENS +
    1;
const MIN_DESCRIPTION_WIDTH = 10;

// Inherited verbatim from the bash renderer, which joined through `IFS='; '`
// while `"${array[*]}"` uses only the *first* IFS character — so it rendered
// `a;b`, not `a; b`. The byte-parity contract that forced the match is gone with
// the bash original; the unspaced form only survives because nothing has decided
// to change it, and `"; "` is the obvious correction whenever that happens.
const DRIFT_REASON_SEPARATOR = ";";

const TERMINAL_STATUSES = ["completed", "failed", "killed"];
const UNKNOWN_TIER = "unknown";
const TIER_ORDER = [...Object.keys(TIER_COLORS), UNKNOWN_TIER];
const EFFORT_ORDER = Object.keys(EFFORT_COLORS);
const PRUNE_AFTER_DAYS = 7;

/** One task from the payload, every field already flattened to a string. */
export interface TaskFields {
    id: string;
    model: string;
    effort: string;
    status: string;
    startTime: string;
    tokenCount: string;
    contextWindowSize: string;
    name: string;
    description: string;
}

/** One line of the session state file, tab-delimited on disk. */
export interface StateRecord {
    id: string;
    tier: string;
    effort: string;
    tokens: string;
    elapsedMs: string;
    status: string;
}

export interface SessionTally {
    agents: number;
    tierText: string;
    effortText: string;
    totalTokens: number;
    running: number;
}

export interface RenderedRow {
    id: string;
    content: string;
    record: StateRecord;
}

export function isTerminalStatus(status: string): boolean {
    return TERMINAL_STATUSES.includes(status);
}

/** Normalizes either an alias ("sonnet") or a full id ("claude-sonnet-5"). */
export function modelTier(model: string): string {
    return Object.keys(TIER_COLORS).find((tier) => model.includes(tier)) ?? "";
}

/**
 * 25032 -> 25.0k ; below 1000 stays exact.
 *
 * The integer arithmetic is the point, not an approximation of a rounded
 * divide: 25032 rounds to 25082, whose thousands digit is 25 and whose hundreds
 * digit is 0, so the tenth reads 0 rather than the 25.1k a float would give.
 */
export function formatTokens(value: string | number): string {
    if (isNonNegativeInt(value) && Number(value) >= 1000) {
        const rounded = Number(value) + 50;
        return `${Math.trunc(rounded / 1000)}.${Math.trunc((rounded % 1000) / 100)}k`;
    }
    const text = String(value);
    return text === "" ? "0" : text;
}

export function formatDuration(milliseconds: number): string {
    let totalSeconds = Math.trunc(milliseconds / 1000);
    if (totalSeconds < 0) totalSeconds = 0;
    if (totalSeconds < 60) return `${totalSeconds}s`;
    if (totalSeconds < 3600) {
        const seconds = totalSeconds % 60;
        return `${Math.trunc(totalSeconds / 60)}m${String(seconds).padStart(2, "0")}s`;
    }
    const minutes = Math.trunc((totalSeconds % 3600) / 60);
    return `${Math.trunc(totalSeconds / 3600)}h${String(minutes).padStart(2, "0")}m`;
}

/**
 * Drift checks, each mapped to a rule in instructions/AGENTS.md. Model drift
 * (declared vs. actual) is unreachable here — no field carries which agent a
 * task is — so only the tier rule that needs no identity runs. fable is banned
 * outright, independent of effort.
 *
 * Split from the effort rules because the two mark different cells: a banned
 * tier is a fact about the model, and hanging its marker off the effort would
 * accuse the wrong value.
 */
export function tierDriftReasons(tier: string): string[] {
    return tier === "fable" ? ["fable is never allowed"] : [];
}

/**
 * The effort rules need a *declared* value: an inherited one is the session's
 * own setting, so flagging it would accuse an agent of a choice it never made.
 * A numeric budget is exempt too — it maps to no named level, so no ceiling
 * applies.
 */
export function effortDriftReasons(
    tier: string,
    effort: string,
    effortIsNumericBudget: boolean,
    effortIsDeclared: boolean,
): string[] {
    if (!effortIsDeclared || effortIsNumericBudget) return [];
    const reasons: string[] = [];
    if (effort === "xhigh" || effort === "max") {
        reasons.push("effort above the high ceiling");
    }
    if (tier === "haiku") reasons.push("haiku has no effort setting");
    return reasons;
}

/** Truncates by character, matching the reference shell's UTF-8 substring. */
function truncateToWidth(text: string, width: number): string {
    const characters = Array.from(text);
    if (characters.length <= width) return text;
    return characters.slice(0, width).join("");
}

export function renderTaskRow(
    task: TaskFields,
    options: { columns: number; sessionEffort: string; nowMs: number },
): RenderedRow {
    const status = STATUS_STYLES[task.status] ?? UNKNOWN_STATUS_STYLE;

    const tier = modelTier(task.model);
    const tierReasons = tierDriftReasons(tier);
    const modelText = tier || task.model || "?";
    const modelDisplay = `${tierReasons.length > 0 ? DRIFT_MARKER : MARKER_SLOT}${modelText}`;
    const modelColor = tierReasons.length > 0 ? DRIFT : (TIER_COLORS[tier] ?? GRAY);

    // An absent effort means the agent declared none and the session's level was
    // substituted, which is the one case where the value shown is not the
    // agent's own — hence the `?`, and hence no drift rule may judge it.
    const effortIsDeclared = task.effort !== "";
    const effort = effortIsDeclared ? task.effort : options.sessionEffort;
    const effortIsNumericBudget = effortIsDeclared && isNonNegativeInt(effort);
    const effortReasons = effortDriftReasons(
        tier,
        effort,
        effortIsNumericBudget,
        effortIsDeclared,
    );

    // haiku takes no effort setting, so an inherited level here would be one it
    // never had; blank is the honest reading. A value it *declared* is the
    // violation itself, so it stays on screen — blanking would hide the thing
    // being flagged.
    let effortText: string;
    if (tier === "haiku" && !effortIsDeclared) effortText = "";
    else if (effortIsNumericBudget) effortText = formatTokens(effort);
    else effortText = effort;

    // A named level draws as the main bar's gauge — down a column of rows the
    // filled slots compare at a glance, where the words had to be read one by
    // one. The record keeps the word: the session tally groups by level, and a
    // count needs a name (`high 2`, not `◆◆◆◇◇ 2`). A token budget has no rank
    // to draw, so it stays the number it is.
    const effortCell = effortIsNumericBudget ? effortText : effortGauge(effortText);

    // An empty cell keeps no slot: there is no value behind it to align.
    let effortDisplay = effortCell === "" ? "" : `${MARKER_SLOT}${effortCell}`;
    let effortColor = effortIsNumericBudget
        ? EFFORT_BUDGET
        : (EFFORT_COLORS[effort] ?? GRAY);
    if (effortCell !== "") {
        if (effortReasons.length > 0) {
            effortDisplay = `${DRIFT_MARKER}${effortCell}`;
            effortColor = DRIFT;
        } else if (!effortIsDeclared) {
            effortDisplay = `${INHERITED_EFFORT_MARKER}${effortCell}`;
            effortColor = INHERITED_EFFORT;
        }
    }

    let elapsedMs = 0;
    const startTime = toNonNegativeInt(task.startTime, 0);
    if (startTime > 0) elapsedMs = options.nowMs - startTime;

    let contextPercent = 0;
    const contextSize = toNonNegativeInt(task.contextWindowSize, 0);
    if (contextSize > 0 && isNonNegativeInt(task.tokenCount)) {
        contextPercent = Math.trunc((Number(task.tokenCount) * 100) / contextSize);
    }
    let contextColor: string;
    if (contextPercent >= 90) contextColor = CTX_RED;
    else if (contextPercent >= 70) contextColor = CTX_ORANGE;
    else if (contextPercent >= 50) contextColor = CTX_YELLOW;
    else contextColor = GRAY;
    const tokensDisplay = `${formatTokens(task.tokenCount)} (${contextPercent}%)`;

    // The `?` carries no explanation line: it is routine for every agent type
    // that declares no effort, so a reason on each would bury the real `!` rows.
    const reasons = [...tierReasons, ...effortReasons];

    // Every cell is padded on its visible text and only then wrapped in color,
    // so the escapes never count toward a column width.
    let content =
        `${status.color}${status.glyph}${RESET}` +
        ` ${modelColor}${modelDisplay.padEnd(COLUMN_WIDTH_MODEL)}${RESET}` +
        ` ${effortColor}${effortDisplay.padEnd(COLUMN_WIDTH_EFFORT)}${RESET}` +
        ` ${DIM}${formatDuration(elapsedMs).padStart(COLUMN_WIDTH_DURATION)}${RESET}` +
        ` ${contextColor}${tokensDisplay.padEnd(COLUMN_WIDTH_TOKENS)}${RESET} `;

    // `name` is null for every Task-tool subagent, so this only ever renders for
    // a teammate or a named background agent — worth showing when it is there.
    const description = task.name
        ? `${task.name} · ${task.description}`
        : task.description;

    const descriptionWidth = Math.max(
        options.columns - USED_WIDTH,
        MIN_DESCRIPTION_WIDTH,
    );
    content += `${GRAY}${truncateToWidth(description, descriptionWidth)}${RESET}`;

    if (reasons.length > 0) {
        content += `\n${DRIFT_REASON}    ^ ${reasons.join(DRIFT_REASON_SEPARATOR)}${RESET}`;
    }

    return {
        id: task.id,
        content,
        record: {
            id: task.id,
            tier: tier || UNKNOWN_TIER,
            effort: effortText,
            tokens: task.tokenCount === "" ? "0" : task.tokenCount,
            elapsedMs: String(elapsedMs),
            status: task.status,
        },
    };
}

export function serializeRecord(record: StateRecord): string {
    return [
        record.id,
        record.tier,
        record.effort,
        record.tokens,
        record.elapsedMs,
        record.status,
    ].join("\t");
}

export function parseRecord(line: string): StateRecord {
    const fields = line.split("\t");
    return {
        id: fields[0] ?? "",
        tier: fields[1] ?? "",
        effort: fields[2] ?? "",
        tokens: fields[3] ?? "",
        elapsedMs: fields[4] ?? "",
        status: fields[5] ?? "",
    };
}

/** Longest leading numeric prefix, the coercion the reference awk pass applied. */
function numericPrefix(text: string): number {
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Merges this tick's tasks into the session state and computes the tally. A task
 * already recorded terminal keeps its frozen tokens and elapsed time; everything
 * else is overwritten with the fresh reading. New ids append in encounter order,
 * ids already present keep their original position.
 */
export function mergeSessionState(
    fresh: StateRecord[],
    prior: StateRecord[],
): { records: StateRecord[]; tally: SessionTally } {
    // Map insertion order is first-seen order, and re-setting an existing key
    // updates the value without moving it — which is exactly the freeze rule.
    const merged = new Map<string, { record: StateRecord; frozen: boolean }>();

    for (const record of prior) {
        if (record.id === "") continue;
        merged.set(record.id, { record, frozen: isTerminalStatus(record.status) });
    }
    for (const record of fresh) {
        const existing = merged.get(record.id);
        if (existing?.frozen) continue;
        merged.set(record.id, { record, frozen: isTerminalStatus(record.status) });
    }

    const records: StateRecord[] = [];
    const byTier = new Map<string, number>();
    const byEffort = new Map<string, number>();
    let totalTokens = 0;
    let running = 0;
    for (const { record } of merged.values()) {
        records.push(record);
        byTier.set(record.tier, (byTier.get(record.tier) ?? 0) + 1);
        byEffort.set(record.effort, (byEffort.get(record.effort) ?? 0) + 1);
        totalTokens += numericPrefix(record.tokens);
        if (!isTerminalStatus(record.status)) running++;
    }

    const groupText = (order: string[], counts: Map<string, number>): string =>
        order
            .filter((key) => (counts.get(key) ?? 0) > 0)
            .map((key) => `${key} ${counts.get(key)}`)
            .join(" ");

    return {
        records,
        tally: {
            agents: records.length,
            tierText: groupText(TIER_ORDER, byTier),
            effortText: groupText(EFFORT_ORDER, byEffort),
            totalTokens: Math.trunc(totalTokens),
            running,
        },
    };
}

export function buildSummaryLine(tally: SessionTally): string {
    // The reference read the tally through `IFS=$'\t' read`, where tab counts as
    // IFS whitespace and so runs of tabs collapse: an empty effort group shifts
    // every later field one place left. Reproduced rather than corrected, so the
    // two renderers stay byte-identical on the all-numeric-budget payload that
    // triggers it.
    const fields = [
        String(tally.agents),
        tally.tierText,
        tally.effortText,
        String(tally.totalTokens),
        String(tally.running),
    ]
        .join("\t")
        .replace(/^\t+/, "")
        .split(/\t+/);
    const [totalAgents = "", tierText = "", effortText = "", totalTokens = "", running = ""] =
        fields;

    let line = `Σ ${totalAgents} agents this session`;
    if (tierText !== "") line += ` · ${tierText}`;
    if (effortText !== "") line += ` · ${effortText}`;
    line += ` · ${formatTokens(totalTokens)} tokens`;
    if (isNonNegativeInt(running) && Number(running) > 0) line += ` · ${running} running`;
    return line;
}

/** jq's `tostring`: strings pass through, everything else renders as JSON. */
function toText(value: unknown): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value) ?? "";
}

/** jq's `//`: null and false fall through to the alternative. */
function orDefault(value: unknown, fallback: string): string {
    if (value === null || value === undefined || value === false) return fallback;
    return toText(value);
}

export function extractTasks(payload: unknown): TaskFields[] {
    const tasks = (payload as { tasks?: unknown })?.tasks;
    if (!Array.isArray(tasks)) return [];
    return tasks.map((raw) => {
        const task = (raw ?? {}) as Record<string, unknown>;
        const label = task.label ?? null;
        const description = orDefault(
            label === null || label === false ? task.description : label,
            "",
        );
        return {
            id: orDefault(task.id, ""),
            model: orDefault(task.model, ""),
            effort: orDefault(task.effort, ""),
            status: orDefault(task.status, ""),
            startTime: orDefault(task.startTime, "0"),
            tokenCount: orDefault(task.tokenCount, "0"),
            contextWindowSize: orDefault(task.contextWindowSize, "0"),
            name: orDefault(task.name, ""),
            description: description.replace(/[\n\r\t]/g, " "),
        };
    });
}

function readSessionEffort(): string {
    try {
        const settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) as {
            effortLevel?: unknown;
        };
        const effort = orDefault(settings.effortLevel, "medium");
        return effort === "" || effort === "null" ? "medium" : effort;
    } catch {
        return "medium";
    }
}

function readPriorState(stateFile: string): StateRecord[] {
    try {
        return readFileSync(stateFile, "utf8")
            .split("\n")
            .filter((line) => line !== "")
            .map(parseRecord);
    } catch {
        return [];
    }
}

/**
 * Writes through a temp file: the panel kills in-flight scripts when a new
 * update arrives, and a tick cancelled mid-write would otherwise truncate the
 * session tally.
 */
function writeState(stateFile: string, records: StateRecord[]): void {
    const temporaryFile = `${stateFile}.tmp`;
    try {
        const body = records.map((record) => `${serializeRecord(record)}\n`).join("");
        writeFileSync(temporaryFile, body);
        if (statSync(temporaryFile).size > 0) renameSync(temporaryFile, stateFile);
    } catch {
        // A tally that fails to persist is not worth breaking the panel over.
    }
}

/** `find -mtime +7 -delete`: strictly more than seven whole days old. */
function pruneStaleState(nowMs: number): void {
    try {
        for (const entry of readdirSync(STATE_DIR)) {
            if (!entry.endsWith(".tsv")) continue;
            const path = `${STATE_DIR}/${entry}`;
            const ageDays = Math.floor((nowMs - statSync(path).mtimeMs) / 86400000);
            if (ageDays > PRUNE_AFTER_DAYS) unlinkSync(path);
        }
    } catch {
        // Pruning is housekeeping; a missing or busy file must not stop a render.
    }
}

function main(): void {
    const input = readStdin();

    // Raw-payload capture, gated on a marker file rather than an env var: the
    // panel runs this from inside Claude Code, so there is no shell in which to
    // export one. `touch ~/.claude/subagent-statusline-debug` to record, delete
    // it to stop.
    if (existsSync(`${CONFIG_DIR}/subagent-statusline-debug`)) {
        try {
            appendFileSync(
                `${CONFIG_DIR}/subagent-statusline-debug.jsonl`,
                `${input.replace(/\n+$/, "")}\n`,
            );
        } catch {
            // Debug capture never blocks a render.
        }
    }

    let payload: unknown;
    try {
        payload = JSON.parse(input);
    } catch {
        return;
    }

    const tasks = extractTasks(payload);
    if (tasks.length === 0) return;

    const header = (payload as { columns?: unknown; session_id?: unknown; transcript_path?: unknown }) ?? {};
    const columns = toNonNegativeInt(orDefault(header.columns, "100"), 100);
    const sessionId = orDefault(header.session_id, "nosession") || "nosession";
    // The payload carries the *session* transcript; a sub-agent's own transcript
    // sits beside it under `<session>/subagents/agent-<task.id>.jsonl`, and
    // `task.id` is the agent id that names that file.
    const sessionTranscript = orDefault(header.transcript_path, "");

    const sessionEffort = readSessionEffort();
    // Second granularity, matching the reference clock: elapsed time is rendered
    // in whole seconds, so a millisecond clock would only add render churn.
    const nowMs = Math.floor(Date.now() / 1000) * 1000;

    const stateFile = `${STATE_DIR}/${sessionId}.tsv`;
    if (!existsSync(stateFile)) {
        try {
            mkdirSync(STATE_DIR, { recursive: true });
        } catch {
            // Absent state only costs the tally, not the rows.
        }
        // Prune on first tick of a session only; a scan on every tick would be
        // paid several times a second for a directory that changes once.
        pruneStaleState(nowMs);
    }

    const rows: RenderedRow[] = [];
    for (const task of tasks) {
        if (task.id === "") continue;
        const row = renderTaskRow(task, { columns, sessionEffort, nowMs });
        // Hangs off the agent's own row rather than the tally, because which
        // agent lost its history is the whole point of showing it here.
        const transcript = subagentTranscriptPath(sessionTranscript, task.id);
        const compactions =
            transcript === ""
                ? []
                : readCompactionHistory(
                      transcript,
                      `${CACHE_DIR}/claude-compact-${cacheKey(transcript)}.tsv`,
                  );
        for (const line of buildCompactionLines(compactions, "    ", COMPACTION_STYLE)) {
            row.content += `\n${line}`;
        }
        rows.push(row);
    }
    if (rows.length === 0) return;

    const { records, tally } = mergeSessionState(
        rows.map((row) => row.record),
        readPriorState(stateFile),
    );
    writeState(stateFile, records);

    // The panel only renders rows for ids present in this tick's payload, so a
    // session-wide line has nowhere of its own to live; it hangs off the last
    // row. It therefore disappears with the last row, 30s after the final agent.
    const lastRow = rows[rows.length - 1]!;
    lastRow.content += `\n${DIM}  ${buildSummaryLine(tally)}${RESET}`;

    process.stdout.write(
        rows
            .map((row) => `${JSON.stringify({ id: row.id, content: row.content })}\n`)
            .join(""),
    );
}

/**
 * Compared through realpath because the panel invokes this via
 * `~/.claude/scripts`, which is a symlink to the repo. Node resolves
 * `import.meta.url` to the link target while `process.argv[1]` keeps the link
 * path, so a plain compare silently fails and every row falls back to the
 * built-in rendering.
 */
function resolveRealPath(target: string): string {
    try {
        return realpathSync(path.resolve(target));
    } catch {
        return path.resolve(target);
    }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolveRealPath(invokedPath) === resolveRealPath(fileURLToPath(import.meta.url))) {
    main();
}
