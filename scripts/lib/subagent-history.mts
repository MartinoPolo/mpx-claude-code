// Session-wide sub-agent history, shared by both status-line renderers.
//
// The tasks panel only ever renders agents Claude Code still has in its payload,
// and it evicts a terminal task 30s after it finishes — so the panel is a live
// view, never a ledger. The main bar wants the opposite: what ran, in total,
// long after the last agent is gone. Both read the same two files.
//
//   ~/.claude/subagent-statusline-state/<session>.tsv
//       written by subagent-status-line.mts on every tick, one row per agent:
//       id, tier, effort, tokens, elapsed, status. Terminal rows freeze, so a
//       finished agent's numbers are final. This is the spine — it is the only
//       source that knows an agent's *status*, and it is complete, because the
//       panel ticks continuously for as long as any agent is running.
//
//   <project>/<session>/subagents/agent-<id>.meta.json
//       written by Claude Code at spawn: {agentType, description, toolUseId,
//       spawnDepth, model?, name?, isFork?}. This is the only place the agent's
//       *identity* survives — the tasks payload deliberately omits agentType
//       (see the field notes in subagent-status-line.mts), so without this file
//       every agent is an anonymous tier and a token count.
//
// The meta files are read by id rather than by scanning the directory: the TSV
// already names every agent worth showing, so a readdir would only find rows
// this renderer has decided not to draw. They are small and immutable once
// written, and a session's worth of them costs less than the one git call the
// main bar already makes every tick, so they are read fresh rather than cached.

import { existsSync, readFileSync } from "node:fs";

import { subagentTranscriptPath } from "./compaction.mts";
import { isNonNegativeInt } from "./statusline-ansi.mts";
import { loadPalette } from "./terminal-theme.mts";

const PALETTE = loadPalette();

/**
 * Model tier colors. Shared with the effort scale where the hue means the same
 * thing, so the two columns read as one palette rather than two. Declaration
 * order is also the order every tally groups tiers in.
 */
export const TIER_COLORS: Readonly<Record<string, string>> = {
    opus: PALETTE.accent, // blue
    sonnet: PALETTE.contextYellow, // yellow
    haiku: PALETTE.tierHaiku, // pink
    fable: PALETTE.contextOrange // orange
};

/**
 * The `!` marker and its red, shared so a broken rule looks the same on both
 * renderers: the panel prefixes the cell it accuses, the main bar prefixes the
 * agent type. Amber `?` stays with the panel — it qualifies an effort level,
 * and the main bar renders none.
 */
export const DRIFT = PALETTE.contextRed;
export const DRIFT_MARKER = "!";

export const UNKNOWN_TIER = "unknown";
export const TIER_ORDER = [...Object.keys(TIER_COLORS), UNKNOWN_TIER];

/** The one status an agent reaches by finishing the work it was given. */
export const COMPLETED = "completed";

const TERMINAL_STATUSES = [COMPLETED, "failed", "killed"];

/** Agent types spelled out on the tally before the rest collapse into a count. */
export const AGENT_TYPE_ROWS = 6;

/** Agents spelled out as a row of their own before the rest collapse into a count. */
export const AGENT_DETAIL_ROWS = 5;

export function isTerminalStatus(status: string): boolean {
    return TERMINAL_STATUSES.includes(status);
}

export interface StatusStyle {
    glyph: string;
    color: string;
}

/**
 * The status column, shared so a finished agent looks the same on the live panel
 * and in the main bar's ledger.
 *
 * Glyphs are constrained to what Cascadia Mono (Windows Terminal's default face)
 * actually carries. `✗ U+2717` was not one of them: it font-fell-back to Segoe UI
 * Emoji, which drew double-width into this one-cell column and smeared over the
 * model beside it, so `× U+00D7` replaces it. `✓ U+2713` does render in Cascadia
 * and stays — it is the clearest "completed" mark and this column is too narrow
 * for words. Consolas lacks it, so a face change there would need the same
 * treatment.
 */
export const STATUS_STYLES: Readonly<Record<string, StatusStyle>> = {
    running: { glyph: "●", color: PALETTE.effortBudget }, // cyan
    completed: { glyph: "✓", color: PALETTE.add }, // green
    failed: { glyph: "×", color: PALETTE.contextRed }, // red
    killed: { glyph: "×", color: PALETTE.contextRed }
};
export const UNKNOWN_STATUS_STYLE: StatusStyle = { glyph: "○", color: PALETTE.gray };

export function statusStyle(status: string): StatusStyle {
    return STATUS_STYLES[status] ?? UNKNOWN_STATUS_STYLE;
}

/** `95000` -> `1m35s`. Whole seconds, matching the clock both renderers tick on. */
export function formatDuration(milliseconds: number): string {
    let totalSeconds = Math.trunc(milliseconds / 1000);
    if (totalSeconds < 0) {
        totalSeconds = 0;
    }
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }
    if (totalSeconds < 3600) {
        const seconds = totalSeconds % 60;
        return `${Math.trunc(totalSeconds / 60)}m${String(seconds).padStart(2, "0")}s`;
    }
    const minutes = Math.trunc((totalSeconds % 3600) / 60);
    return `${Math.trunc(totalSeconds / 3600)}h${String(minutes).padStart(2, "0")}m`;
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

// --- Session state file --------------------------------------------------------

/** One line of the session state file, tab-delimited on disk. */
export interface StateRecord {
    id: string;
    tier: string;
    effort: string;
    tokens: string;
    elapsedMs: string;
    status: string;
}

export function serializeRecord(record: StateRecord): string {
    return [record.id, record.tier, record.effort, record.tokens, record.elapsedMs, record.status].join("\t");
}

export function parseRecord(line: string): StateRecord {
    const fields = line.split("\t");
    return {
        id: fields[0] ?? "",
        tier: fields[1] ?? "",
        effort: fields[2] ?? "",
        tokens: fields[3] ?? "",
        elapsedMs: fields[4] ?? "",
        status: fields[5] ?? ""
    };
}

export function sessionStateDir(configDir: string): string {
    return `${configDir}/subagent-statusline-state`;
}

export function sessionStateFile(configDir: string, sessionId: string): string {
    return `${sessionStateDir(configDir)}/${sessionId}.tsv`;
}

/** Every agent this session has spawned, in spawn order. `[]` when none have. */
export function readSessionRecords(stateFile: string): StateRecord[] {
    try {
        return readFileSync(stateFile, "utf8")
            .split("\n")
            .filter((line) => line !== "")
            .map(parseRecord)
            .filter((record) => record.id !== "");
    } catch {
        return [];
    }
}

// --- Agent identity ------------------------------------------------------------

export interface SubagentMeta {
    /** The subagent_type the Agent tool was called with: "Explore", "mp-executor", "fork". */
    agentType: string;
    description: string;
    /** Set only for named background agents and teammates; "" for a plain Task spawn. */
    name: string;
}

/** Sits beside the agent's own transcript, under the same `subagents/` directory. */
export function subagentMetaPath(sessionTranscript: string, agentId: string): string {
    const transcript = subagentTranscriptPath(sessionTranscript, agentId);
    return transcript === "" ? "" : transcript.replace(/\.jsonl$/, ".meta.json");
}

export function readSubagentMeta(sessionTranscript: string, agentId: string): SubagentMeta | undefined {
    const metaPath = subagentMetaPath(sessionTranscript, agentId);
    if (metaPath === "") {
        return undefined;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(metaPath, "utf8"));
    } catch {
        return undefined;
    }
    const record = (parsed ?? {}) as Record<string, unknown>;
    const agentType = typeof record.agentType === "string" ? record.agentType : "";
    if (agentType === "") {
        return undefined;
    }
    return {
        agentType,
        description: typeof record.description === "string" ? record.description : "",
        name: typeof record.name === "string" ? record.name : ""
    };
}

/**
 * The markdown file that *defines* an agent type — `.claude/agents/<type>.md`,
 * project-level first and then user-level, which is the order Claude Code
 * resolves a `subagent_type` in.
 *
 * This is what a type name on the ledger links to, rather than the transcript of
 * one run: an agent type is a thing you edit, and its frontmatter (model, effort,
 * tools) is the answer to every question the ledger raises about it. A run's own
 * transcript is still one click away — it hangs off that run's status glyph.
 *
 * Built-in types (`general-purpose`, `Plan`, `fork`) have no file unless one was
 * written to override them, and "" — no link at all — is the honest answer there.
 */
export function agentDefinitionPath(agentType: string, projectDir: string, configDir: string): string {
    if (agentType === "" || agentType === UNKNOWN_TIER) {
        return "";
    }
    const candidates = [
        projectDir === "" ? "" : `${projectDir}/.claude/agents/${agentType}.md`,
        configDir === "" ? "" : `${configDir}/agents/${agentType}.md`
    ];
    return candidates.find((candidate) => candidate !== "" && existsSync(candidate)) ?? "";
}

// --- Grouping ------------------------------------------------------------------

/**
 * Drift checks that survive without the agent's identity. Model drift (declared
 * vs. actual) needs a name the tasks payload never carries, so only the tier
 * rule from instructions/AGENTS.md runs: fable is banned outright, independent
 * of effort.
 *
 * The effort rules live with the tasks panel instead, because they only apply to
 * a *declared* level and the state file records the resolved one — an inherited
 * level is the session's own setting, so flagging it here would accuse an agent
 * of a choice it never made.
 */
export function tierDriftReasons(tier: string): string[] {
    return tier === "fable" ? ["fable is never allowed"] : [];
}

export interface CountedGroup {
    label: string;
    count: number;
    /** Every member's tokens, summed. */
    tokens: number;
    /** At least one member broke a tier rule — see `tierDriftReasons`. */
    drifted: boolean;
}

/** One agent, seen through whichever label is being tallied — its tier or its type. */
export interface GroupMember {
    label: string;
    tokens: number;
    drifted: boolean;
}

/**
 * `2×Explore`, not `Explore 2`. One multiplication idiom carries every count on
 * both renderers — tiers, effort levels and agent types alike — so a number in
 * front of a name always means the same thing wherever it appears.
 */
export function countLabel(count: number, name: string): string {
    return `${count}×${name}`;
}

/** Tally names are capitalized (`Opus`); agent types keep their real spelling. */
export function capitalize(text: string): string {
    return text === "" ? "" : text[0]!.toUpperCase() + text.slice(1);
}

/** Tallies members by label, in first-seen order. Unlabelled members are skipped. */
export function groupMembers(members: readonly GroupMember[]): CountedGroup[] {
    const groups = new Map<string, CountedGroup>();
    for (const member of members) {
        if (member.label === "") {
            continue;
        }
        const existing = groups.get(member.label);
        if (existing === undefined) {
            groups.set(member.label, {
                label: member.label,
                count: 1,
                tokens: member.tokens,
                drifted: member.drifted
            });
            continue;
        }
        existing.count += 1;
        existing.tokens += member.tokens;
        // One drifted member marks the whole group: the tier tally already says a
        // banned model ran, and the type tally says which agent ran on it — the
        // pairing is the only thing that survives the panel's eviction.
        existing.drifted ||= member.drifted;
    }
    return [...groups.values()];
}

/**
 * Groups in `order` first, then anything unranked in first-seen order — an
 * unrecognized tier or effort level is an anomaly worth reading rather than
 * dropping.
 */
export function groupByOrder(members: readonly GroupMember[], order: readonly string[]): CountedGroup[] {
    const rank = (label: string): number => {
        const index = order.indexOf(label);
        return index === -1 ? order.length : index;
    };
    // Array.sort is stable, so unranked groups keep the order they were seen in.
    return groupMembers(members).sort((left, right) => rank(left.label) - rank(right.label));
}

/** One finished agent, everything a spelled-out row draws. */
export interface FinishedAgent {
    id: string;
    /** The `subagent_type` it was spawned as, or `UNKNOWN_TIER` when the meta file is gone. */
    type: string;
    tier: string;
    /** The resolved effort level, `""` where the tier takes none. */
    effort: string;
    tokens: number;
    elapsedMs: number;
    /** `COMPLETED`, `failed` or `killed` — never a live status. */
    status: string;
    /** Broke a tier rule — see `tierDriftReasons`. */
    drifted: boolean;
}

/**
 * Which finished agents get a row of their own.
 *
 * A failed or killed agent is always spelled out and always first, however many
 * there are: a run that broke is the one thing in this history you might still
 * act on, and a cap that could hide it would defeat the row.
 *
 * Below them the ordering depends on whether everything fits. Up to `cap` agents
 * all do, so they keep spawn order and the block reads as the session's own
 * chronology. Past that the block has to choose, and the useful choice is the
 * expensive one: the heaviest consumers, largest first.
 */
export function selectDetailRows(agents: readonly FinishedAgent[], cap: number = AGENT_DETAIL_ROWS): FinishedAgent[] {
    const broken = agents.filter((agent) => agent.status !== COMPLETED);
    const completed = agents.filter((agent) => agent.status === COMPLETED);
    if (agents.length <= cap) {
        return [...broken, ...completed];
    }
    const slots = Math.max(0, cap - broken.length);
    // Array.sort is stable, so agents that spent the same keep spawn order.
    return [...broken, ...[...completed].sort((left, right) => right.tokens - left.tokens).slice(0, slots)];
}

export interface SubagentSummary {
    /** Finished agents only — the running ones are the tasks panel's job. */
    agents: number;
    /** Tiers in `TIER_ORDER`, each carrying its own share of the tokens. */
    tiers: CountedGroup[];
    /** Agent types, heaviest group first; ties keep spawn order. */
    types: CountedGroup[];
    /** The agents spelled out as their own row, in the order they render. */
    rows: FinishedAgent[];
    /** Finished agents with no row of their own. */
    hiddenRows: number;
}

/**
 * The main bar's view of the session: what has finished. Running agents are
 * excluded on purpose — the tasks panel renders directly beneath the main bar
 * for as long as any agent is alive, and showing the same agent in both places
 * would say the same thing twice while it runs and nothing at all afterwards.
 *
 * An agent whose meta file cannot be read still counts toward the tally and its
 * tier's tokens; only its name is unknown, and dropping the row entirely would
 * make the count disagree with the panel's.
 */
export function summarizeFinishedAgents(
    records: StateRecord[],
    lookupMeta: (agentId: string) => SubagentMeta | undefined
): SubagentSummary {
    // One pass over the finished agents, read three ways: tallied by tier, tallied
    // by type, and spelled out one by one. All three are the same agents, so they
    // are derived from a single list rather than three walks of the state file.
    const agents: FinishedAgent[] = records
        .filter((record) => isTerminalStatus(record.status))
        .map((record) => ({
            id: record.id,
            type: lookupMeta(record.id)?.agentType ?? UNKNOWN_TIER,
            tier: record.tier,
            effort: record.effort,
            tokens: Math.trunc(Number.parseFloat(record.tokens) || 0),
            elapsedMs: Math.trunc(Number.parseFloat(record.elapsedMs) || 0),
            status: record.status,
            drifted: tierDriftReasons(record.tier).length > 0
        }));

    const rows = selectDetailRows(agents);
    return {
        agents: agents.length,
        tiers: groupByOrder(
            agents.map((agent) => ({ label: agent.tier, tokens: agent.tokens, drifted: agent.drifted })),
            TIER_ORDER
        ),
        // First-seen order is spawn order, which is the tie-break when two types
        // have the same count — a stable sort leaves it intact.
        types: groupMembers(
            agents.map((agent) => ({ label: agent.type, tokens: agent.tokens, drifted: agent.drifted }))
        ).sort((left, right) => right.count - left.count),
        rows,
        hiddenRows: agents.length - rows.length
    };
}
