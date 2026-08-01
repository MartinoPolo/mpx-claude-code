// The palette both status-line renderers draw with, derived from the colors the
// terminal is actually configured with instead of from fixed xterm-256 indices.
//
// Why this exists: palette indices 16-255 are constants. A color scheme only
// remaps 0-15, so a bar painted in fg(74)/fg(245)/fg(240) rendered identically
// whichever scheme Windows Terminal was set to — and rendered wrong on a light
// one, because those three greys were picked by eye against a dark background.
// Reading the scheme and emitting 24-bit color instead lets every neutral be
// *derived* from that scheme's own foreground and background, so the rank
// hierarchy (white > gray > dim > bar-empty) holds on any of them and inverts
// correctly on a light scheme.
//
// The background blended against is whatever is actually on screen, which is not
// always the profile's: `cc` and `ccw` repaint the pane with OSC 11 at launch
// (scripts/account-color.mts), so the Windows Terminal profile that started the
// shell stops describing it. Those launchers export the account they painted as
// CLAUDE_PANE_ACCOUNT, and its presence is the only evidence an OSC 11 was sent
// at all — which is why this reads an env var rather than looking the account up
// from CLAUDE_CONFIG_DIR itself. A bare `claude` sets a config dir but paints
// nothing, so inferring the tint from it would derive the whole palette against
// a background the pane is not showing.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { readFileOrEmpty } from "./statusline-ansi.mts";

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const repoFile = (name: string): string => path.resolve(SELF_DIR, "..", "..", name);

// --- Scheme resolution -------------------------------------------------------

/**
 * Windows Terminal's own settings, which carry any scheme the user defined
 * themselves plus the per-profile `colorScheme` assignment. Absent everywhere
 * that is not Windows Terminal, which is the signal to fall back.
 */
function windowsTerminalSettingsPath(): string {
    const localAppData = process.env.LOCALAPPDATA ?? "";
    if (localAppData === "") {
        return "";
    }
    return path.join(
        localAppData,
        "Packages",
        "Microsoft.WindowsTerminal_8wekyb3d8bbwe",
        "LocalState",
        "settings.json"
    );
}

/**
 * settings.json is JSONC — Windows Terminal writes `//` comments and leaves
 * trailing commas behind when the settings UI removes a key. JSON.parse rejects
 * both, so they are stripped first. String contents are stepped over rather than
 * regex-matched, because a `//` inside a `startingDirectory` or an icon path is
 * ordinary data and deleting it corrupts the file.
 */
function parseJsonc(text: string): unknown {
    let out = "";
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inString) {
            out += char;
            if (char === "\\") {
                out += text[i + 1] ?? "";
                i++;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
            out += char;
            continue;
        }
        if (char === "/" && text[i + 1] === "/") {
            while (i < text.length && text[i] !== "\n") {
                i++;
            }
            out += "\n";
            continue;
        }
        if (char === "/" && text[i + 1] === "*") {
            const end = text.indexOf("*/", i);
            i = end === -1 ? text.length : end + 1;
            continue;
        }
        out += char;
    }
    try {
        return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1")) as unknown;
    } catch {
        return undefined;
    }
}

type Scheme = Record<string, string>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

/**
 * Which scheme this pane is showing. WT_PROFILE_ID is set by Windows Terminal
 * itself, so the profile can be identified without guessing from the working
 * directory. `Campbell` is Windows Terminal's own default when nothing assigns a
 * scheme, which is the common case here — none of the 32 profiles set one.
 */
function resolveSchemeName(settings: Record<string, unknown> | undefined): string {
    const profiles = asRecord(settings?.["profiles"]);
    const profileId = process.env.WT_PROFILE_ID ?? "";
    const list = Array.isArray(profiles?.["list"]) ? (profiles["list"] as unknown[]) : [];
    for (const entry of list) {
        const profile = asRecord(entry);
        if (profile !== undefined && profile["guid"] === profileId) {
            const scheme = profile["colorScheme"];
            if (typeof scheme === "string") {
                return scheme;
            }
            break;
        }
    }
    const fallback = asRecord(profiles?.["defaults"])?.["colorScheme"];
    return typeof fallback === "string" ? fallback : "Campbell";
}

/**
 * User-defined schemes win over the built-ins, matching Windows Terminal's own
 * precedence. The built-ins are vendored into statusline-schemes.json rather
 * than read from the installed defaults.json, because that file sits under a
 * version-stamped WindowsApps directory whose parent cannot be listed — locating
 * it costs a PowerShell process, and this runs on every render tick.
 */
function loadScheme(name: string, settings: Record<string, unknown> | undefined): Scheme | undefined {
    const userSchemes = Array.isArray(settings?.["schemes"]) ? (settings["schemes"] as unknown[]) : [];
    for (const entry of userSchemes) {
        const scheme = asRecord(entry);
        if (scheme !== undefined && scheme["name"] === name) {
            return scheme as Scheme;
        }
    }
    const vendored = asRecord(parseJsonc(readFileOrEmpty(repoFile("statusline-schemes.json"))));
    const match = asRecord(vendored?.[name]) ?? asRecord(vendored?.["Campbell"]);
    return match as Scheme | undefined;
}

// --- Account resolution ------------------------------------------------------

export type AccountName = "personal" | "work";

/**
 * `.claude-work` as the config dir is the work account; anything else is
 * personal. Same predicate the bar's Work/Personal label already uses, kept in
 * one place so the tint and the label can never disagree.
 */
export function resolveAccount(configDir?: string): AccountName {
    const dir = configDir ?? process.env.CLAUDE_CONFIG_DIR ?? "";
    return dir.includes("claude-work") ? "work" : "personal";
}

/**
 * The tint account-color.mts paints for an account. Takes a plain string because
 * its caller here is an environment variable: an unrecognised name simply has no
 * entry, which is the same "nothing was painted" answer as an absent one.
 */
export function accountBackground(account: string): string | undefined {
    const accounts = asRecord(parseJsonc(readFileOrEmpty(repoFile("statusline-accounts.json"))));
    const entry = asRecord(accounts?.[account]);
    const background = entry?.["background"];
    return typeof background === "string" ? background : undefined;
}

// --- Color math --------------------------------------------------------------

type Rgb = readonly [number, number, number];

const BLACK: Rgb = [0, 0, 0];

function parseHex(hex: string | undefined): Rgb | undefined {
    if (typeof hex !== "string") {
        return undefined;
    }
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (match === null) {
        return undefined;
    }
    const value = Number.parseInt(match[1], 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Straight sRGB interpolation, not a perceptual space. These tones stand in for
 * text drawn at partial opacity over the background, and that is exactly what
 * alpha compositing does — matching it keeps a "half-strength" grey looking like
 * one instead of like a separate hue.
 */
function mix(from: Rgb, to: Rgb, amount: number): Rgb {
    const t = Math.max(0, Math.min(1, amount));
    return [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t)
    ];
}

/** 24-bit foreground escape. Survives Claude Code's render pass; CSI beyond SGR does not. */
export function rgb(color: Rgb): string {
    return `\x1b[38;2;${color[0]};${color[1]};${color[2]}m`;
}

function channelLuminance(value: number): number {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(color: Rgb): number {
    return (
        0.2126 * channelLuminance(color[0]) +
        0.7152 * channelLuminance(color[1]) +
        0.0722 * channelLuminance(color[2])
    );
}

function contrastRatio(a: Rgb, b: Rgb): number {
    const first = relativeLuminance(a);
    const second = relativeLuminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * A scheme's own colors are not guaranteed to be legible on a background this
 * module did not choose. Campbell's red (#C50F1F) is the worked example: fine on
 * its near-black default, but only 2.4:1 against the account tints, where the old
 * fixed #ff0000 managed 4.7:1. Rather than special-casing that one scheme, any
 * color that lands under the floor is walked toward `lift` until it clears —
 * which is also what rescues a dark scheme color on a light scheme, since `lift`
 * follows the background.
 *
 * `dim` and `barEmpty` are exempt and set by explicit blend factors instead:
 * they are meant to recede, and the old palette had them at 2.64 and 1.93.
 */
const CONTRAST_FLOOR = 4.5;
/**
 * `white` is the bar's emphasis tone and has to stay clearly ahead of `gray`. On
 * a dark scheme it already is — brightWhite on a near-black background is well
 * past 7:1, so this floor never engages. On a light one both would otherwise be
 * clamped to the same 4.5 and land on the same color, erasing the rank; holding
 * white to AAA restores the gap.
 */
const EMPHASIS_FLOOR = 7;
const CONTRAST_SEARCH_STEPS = 12;

function ensureContrast(color: Rgb, background: Rgb, lift: Rgb, floor = CONTRAST_FLOOR): Rgb {
    if (contrastRatio(color, background) >= floor) {
        return color;
    }
    if (contrastRatio(lift, background) < floor) {
        return lift; // Nothing in reach clears the floor; the lightest option is the best available.
    }
    let low = 0;
    let high = 1;
    for (let step = 0; step < CONTRAST_SEARCH_STEPS; step++) {
        const mid = (low + high) / 2;
        if (contrastRatio(mix(color, lift, mid), background) >= floor) {
            high = mid;
        } else {
            low = mid;
        }
    }
    return mix(color, lift, high);
}

// --- Palette -----------------------------------------------------------------

export type Palette = {
    readonly white: string;
    readonly gray: string;
    readonly dim: string;
    readonly barEmpty: string;
    readonly accent: string;
    readonly warn: string;
    readonly contextYellow: string;
    readonly contextOrange: string;
    readonly contextRed: string;
    readonly amber: string;
    readonly personal: string;
    readonly work: string;
    readonly add: string;
    readonly del: string;
    readonly local: string;
    readonly mr: string;
    readonly session: string;
    readonly effortLow: string;
    readonly effortMedium: string;
    readonly effortHigh: string;
    readonly effortXhigh: string;
    readonly effortMax: string;
    readonly effortBudget: string;
    readonly tierHaiku: string;
};

/**
 * The three neutrals are the whole reason this module exists, so their blend
 * factors are pinned to what the old fixed indices produced on Campbell: 0.35
 * lands on #909090 where fg(245) was #8a8a8a, 0.62 on #565656 where fg(240) was
 * #585858, 0.72 on #414141 where fg(238) was #444444. Nothing about the bar's
 * appearance changes on the default scheme; every other scheme now gets the same
 * relationships instead of those literal greys.
 */
function derive(scheme: Scheme, background: Rgb): Palette {
    const color = (key: string, fallback: Rgb): Rgb => parseHex(scheme[key]) ?? fallback;

    const foreground = color("foreground", [204, 204, 204]);
    const brightWhite = color("brightWhite", foreground);
    const red = color("red", [197, 15, 31]);
    const brightRed = color("brightRed", red);
    const green = color("green", [19, 161, 14]);
    const yellow = color("yellow", [193, 156, 0]);
    const brightYellow = color("brightYellow", yellow);
    const cyan = color("cyan", [58, 150, 221]);
    const brightCyan = color("brightCyan", cyan);
    const brightPurple = color("brightPurple", [180, 0, 158]);

    const toward = (from: Rgb, amount: number): Rgb => mix(from, background, amount);

    // Which way "more legible" points depends on the background, so a light
    // scheme lifts its colors toward black instead of toward white.
    const lift = relativeLuminance(background) < 0.5 ? brightWhite : color("black", [12, 12, 12]);
    const legible = (value: Rgb): string => rgb(ensureContrast(value, background, lift));
    const emphatic = (value: Rgb): string => rgb(ensureContrast(value, background, lift, EMPHASIS_FLOOR));

    // The escalation ramp has to be three visibly separate steps climbing in
    // alarm. Schemes supply yellow and red but never a true orange, so the middle
    // step is mixed from them. It has to be built on plain `yellow`, not
    // `brightYellow`: several schemes — Campbell included — make brightYellow a
    // pale cream (#F9F1A5), and mixing cream toward red gives salmon, which reads
    // as a softer state than the yellow before it rather than a harsher one.
    const contextOrange = mix(yellow, red, 0.5);

    return {
        white: emphatic(brightWhite),
        gray: legible(toward(foreground, 0.35)),
        dim: rgb(toward(foreground, 0.62)),
        barEmpty: rgb(toward(foreground, 0.72)),
        accent: legible(cyan),
        // Warn and the ramp's top are both red and have to stay apart. Deriving
        // both from `red` fails: it is dark in most schemes, so the floor walks it
        // toward white and lands both on the same washed pink. Building on
        // brightRed instead — which is legible to begin with — leaves the floor
        // with nothing to do, and separating them by lightness reproduces the old
        // #ff0000 / #ff5f5f pairing, where warn was the lighter of the two.
        warn: legible(mix(brightRed, brightWhite, 0.3)),
        contextYellow: legible(yellow),
        contextOrange: legible(contextOrange),
        contextRed: legible(brightRed),
        // Amber wants to sit above `yellow` in brightness without reaching the
        // ramp's orange, so it is lifted toward brightYellow rather than mixed
        // toward red — the one direction that stays clear of the ramp entirely.
        amber: legible(mix(yellow, brightYellow, 0.35)),
        personal: legible(green),
        work: legible(mix(yellow, red, 0.3)),
        add: legible(green),
        del: legible(red),
        // Sand: "never left this machine". Pulled toward the foreground so it
        // stays legible on schemes whose yellow is dark enough to vanish.
        local: legible(mix(yellow, brightWhite, 0.45)),
        mr: legible(cyan),
        session: legible(mix(brightPurple, brightWhite, 0.4)),
        effortLow: legible(green),
        effortMedium: legible(yellow),
        effortHigh: legible(contextOrange),
        effortXhigh: legible(brightRed),
        effortMax: legible(mix(brightPurple, brightWhite, 0.45)),
        effortBudget: legible(brightCyan),
        // Haiku's pink has to stay clear of both the session heading and `max`
        // effort, which are the other two purples on screen; blending purple with
        // red rather than with white moves it along hue instead of lightness,
        // which is the axis those two already occupy.
        tierHaiku: legible(mix(brightPurple, brightRed, 0.5))
    };
}

let cached: Palette | undefined;

/**
 * Memoized because all three renderer modules want the palette and each
 * resolution parses Windows Terminal's settings plus a vendored scheme file. The
 * process is torn down and restarted every render tick, so a module-level cache
 * cannot go stale — a scheme change is picked up by the very next render.
 *
 * Every read is best-effort: a missing settings file, an unparseable one, or a
 * terminal that is not Windows Terminal all land on the vendored Campbell, which
 * is what the bar was tuned against anyway.
 */
export function loadPalette(): Palette {
    if (cached !== undefined) {
        return cached;
    }
    const settings = asRecord(parseJsonc(readFileOrEmpty(windowsTerminalSettingsPath())));
    const scheme = loadScheme(resolveSchemeName(settings), settings) ?? {};
    // The account the launcher actually painted comes first: it is the only
    // evidence that an OSC 11 was emitted at all. Without it the scheme's own
    // background is what the pane is showing, and deriving against that is what
    // makes a light scheme work rather than merely not crash.
    const background =
        parseHex(accountBackground(process.env.CLAUDE_PANE_ACCOUNT ?? "")) ??
        parseHex(scheme["background"]) ??
        BLACK;
    cached = derive(scheme, background);
    return cached;
}
