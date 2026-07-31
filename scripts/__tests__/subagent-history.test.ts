import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
    TIER_ORDER,
    agentDefinitionPath,
    capitalize,
    countLabel,
    groupByOrder,
    parseRecord,
    readSessionRecords,
    readSubagentMeta,
    selectDetailRows,
    serializeRecord,
    sessionStateFile,
    subagentMetaPath,
    summarizeFinishedAgents,
    tierDriftReasons,
    type FinishedAgent,
    type GroupMember,
    type StateRecord,
    type SubagentMeta
} from "../lib/subagent-history.mts";

const fixtureRoot = mkdtempSync(path.join(tmpdir(), "subagent-history-"));
afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

function record(overrides: Partial<StateRecord> = {}): StateRecord {
    return {
        id: "a",
        tier: "opus",
        effort: "high",
        tokens: "1000",
        elapsedMs: "0",
        status: "completed",
        ...overrides
    };
}

/** Builds `<root>/<session>.jsonl` plus the `subagents/` sidecars beside it. */
function transcriptWithAgents(session: string, agents: Record<string, unknown>): string {
    const transcript = path.join(fixtureRoot, `${session}.jsonl`);
    writeFileSync(transcript, "");
    const subagents = path.join(fixtureRoot, session, "subagents");
    mkdirSync(subagents, { recursive: true });
    for (const [agentId, meta] of Object.entries(agents)) {
        writeFileSync(path.join(subagents, `agent-${agentId}.meta.json`), JSON.stringify(meta));
    }
    return transcript;
}

describe("countLabel", () => {
    it("puts the count in front of the name", () => {
        expect(countLabel(3, "Opus")).toBe("3×Opus");
        expect(countLabel(1, "Explore")).toBe("1×Explore");
    });
});

describe("capitalize", () => {
    it("capitalizes a tier name without touching the rest", () => {
        expect(capitalize("opus")).toBe("Opus");
        expect(capitalize("xhigh")).toBe("Xhigh");
        expect(capitalize("")).toBe("");
    });
});

describe("groupByOrder", () => {
    const member = (label: string, overrides: Partial<GroupMember> = {}): GroupMember => ({
        label,
        tokens: 0,
        drifted: false,
        ...overrides
    });

    it("counts in the declared order regardless of encounter order", () => {
        expect(groupByOrder([member("sonnet"), member("opus"), member("sonnet")], TIER_ORDER)).toEqual([
            { label: "opus", count: 1, tokens: 0, drifted: false },
            { label: "sonnet", count: 2, tokens: 0, drifted: false }
        ]);
    });

    it("keeps an unranked value rather than dropping it", () => {
        expect(groupByOrder([member("gpt-9"), member("opus")], TIER_ORDER).map((group) => group.label)).toEqual([
            "opus",
            "gpt-9"
        ]);
    });

    it("sums each group's tokens", () => {
        expect(
            groupByOrder([member("opus", { tokens: 1200 }), member("opus", { tokens: 800 })], TIER_ORDER)[0]?.tokens
        ).toBe(2000);
    });

    it("marks a group drifted when any one member is", () => {
        expect(groupByOrder([member("fable", { drifted: true })], TIER_ORDER)[0]?.drifted).toBe(true);
        expect(groupByOrder([member("opus"), member("opus", { drifted: true })], TIER_ORDER)[0]?.drifted).toBe(true);
    });

    it("ignores unlabelled members", () => {
        expect(groupByOrder([member(""), member("")], TIER_ORDER)).toEqual([]);
    });
});

describe("tierDriftReasons", () => {
    it("flags fable and nothing else", () => {
        expect(tierDriftReasons("fable")).toEqual(["fable is never allowed"]);
        expect(tierDriftReasons("opus")).toEqual([]);
    });
});

describe("state file round trip", () => {
    it("parses back what it serialized", () => {
        const original = record({ id: "task_b", tier: "sonnet", tokens: "42" });
        expect(parseRecord(serializeRecord(original))).toEqual(original);
    });

    it("names the state file after the session", () => {
        expect(sessionStateFile("/cfg", "abc")).toBe("/cfg/subagent-statusline-state/abc.tsv");
    });

    it("returns nothing for a session that has spawned no agents", () => {
        expect(readSessionRecords(path.join(fixtureRoot, "absent.tsv"))).toEqual([]);
    });

    it("reads every row and drops the ones with no id", () => {
        const stateFile = path.join(fixtureRoot, "state.tsv");
        writeFileSync(
            stateFile,
            [serializeRecord(record({ id: "a" })), "\tsonnet\thigh\t1\t0\tcompleted", serializeRecord(record({ id: "b" }))].join(
                "\n"
            ) + "\n"
        );
        expect(readSessionRecords(stateFile).map((row) => row.id)).toEqual(["a", "b"]);
    });
});

describe("readSubagentMeta", () => {
    const transcript = transcriptWithAgents("session-meta", {
        known: { agentType: "Explore", description: "sweep the skills", toolUseId: "toolu_1", spawnDepth: 1 },
        unnamed: { description: "no type at all" }
    });

    it("sits beside the agent's own transcript", () => {
        expect(subagentMetaPath("/p/s.jsonl", "abc")).toBe(path.join("/p", "s", "subagents", "agent-abc.meta.json"));
    });

    it("reads the agent type and description", () => {
        expect(readSubagentMeta(transcript, "known")).toEqual({
            agentType: "Explore",
            description: "sweep the skills",
            name: ""
        } satisfies SubagentMeta);
    });

    it("returns nothing when the file is absent", () => {
        expect(readSubagentMeta(transcript, "missing")).toBeUndefined();
    });

    it("returns nothing when the file carries no agent type", () => {
        expect(readSubagentMeta(transcript, "unnamed")).toBeUndefined();
    });

    it("returns nothing without a session transcript to resolve against", () => {
        expect(readSubagentMeta("", "known")).toBeUndefined();
    });
});

describe("summarizeFinishedAgents", () => {
    const meta = (agentType: string): SubagentMeta => ({ agentType, description: "", name: "" });

    it("counts only agents that have finished", () => {
        const summary = summarizeFinishedAgents(
            [
                record({ id: "a", status: "completed", tokens: "1000" }),
                record({ id: "b", status: "running", tokens: "5000" }),
                record({ id: "c", status: "failed", tokens: "2000" })
            ],
            () => meta("Explore")
        );
        expect(summary.agents).toBe(2);
        expect(summary.types).toEqual([{ label: "Explore", count: 2, tokens: 3000, drifted: false }]);
        expect(summary.rows.map((agent) => agent.id)).toEqual(["c", "a"]);
    });

    it("charges each tier its own agents' tokens", () => {
        const summary = summarizeFinishedAgents(
            [
                record({ id: "a", tier: "opus", tokens: "1000" }),
                record({ id: "b", tier: "sonnet", tokens: "300" }),
                record({ id: "c", tier: "sonnet", tokens: "400" })
            ],
            () => meta("Explore")
        );
        expect(summary.tiers.map((group) => [group.label, group.count, group.tokens])).toEqual([
            ["opus", 1, 1000],
            ["sonnet", 2, 700]
        ]);
    });

    it("returns an empty summary while every agent is still running", () => {
        const summary = summarizeFinishedAgents([record({ status: "running" })], () => meta("Explore"));
        expect(summary).toEqual({ agents: 0, tiers: [], types: [], rows: [], hiddenRows: 0 });
    });

    it("carries every field a spelled-out row draws", () => {
        const summary = summarizeFinishedAgents(
            [record({ id: "a", tier: "sonnet", effort: "low", tokens: "15631", elapsedMs: "12000" })],
            () => meta("Explore")
        );
        expect(summary.rows).toEqual([
            {
                id: "a",
                type: "Explore",
                tier: "sonnet",
                effort: "low",
                tokens: 15_631,
                elapsedMs: 12_000,
                status: "completed",
                drifted: false
            } satisfies FinishedAgent
        ]);
        expect(summary.hiddenRows).toBe(0);
    });

    it("counts the agents it could not spell out", () => {
        const summary = summarizeFinishedAgents(
            ["a", "b", "c", "d", "e", "f", "g"].map((id) => record({ id })),
            () => meta("Explore")
        );
        expect(summary.rows).toHaveLength(5);
        expect(summary.hiddenRows).toBe(2);
    });

    it("orders types by count and keeps spawn order on a tie", () => {
        const summary = summarizeFinishedAgents(
            [
                record({ id: "a" }),
                record({ id: "b" }),
                record({ id: "c" }),
                record({ id: "d" }),
                record({ id: "e" })
            ],
            (agentId) => meta(agentId === "a" ? "Plan" : agentId === "b" || agentId === "c" ? "Explore" : "mp-executor")
        );
        expect(summary.types.map((group) => `${group.count}×${group.label}`)).toEqual([
            "2×Explore",
            "2×mp-executor",
            "1×Plan"
        ]);
    });

    it("marks the type that ran on a banned tier", () => {
        const summary = summarizeFinishedAgents(
            [record({ id: "a", tier: "fable" }), record({ id: "b", tier: "opus" })],
            (agentId) => meta(agentId === "a" ? "fork" : "Explore")
        );
        expect(summary.types.find((group) => group.label === "fork")?.drifted).toBe(true);
        expect(summary.types.find((group) => group.label === "Explore")?.drifted).toBe(false);
    });

    it("counts an agent whose meta file is missing rather than dropping it", () => {
        const summary = summarizeFinishedAgents([record({ id: "a", tokens: "700" })], () => undefined);
        expect(summary.agents).toBe(1);
        expect(summary.types).toEqual([{ label: "unknown", count: 1, tokens: 700, drifted: false }]);
    });

    it("sums a token count the panel froze mid-write", () => {
        const summary = summarizeFinishedAgents([record({ tokens: "" }), record({ id: "b", tokens: "12" })], () => meta("Explore"));
        expect(summary.types[0]?.tokens).toBe(12);
    });
});

describe("selectDetailRows", () => {
    function agent(id: string, overrides: Partial<FinishedAgent> = {}): FinishedAgent {
        return {
            id,
            type: "Explore",
            tier: "sonnet",
            effort: "low",
            tokens: 1000,
            elapsedMs: 1000,
            status: "completed",
            drifted: false,
            ...overrides
        };
    }
    const ids = (agents: FinishedAgent[]): string[] => agents.map((one) => one.id);

    it("keeps spawn order while everything fits", () => {
        expect(ids(selectDetailRows([agent("a"), agent("b"), agent("c")]))).toEqual(["a", "b", "c"]);
    });

    it("lifts a failed and a killed agent to the top of a list that already fits", () => {
        const agents = [agent("a"), agent("b", { status: "failed" }), agent("c"), agent("d", { status: "killed" })];
        expect(ids(selectDetailRows(agents))).toEqual(["b", "d", "a", "c"]);
    });

    it("picks the largest consumers, largest first, once the cap is passed", () => {
        const agents = [
            agent("small", { tokens: 1 }),
            agent("largest", { tokens: 900 }),
            agent("tiny", { tokens: 0 }),
            agent("second", { tokens: 800 }),
            agent("third", { tokens: 700 }),
            agent("fourth", { tokens: 600 })
        ];
        expect(ids(selectDetailRows(agents, 3))).toEqual(["largest", "second", "third"]);
    });

    it("never drops a failure, even when the failures alone pass the cap", () => {
        const agents = [
            agent("f1", { status: "failed" }),
            agent("f2", { status: "failed" }),
            agent("f3", { status: "killed" }),
            agent("big", { tokens: 9000 })
        ];
        expect(ids(selectDetailRows(agents, 2))).toEqual(["f1", "f2", "f3"]);
    });

    it("charges a failure against the cap before the heaviest completed agents", () => {
        const agents = [
            agent("broke", { status: "failed", tokens: 1 }),
            agent("big", { tokens: 900 }),
            agent("mid", { tokens: 500 }),
            agent("small", { tokens: 100 })
        ];
        expect(ids(selectDetailRows(agents, 2))).toEqual(["broke", "big"]);
    });

    it("leaves the caller's array untouched", () => {
        const agents = [agent("a", { tokens: 1 }), agent("b", { tokens: 9 }), agent("c", { tokens: 5 })];
        selectDetailRows(agents, 1);
        expect(ids(agents)).toEqual(["a", "b", "c"]);
    });
});

describe("agentDefinitionPath", () => {
    const project = path.join(fixtureRoot, "project");
    const config = path.join(fixtureRoot, "config");
    mkdirSync(path.join(project, ".claude", "agents"), { recursive: true });
    mkdirSync(path.join(config, "agents"), { recursive: true });
    writeFileSync(path.join(project, ".claude", "agents", "mp-executor.md"), "");
    writeFileSync(path.join(config, "agents", "mp-executor.md"), "");
    writeFileSync(path.join(config, "agents", "Explore.md"), "");

    it("prefers the project's own definition over the user-level one", () => {
        expect(agentDefinitionPath("mp-executor", project, config)).toBe(`${project}/.claude/agents/mp-executor.md`);
    });

    it("falls back to the user-level definition", () => {
        expect(agentDefinitionPath("Explore", project, config)).toBe(`${config}/agents/Explore.md`);
    });

    it("returns nothing for a built-in type nobody has overridden", () => {
        expect(agentDefinitionPath("general-purpose", project, config)).toBe("");
    });

    it("returns nothing for an agent whose type was never recovered", () => {
        expect(agentDefinitionPath("unknown", project, config)).toBe("");
        expect(agentDefinitionPath("", project, config)).toBe("");
    });
});
