#!/usr/bin/env node
// Repaints the Windows Terminal pane to match the Claude account being launched,
// so personal and work sessions are distinguishable at a glance without needing
// a separate terminal profile per account.
//
// Usage, from the cc/ccw shell functions in ~/.bashrc:
//   node .../account-color.mts personal   # or: work
//   node .../account-color.mts reset      # restore the profile's own colors
//
// Those functions also export CLAUDE_PANE_ACCOUNT with the same name they pass
// here. That export is what tells the status line the pane was repainted, so it
// derives its palette against this background instead of the color scheme's —
// see lib/terminal-theme.mts. Both sides resolve the hex from the shared
// statusline-accounts.json, so only the account name has to travel.
//
// Why a node script rather than `printf` in bash: Git Bash's MSYS2 layer
// implements its own console translation and silently drops the OSC sequences it
// does not recognise. OSC 0 (window title) survives; OSC 11 (background) does
// not — verified by comparing bash, node and PowerShell writing to the same
// Windows Terminal pane. A native-Windows writer bypasses that layer entirely.
//
// Why not a Claude Code hook: SessionStart hook stdout is captured and fed to
// the model as context, so it never reaches the terminal. The launch site is the
// only place that both knows the account and owns the tty.
//
// Windows Terminal specifics (verified against the 1.24 source):
//   OSC 11 writes color-table index 262 and repoints the DefaultBackground alias;
//   a profile's configured `background` only seeds that value at startup, so this
//   overrides it. `unfocusedAppearance` and `useBackgroundImageForWindow` would
//   each undo the change on focus/paint, and neither is set on any profile here.
//   A settings.json reload also resets it — re-running a shell restores it.

import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ACCOUNTS_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "statusline-accounts.json");

/** BEL-terminated rather than ST: both are accepted, BEL survives more shells intact. */
const oscSetColor = (resource: number, color: string): string => `\x1b]${resource};${color}\x07`;
const oscResetColor = (resource: number): string => `\x1b]${resource}\x07`;

const BACKGROUND = 11;
const CURSOR = 12;
const RESET_BACKGROUND = 111;
const RESET_CURSOR = 112;

/**
 * One sequence per write. Concatenating OSC 11 and OSC 12 into a single write
 * puts two escape sequences in one buffer for the terminal's parser to split,
 * and a writer that emits them separately was observed to repaint a pane that
 * the concatenated form did not. Two syscalls cost nothing here.
 */
function emit(sequence: string): void {
    process.stdout.write(sequence);
}

function main(): void {
    const target = process.argv[2] ?? "";
    const verbose = process.argv.includes("--verbose");

    if (target === "reset") {
        emit(oscResetColor(RESET_BACKGROUND));
        emit(oscResetColor(RESET_CURSOR));
        if (verbose) console.error("account-color: reset background and cursor");
        return;
    }

    // Failing to tint is cosmetic and must never stop Claude Code from starting,
    // so nothing here throws. It does report, though: a silent no-op is
    // indistinguishable from a terminal that ignored the sequence, and telling
    // those apart is the whole diagnostic value this script has.
    let accounts: Record<string, { background?: string; cursorColor?: string } | undefined>;
    try {
        accounts = JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8"));
    } catch (error) {
        console.error(`account-color: cannot read ${ACCOUNTS_FILE} - ${String(error)}`);
        return;
    }

    const account = accounts[target];
    if (account === undefined) {
        console.error(
            `account-color: no entry for "${target}" (known: ${Object.keys(accounts).join(", ")})`,
        );
        return;
    }

    if (typeof account.background === "string") {
        emit(oscSetColor(BACKGROUND, account.background));
    }
    if (typeof account.cursorColor === "string") {
        emit(oscSetColor(CURSOR, account.cursorColor));
    }

    if (verbose) {
        console.error(
            `account-color: ${target} -> background ${account.background ?? "<none>"}, ` +
                `cursor ${account.cursorColor ?? "<none>"}, stdout is a TTY: ${process.stdout.isTTY === true}`,
        );
    }
}

main();
