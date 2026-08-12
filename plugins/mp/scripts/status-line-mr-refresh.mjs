#!/usr/bin/env node
// Background refresher for the status line's MR/PR block. One network call, one
// atomic cache write, exit. Never invoked inline: Claude Code cancels a status
// line that blocks, and the API call costs ~0.7s.
//
// This process is spawned detached without a console, so every execFileSync
// must pass windowsHide — otherwise Windows allocates a visible transient
// console (a Windows Terminal flash) for each child it runs.
//
// Usage: node status-line-mr-refresh.mjs <cwd> <branch> <cache_path>

import { execFileSync } from "node:child_process";
import { renameSync, statSync, writeFileSync } from "node:fs";

const US = "\x1f";

const [, , cwd, branch, cache] = process.argv;
if (!cwd || !branch || !cache) {
    process.exit(1);
}

/** host + owner/project from the origin remote. Handles ssh, ssh://, https. */
function parseRemote(url) {
    let host;
    let repoPath;
    if (url.startsWith("git@")) {
        const rest = url.slice("git@".length);
        const colonIndex = rest.indexOf(":");
        if (colonIndex === -1) return undefined;
        host = rest.slice(0, colonIndex);
        repoPath = rest.slice(colonIndex + 1);
    } else if (url.startsWith("ssh://")) {
        let rest = url.slice("ssh://".length);
        const atIndex = rest.indexOf("@");
        if (atIndex !== -1) rest = rest.slice(atIndex + 1);
        const slashIndex = rest.indexOf("/");
        if (slashIndex === -1) return undefined;
        host = rest.slice(0, slashIndex);
        const colonIndex = host.indexOf(":");
        if (colonIndex !== -1) host = host.slice(0, colonIndex);
        repoPath = rest.slice(slashIndex + 1);
    } else if (url.startsWith("https://") || url.startsWith("http://")) {
        let rest = url.slice(url.indexOf("://") + 3);
        const atIndex = rest.indexOf("@");
        if (atIndex !== -1) rest = rest.slice(atIndex + 1);
        const slashIndex = rest.indexOf("/");
        if (slashIndex === -1) return undefined;
        host = rest.slice(0, slashIndex);
        repoPath = rest.slice(slashIndex + 1);
    } else {
        return undefined;
    }
    repoPath = repoPath.replace(/\.git$/, "");
    if (!host || !repoPath) return undefined;
    return { host, project: repoPath };
}

/**
 * Epoch mtime of FETCH_HEAD. --git-common-dir keeps a linked worktree pointed at
 * the main repo, which is where FETCH_HEAD actually lives; --path-format=absolute
 * is required because the plain form prints a bare ".git" that would resolve
 * against this script's cwd, not the target repo's.
 */
function fetchHeadEpoch() {
    let commonDir;
    try {
        commonDir = execFileSync("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            windowsHide: true
        }).trim();
    } catch {
        return "";
    }
    if (!commonDir) return "";
    try {
        const mtimeMs = statSync(`${commonDir}/FETCH_HEAD`).mtimeMs;
        return String(Math.floor(mtimeMs / 1000));
    } catch {
        return "";
    }
}

/**
 * 13 US-delimited fields: ts provider iid draft conflicts approved appr_req
 * appr_left status notes pipeline url fetch_epoch. Written atomically so a
 * concurrent render never reads a half-written line.
 */
function writeCache(line) {
    try {
        writeFileSync(`${cache}.tmp`, `${line}\n`);
        renameSync(`${cache}.tmp`, cache);
    } catch {
        // Best-effort: a failed write only means a stale/missing cache for the next render.
    }
}

function runCommand(command, args, options = {}) {
    try {
        return execFileSync(command, args, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 10000,
            windowsHide: true,
            ...options
        });
    } catch {
        return undefined;
    }
}

function commandExists(command) {
    try {
        execFileSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore", windowsHide: true });
        return true;
    } catch {
        return false;
    }
}

const fetchEpoch = fetchHeadEpoch();
const nowSeconds = Math.floor(Date.now() / 1000);

const remoteUrl = runCommand("git", ["-C", cwd, "remote", "get-url", "origin"])?.trim() ?? "";
const parsedRemote = parseRemote(remoteUrl);
const host = parsedRemote?.host ?? "";
const project = parsedRemote?.project ?? "";

let provider = "";
if (/gitlab/.test(host)) provider = "gitlab";
else if (/github/.test(host)) provider = "github";

// Non-GitLab/GitHub repos still want fetch_epoch cached, so always write.
if (!provider) {
    writeCache(`${nowSeconds}${US}${US}${US}${US}${US}${US}${US}${US}${US}${US}${US}${US}${fetchEpoch}`);
    process.exit(0);
}

/** Pipeline/check-run status normalized to the label the status line renders. */
function normalizePipelineStatus(rawStatus) {
    const upper = String(rawStatus || "").toUpperCase();
    if (["PENDING", "CREATED", "WAITING_FOR_RESOURCE", "PREPARING"].includes(upper)) return "RUNNING";
    if (["SUCCESS", "FAILED", "RUNNING", "CANCELED", "SKIPPED"].includes(upper)) return upper;
    return "";
}

let fields = "";

if (provider === "gitlab") {
    if (!commandExists("glab")) process.exit(0);
    // approvalsRequired/approvalsLeft are GitLab Premium fields; a self-hosted CE
    // host (e.g. gitlab.verotel.cz) rejects the whole query with `undefinedField`.
    // Dropped for cross-edition compatibility — the appr_req/appr_left cache slots
    // below are pinned to 0.
    const query = `query($p:ID!,$b:[String!]){project(fullPath:$p){mergeRequests(state:opened,sourceBranches:$b){nodes{
        iid draft conflicts approved detailedMergeStatus
        userNotesCount webUrl headPipeline{status} }}}}`;
    const response = runCommand("glab", ["api", "graphql", "-f", `query=${query}`, "-f", `p=${project}`, "-f", `b=${branch}`], {
        env: { ...process.env, GITLAB_HOST: host }
    });
    if (response === undefined) process.exit(1);
    if (!response) process.exit(1);

    let parsed;
    try {
        parsed = JSON.parse(response);
    } catch {
        process.exit(1);
    }
    if (parsed.data?.project == null) process.exit(1);

    const mr = parsed.data.project.mergeRequests?.nodes?.[0] ?? null;
    let values;
    if (mr == null) {
        values = ["", "", "", "", "0", "0", "", "0", "", ""];
    } else {
        const pipelineStatus = normalizePipelineStatus(mr.headPipeline?.status ?? "");
        values = [
            String(mr.iid ?? ""),
            String(mr.draft ?? ""),
            String(mr.conflicts ?? ""),
            String(mr.approved ?? ""),
            "0",
            "0",
            String(mr.detailedMergeStatus ?? ""),
            String(mr.userNotesCount ?? 0),
            pipelineStatus,
            String(mr.webUrl ?? "")
        ];
    }
    fields = values.join(US);
} else {
    if (!commandExists("gh")) process.exit(0);
    // `pr list` returns [] with no PR; `pr view` errors instead.
    const response = runCommand("gh", [
        "pr",
        "list",
        "-R",
        project,
        "--head",
        branch,
        "--state",
        "open",
        "--limit",
        "1",
        "--json",
        "number,isDraft,mergeable,reviewDecision,statusCheckRollup,url,comments"
    ]);
    if (response === undefined) process.exit(1);
    if (!response) process.exit(1);

    let parsed;
    try {
        parsed = JSON.parse(response);
    } catch {
        process.exit(1);
    }
    const pr = parsed[0] ?? null;
    let values;
    if (pr == null) {
        values = ["", "", "", "", "0", "0", "", "0", "", ""];
    } else {
        const checks = pr.statusCheckRollup ?? [];
        const states = checks.map((check) => String(check.conclusion ?? check.state ?? "").toUpperCase());
        let pipelineStatus = "";
        if (states.some((state) => ["FAILURE", "FAILED", "TIMED_OUT", "ERROR", "CANCELLED"].includes(state))) {
            pipelineStatus = "FAILED";
        } else if (checks.some((check) => check.status != null && check.status !== "COMPLETED")) {
            pipelineStatus = "RUNNING";
        } else if (checks.length > 0) {
            pipelineStatus = "SUCCESS";
        }
        values = [
            String(pr.number ?? ""),
            String(pr.isDraft ?? ""),
            String(pr.mergeable === "CONFLICTING"),
            String(pr.reviewDecision === "APPROVED"),
            "0",
            "0",
            pr.reviewDecision === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : String(pr.mergeable ?? ""),
            String((pr.comments ?? []).length),
            pipelineStatus,
            String(pr.url ?? "")
        ];
    }
    fields = values.join(US);
}

if (!fields) process.exit(1);

// An empty iid is a valid result ("no open MR/PR on this branch") and gets
// cached too, otherwise every render re-spawns a refresher on such branches.
writeCache(`${nowSeconds}${US}${provider}${US}${fields}${US}${fetchEpoch}`);
