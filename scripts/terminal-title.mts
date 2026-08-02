#!/usr/bin/env node
// Names the Windows Terminal tab after the Claude account and the checkout it
// was launched in, so a personal and a work session are told apart at a glance,
// and carries the state marker that says whether the session is still working.
//
// Usage, from the cc/ccw shell functions in ~/.bashrc, where it writes the OSC:
//   node .../terminal-title.mts personal            # or: work
// and from the UserPromptSubmit, Stop and SessionStart hooks, where the account
// comes from CLAUDE_PANE_ACCOUNT rather than an argument and the title is handed
// to hooks/terminal-title-state.exe to assign:
//   node .../terminal-title.mts --state=busy --set-title   # or: idle
// `--print` writes the composed text to stdout instead, for inspection.
//
// Why the launcher also sets CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1: without it
// nothing written here survives. Claude Code drives the title from a React
// effect that assigns `process.title = "<glyph> <session summary>"` and re-fires
// on every status change — the busy spinner alone ticks every 960ms — so a title
// set at launch is replaced within a second of the first prompt.
//
// Disabling that also took away Claude Code's own ✳ (U+2733), which Windows
// Terminal renders in emoji presentation — the white asterisk on a green square
// that reads, from the tab strip alone, as "this session is waiting for you".
// The hooks above put it back: the glyph is dropped while a turn is running and
// restored when the turn stops. This is the state Claude Code itself signalled,
// not an approximation of it — its title glyph was likewise the animated spinner
// while busy and ✳ otherwise.
//
// The session summary stays traded away: it lives only in memory (it is in no
// transcript, session file, or history entry), so no hook can reconstruct it.
//
// Worktree name before project name because the worktree is what differs
// between panes — several tabs are usually open on one project, each on a
// different branch checkout — and a tab strip truncates from the right, so the
// distinguishing half has to come first. The glyph leads for the same reason.

import path from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ACCOUNTS_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "statusline-accounts.json");

/** BEL-terminated rather than ST, matching account-color.mts: both are accepted, BEL survives more shells intact. */
const oscSetTitle = (title: string): string => `\x1b]0;${title}\x07`;

export const SEPARATOR = " · ";

/**
 * `busy` carries no glyph here because the spinner supplies one: the helper
 * spawns a background ticker that prepends an animated braille frame to this
 * title every 100ms, which is the part a one-shot hook cannot do for itself. A
 * *static* busy glyph would be worse than none, sitting in the tab strip looking
 * exactly as attention-worthy as the idle marker it has to contrast with;
 * motion is what separates "still working" from "stopped, your move" at a
 * glance, and it is also the distinction Claude Code's own title drew.
 *
 * The idle marker is a free choice now that the title is ours — `✳` was only
 * ever mimicry of what Claude Code drew. An octagon rather than the obvious red
 * disc: tab colour already means *project* here, so the marker has to survive
 * sitting on a red tab, and a disc or a ring disappears into one while a
 * distinct silhouette does not. Restyling was never on the table — Windows
 * Terminal draws tab titles in the UI font, so the marker is whatever Segoe UI
 * Emoji already draws, with no way to recolour or outline it and no fallback to
 * the profile's own terminal font.
 *
 * Two states, not three: a `waiting` glyph on the Notification event was dropped
 * because Notification's firing conditions are wider than "needs you" and any
 * spurious fire re-marks a tab mid-turn — the exact failure the marker exists to
 * rule out. Stop already covers the case that matters.
 *
 * Three events drive them, and the third is only for the tabs the first two
 * cannot reach: UserPromptSubmit -> busy, Stop -> idle, and SessionStart ->
 * idle for `startup`, `resume` and `clear`.
 *
 * The two sources it deliberately skips are the ones that fire while a session
 * is working. `compact` cannot tell a manual `/compact`, after which the session
 * really is idle, from an automatic context-limit one, which fires mid-turn with
 * the turn still running; `fork` cannot tell a `--fork-session` launch, which is
 * a fresh idle session, from a background `/fork` of a session that is busy this
 * second. Either way the tab shares one console with a working session, and
 * marking a working tab as wanting attention is the failure this marker exists
 * to rule out. PreCompact is unhooked for the mirror-image reason: it would spin
 * the automatic case correctly and hand the manual case no event to clear it.
 *
 * That leaves manual `/compact` showing a stale idle marker for its duration.
 * Closing it needs the helper to mark the busy state as transient — a file keyed
 * by console pid, since a named object dies with the process that holds it — so
 * a `compact` SessionStart could clear only the busy states PreCompact itself
 * started. It is a real fix, not a free one.
 */
export const STATE_GLYPHS = {
    busy: "",
    idle: "🛑",
} as const;

export type TitleState = keyof typeof STATE_GLYPHS;

export function isTitleState(value: string): value is TitleState {
    return Object.hasOwn(STATE_GLYPHS, value);
}

export function withStateGlyph(title: string, state: TitleState): string {
    const glyph = STATE_GLYPHS[state];
    return glyph === "" ? title : `${glyph} ${title}`;
}

const TITLE_HELPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "hooks", "terminal-title-state.exe");

/**
 * Hands the composed title to hooks/terminal-title-state.exe, which attaches to
 * the terminal's console and writes it — and, for `busy`, leaves a background
 * ticker animating the spinner until the next `idle` call stops it.
 *
 * Silent on failure like everything else here: a missing or unbuilt helper
 * leaves the tab named whatever it already said, which is strictly better than
 * a hook that reports a problem into the turn it was only decorating.
 */
function applyTitle(title: string, state: TitleState): void {
    try {
        execFileSync(TITLE_HELPER, [state, title], { stdio: "ignore" });
    } catch {
        // Cosmetic; see above.
    }
}

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
    const flags = process.argv.slice(2).filter((argument) => argument.startsWith("--"));
    const verbose = flags.includes("--verbose");

    // The launcher names the account; hooks inherit it from the environment the
    // launcher exported for the status line, so neither has to repeat it.
    const target = process.argv.slice(2).find((argument) => !argument.startsWith("--"))
        ?? process.env.CLAUDE_PANE_ACCOUNT
        ?? "";

    const requestedState = flags.find((flag) => flag.startsWith("--state="))?.slice("--state=".length) ?? "idle";
    if (!isTitleState(requestedState)) {
        console.error(
            `terminal-title: unknown state "${requestedState}" (known: ${Object.keys(STATE_GLYPHS).join(", ")})`,
        );
        return;
    }

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
    const title = withStateGlyph(composeTitle(prefix, projectRoot, worktreeRoot), requestedState);

    // The launcher owns a terminal and writes the escape itself. A hook owns
    // nothing — its stdout is a pipe Claude Code reads, and on UserPromptSubmit
    // that pipe is appended to the model's prompt, so an escape written there
    // would land in the model's context rather than the tab. It hands the text
    // to the helper instead, which borrows the terminal's own console.
    //
    // Why the title is never written from here: a hook runs with a private
    // console of its own, so `process.title` (SetConsoleTitleW) would name a
    // console nothing displays, and libuv restores the title on exit besides.
    if (flags.includes("--set-title")) {
        applyTitle(title, requestedState);
    } else if (flags.includes("--print")) {
        process.stdout.write(title);
    } else {
        process.stdout.write(oscSetTitle(title));
    }

    if (verbose) {
        console.error(
            `terminal-title: ${target} ${requestedState} -> ${JSON.stringify(title)}, ` +
                `project ${projectRoot}, worktree ${worktreeRoot}, stdout is a TTY: ${process.stdout.isTTY === true}`,
        );
    }
}

/**
 * Compared as real paths, not resolved ones: the hooks reach this file through
 * `~/.claude/scripts`, a directory symlink onto the repository, while
 * import.meta.url is always the link's target. path.resolve normalises but does
 * not follow links, so the two spellings never matched and the hook ran a
 * module that only defined functions — an exit 0 that did nothing at all.
 */
const invokedPath = process.argv[1];
const realPathOrSelf = (value: string): string => {
    try {
        return realpathSync(value);
    } catch {
        return path.resolve(value);
    }
};
if (invokedPath !== undefined && realPathOrSelf(invokedPath) === realPathOrSelf(fileURLToPath(import.meta.url))) {
    main();
}
