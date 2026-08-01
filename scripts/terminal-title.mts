#!/usr/bin/env node
// Names the Windows Terminal tab after the Claude account and the checkout it
// was launched in, so a personal and a work session are told apart at a glance.
//
// Usage, from the cc/ccw shell functions in ~/.bashrc:
//   node .../terminal-title.mts personal   # or: work
//
// Why the launcher also sets CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1: without it
// nothing written here survives. Claude Code drives the title from a React
// effect that assigns `process.title = "<glyph> <session summary>"` and re-fires
// on every status change — the busy spinner alone ticks every 960ms — so a title
// set at launch is replaced within a second of the first prompt.
//
// Keeping that summary *and* a prefix is possible but was rejected as too much
// machinery: the summary lives only in memory (it is in no transcript, session
// file, or history entry), and libuv caches `process.title` after the first
// assignment, so re-prefixing it needs a PowerShell process per session polling
// GetConsoleTitleW through .NET's uncached [Console]::Title. The summary is the
// thing traded away instead.
//
// Worktree name before project name because the worktree is what differs
// between panes — several tabs are usually open on one project, each on a
// different branch checkout — and a tab strip truncates from the right, so the
// distinguishing half has to come first.
//
// OSC 0 rather than `process.title`: it is the sequence account-color.mts
// already established as surviving Git Bash's MSYS2 console translation, and
// using one mechanism for both keeps the launch path uniform.

import path from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ACCOUNTS_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "statusline-accounts.json");

/** BEL-terminated rather than ST, matching account-color.mts: both are accepted, BEL survives more shells intact. */
const oscSetTitle = (title: string): string => `\x1b]0;${title}\x07`;

export const SEPARATOR = " · ";

/**
 * `[P] agentic-setup · yoursafe-components` in a linked worktree, `[P]
 * yoursafe-components` in the project's own checkout. The two roots are equal
 * outside a worktree — and for a directory that is not a repository at all,
 * where the caller passes the working directory as both — and repeating the
 * same name either side of the separator would only cost width.
 */
export function composeTitle(prefix: string, projectRoot: string, worktreeRoot: string): string {
    const project = path.basename(projectRoot);
    const worktree = path.basename(worktreeRoot);
    return worktree === project ? `${prefix} ${project}` : `${prefix} ${worktree}${SEPARATOR}${project}`;
}

/**
 * `--git-common-dir` is the one root that a linked worktree shares with the
 * checkout it was created from: it resolves to the project's own `.git`
 * whichever worktree git is asked from, while `--show-toplevel` follows the
 * current one. Their parent and value respectively are the two names wanted.
 *
 * Any failure — git missing, not a repository, a bare repo whose common dir has
 * no meaningful parent — falls through to the working directory, which still
 * produces a correctly prefixed title.
 */
function resolveRoots(cwd: string): { projectRoot: string; worktreeRoot: string } {
    try {
        const output = execFileSync(
            "git",
            ["rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"],
            { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        );
        const lines = output.split("\n").map((line) => line.trim()).filter((line) => line !== "");
        const [commonDir, toplevel] = lines;
        if (commonDir === undefined || toplevel === undefined) {
            return { projectRoot: cwd, worktreeRoot: cwd };
        }
        return { projectRoot: path.dirname(commonDir), worktreeRoot: toplevel };
    } catch {
        return { projectRoot: cwd, worktreeRoot: cwd };
    }
}

function main(): void {
    const target = process.argv[2] ?? "";
    const verbose = process.argv.includes("--verbose");

    // Failing to title is cosmetic and must never stop Claude Code from
    // starting, so nothing here throws. It does report, though: a silent no-op
    // is indistinguishable from a terminal that ignored the sequence, and
    // telling those apart is the whole diagnostic value this script has.
    let accounts: Record<string, { tabPrefix?: string } | undefined>;
    try {
        accounts = JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8"));
    } catch (error) {
        console.error(`terminal-title: cannot read ${ACCOUNTS_FILE} - ${String(error)}`);
        return;
    }

    const prefix = accounts[target]?.tabPrefix;
    if (typeof prefix !== "string") {
        console.error(
            `terminal-title: no tabPrefix for "${target}" (known: ${Object.keys(accounts).join(", ")})`,
        );
        return;
    }

    const cwd = process.cwd();
    const { projectRoot, worktreeRoot } = resolveRoots(cwd);
    const title = composeTitle(prefix, projectRoot, worktreeRoot);
    process.stdout.write(oscSetTitle(title));

    if (verbose) {
        console.error(
            `terminal-title: ${target} -> ${JSON.stringify(title)}, ` +
                `project ${projectRoot}, worktree ${worktreeRoot}, stdout is a TTY: ${process.stdout.isTTY === true}`,
        );
    }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === path.resolve(fileURLToPath(import.meta.url))) {
    main();
}
