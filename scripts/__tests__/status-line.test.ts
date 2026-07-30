import { describe, expect, it } from "vitest";

import {
    INDENT_GUARD,
    SEPARATOR,
    basename,
    buildBranchStateLine,
    buildBranchUrl,
    buildCompareUrl,
    buildDevServerSegments,
    buildFetchAge,
    buildGitDirt,
    buildGitSigns,
    buildLocationLine,
    buildModelLine,
    buildMrBlock,
    buildQuotaLine,
    buildSessionLine,
    buildUsageLine,
    effortGauge,
    expandBackslashEscapes,
    extractPayloadFields,
    formatPct,
    humanAge,
    cacheKey,
    hyperlink,
    toFileUrl,
    parseDefaultBranch,
    parseMrCacheLine,
    parsePorcelainV2,
    parsePortSchemes,
    parseWorktreePaths,
    progressBar,
    resolveProjectLocation,
    roundN,
    timeUntil,
    trimModelName
} from "../status-line.mts";

// Written out literally rather than imported, so a change to the shared ANSI
// helper cannot silently move the colors this line is specified to emit.
const RESET = "\x1b[0m";
const GRAY = "\x1b[38;5;245m";
const WHITE = "\x1b[38;5;255m";
const DIM = "\x1b[38;5;240m";
const ACCENT = "\x1b[38;5;74m";
const BAR_EMPTY = "\x1b[38;5;238m";
const WARN = "\x1b[38;5;203m";
const YELLOW = "\x1b[38;5;220m";
const ORANGE = "\x1b[38;5;208m";
const RED = "\x1b[38;5;196m";
const ADD = "\x1b[38;5;71m";
const DEL = "\x1b[38;5;167m";
const LOCAL = "\x1b[38;5;180m";
const DRAFT = "\x1b[38;5;180m";
const SESSION = "\x1b[1m\x1b[38;5;213m";
const MR = "\x1b[38;5;74m";

const UNIT_SEPARATOR = "\x1f";
const NOW = 1_700_000_000;

describe("progressBar", () => {
    it("is entirely empty at 0%", () => {
        expect(progressBar(0, 8)).toBe(`${BAR_EMPTY}░${RESET}`.repeat(8));
    });

    it("is entirely filled at 100%", () => {
        expect(progressBar(100, 8)).toBe(`${ACCENT}█${RESET}`.repeat(8));
    });

    it("truncates the filled cell count rather than rounding it", () => {
        // 37 * 8 / 100 = 2.96 -> 2 filled, matching bash integer division.
        expect(progressBar(37, 8)).toBe(`${ACCENT}█${RESET}`.repeat(2) + `${BAR_EMPTY}░${RESET}`.repeat(6));
    });

    it("defaults to ten cells", () => {
        expect(progressBar(50)).toBe(`${ACCENT}█${RESET}`.repeat(5) + `${BAR_EMPTY}░${RESET}`.repeat(5));
    });
});

describe("formatPct", () => {
    it("renders nothing for absent values", () => {
        expect(formatPct("")).toBe("");
        expect(formatPct("null")).toBe("");
    });

    it("rounds to a whole percent", () => {
        expect(formatPct("12.3")).toBe("12");
        expect(formatPct("72.5")).toBe("72");
        expect(formatPct("12.6")).toBe("13");
    });

    it("rounds exact halves to even, as C printf does", () => {
        expect(formatPct("0.5")).toBe("0");
        expect(formatPct("1.5")).toBe("2");
        expect(formatPct("2.5")).toBe("2");
    });

    it("keeps values above 100 intact so the caller can clamp them", () => {
        expect(formatPct("104")).toBe("104");
    });

    it("falls back to the leading numeric prefix for junk", () => {
        expect(formatPct("abc")).toBe("0");
        expect(formatPct("12abc")).toBe("12");
    });
});

describe("roundN", () => {
    it("renders nothing for absent values", () => {
        expect(roundN("", 3)).toBe("");
        expect(roundN("null", 3)).toBe("");
    });

    it("keeps trailing zeros at the requested precision", () => {
        expect(roundN("1.23", 3)).toBe("1.230");
        expect(roundN("0.5", 3)).toBe("0.500");
        expect(roundN("2", 3)).toBe("2.000");
    });

    it("truncates a double that sits just below the tie", () => {
        // 1.2345 is stored as 1.23449999..., so libc rounds it down.
        expect(roundN("1.2345", 3)).toBe("1.234");
    });

    it("rounds a sub-cent cost up into the third decimal", () => {
        expect(roundN("0.0005", 3)).toBe("0.001");
    });
});

describe("timeUntil", () => {
    it("renders nothing for absent values", () => {
        expect(timeUntil("", NOW)).toBe("");
        expect(timeUntil("null", NOW)).toBe("");
    });

    it("renders nothing once the reset has passed or is exactly now", () => {
        expect(timeUntil(String(NOW), NOW)).toBe("");
        expect(timeUntil(String(NOW - 5000), NOW)).toBe("");
    });

    it("renders days and hours past a day", () => {
        expect(timeUntil(String(NOW + 5 * 86400 + 5 * 3600), NOW)).toBe("5d 5h");
    });

    it("renders hours and minutes under a day", () => {
        expect(timeUntil(String(NOW + 3600 + 21 * 60), NOW)).toBe("1h 21m");
    });

    it("renders bare minutes under an hour", () => {
        expect(timeUntil(String(NOW + 7 * 60), NOW)).toBe("7m");
        expect(timeUntil(String(NOW + 30), NOW)).toBe("0m");
    });

    it("truncates a fractional epoch at the dot", () => {
        expect(timeUntil(`${NOW + 3600}.987`, NOW)).toBe("1h 0m");
    });

    it("accepts an ISO-8601 reset timestamp", () => {
        const iso = new Date((NOW + 2 * 3600) * 1000).toISOString();
        expect(timeUntil(iso, NOW)).toBe("2h 0m");
    });

    it("renders nothing for an unparseable timestamp", () => {
        expect(timeUntil("not a date", NOW)).toBe("");
    });
});

describe("humanAge", () => {
    it("uses the largest unit that fits", () => {
        expect(humanAge(0)).toBe("0s");
        expect(humanAge(45)).toBe("45s");
        expect(humanAge(59)).toBe("59s");
        expect(humanAge(60)).toBe("1m");
        expect(humanAge(3599)).toBe("59m");
        expect(humanAge(3600)).toBe("1h");
        expect(humanAge(86399)).toBe("23h");
        expect(humanAge(86400)).toBe("1d");
    });

    it("reports an unknown age for anything that is not a whole count of seconds", () => {
        expect(humanAge(-1)).toBe("?");
        expect(humanAge("abc")).toBe("?");
        expect(humanAge("")).toBe("?");
        expect(humanAge(1.5)).toBe("?");
    });
});

describe("parsePorcelainV2", () => {
    const header = [
        "# branch.oid 6007cfb42fb6c1f2f0440e06b3db99fc5f476b1a",
        "# branch.head main",
        "# branch.upstream origin/main",
        "# branch.ab +2 -3"
    ];

    it("reads branch, upstream and ahead/behind", () => {
        const status = parsePorcelainV2(header.join("\n") + "\n");
        expect(status).toMatchObject({
            branch: "main",
            hasUpstream: true,
            hasAheadBehind: true,
            ahead: 2,
            behind: 3
        });
    });

    it("returns an empty branch for no output at all", () => {
        expect(parsePorcelainV2("")).toMatchObject({ branch: "", hasUpstream: false, hasAheadBehind: false });
    });

    it("normalises the detached-HEAD placeholder", () => {
        expect(parsePorcelainV2("# branch.head (detached)\n").branch).toBe("detached");
    });

    it("marks a branch with no upstream", () => {
        const status = parsePorcelainV2("# branch.head feature\n");
        expect(status).toMatchObject({ branch: "feature", hasUpstream: false, hasAheadBehind: false });
    });

    it("marks an upstream that reports no branch.ab line", () => {
        const status = parsePorcelainV2("# branch.head gone-branch\n# branch.upstream origin/gone-branch\n");
        expect(status).toMatchObject({ hasUpstream: true, hasAheadBehind: false, ahead: 0, behind: 0 });
    });

    it("counts staged and unstaged columns independently", () => {
        const status = parsePorcelainV2(
            [
                ...header,
                "1 M. N... 100644 100644 100644 aaa bbb staged-only.txt",
                "1 .M N... 100644 100644 100644 aaa bbb unstaged-only.txt",
                "1 MM N... 100644 100644 100644 aaa bbb both.txt",
                "2 R. N... 100644 100644 100644 aaa bbb R100 new.txt\told.txt",
                "u UU N... 100644 100644 100644 100644 aaa bbb ccc conflicted.txt",
                "? untracked-one.txt",
                "? untracked-two.txt"
            ].join("\n") + "\n"
        );
        expect(status).toMatchObject({ staged: 3, unstaged: 2, conflicts: 1, untracked: 2 });
    });

    it("ignores a trailing unterminated line, as `while read` does", () => {
        expect(parsePorcelainV2("# branch.head main").branch).toBe("");
    });
});

describe("buildGitSigns", () => {
    const base = {
        branch: "main",
        hasUpstream: true,
        hasAheadBehind: true,
        ahead: 0,
        behind: 0,
        staged: 0,
        unstaged: 0,
        conflicts: 0,
        untracked: 0
    };

    it("emits nothing without a branch", () => {
        expect(buildGitSigns({ ...base, branch: "" })).toBe("");
    });

    it("marks a branch that never left this machine", () => {
        expect(buildGitSigns({ ...base, hasUpstream: false, hasAheadBehind: false })).toBe(`${LOCAL}local${RESET}`);
    });

    it("marks an upstream whose remote branch is gone", () => {
        expect(buildGitSigns({ ...base, hasAheadBehind: false })).toBe(`${WARN}remote deleted${RESET}`);
    });

    it("marks diverged, ahead, behind and in-sync branches", () => {
        expect(buildGitSigns({ ...base, ahead: 3, behind: 2 })).toBe(`${WARN}↑3↓2${RESET}`);
        expect(buildGitSigns({ ...base, ahead: 2 })).toBe(`${ADD}↑2${RESET}`);
        expect(buildGitSigns({ ...base, behind: 3 })).toBe(`${DEL}↓3${RESET}`);
        expect(buildGitSigns(base)).toBe(`${DIM}≡${RESET}`);
    });

    it("spells a diverged branch with both arrows so neither count loses its direction", () => {
        expect(buildGitSigns({ ...base, ahead: 3, behind: 2 })).toContain("↑3↓2");
    });

    it("links an unpushed count to the compare view, ahead and diverged alike", () => {
        const compareUrl = "https://github.com/me/repo/compare/main...dev";
        expect(buildGitSigns({ ...base, ahead: 2 }, compareUrl)).toBe(
            `${ADD}${hyperlink(compareUrl, "↑2")}${RESET}`
        );
        expect(buildGitSigns({ ...base, ahead: 3, behind: 2 }, compareUrl)).toBe(
            `${WARN}${hyperlink(compareUrl, "↑3↓2")}${RESET}`
        );
    });

    it("leaves states with nothing to compare unlinked", () => {
        const compareUrl = "https://github.com/me/repo/compare/main...dev";
        expect(buildGitSigns({ ...base, behind: 3 }, compareUrl)).toBe(`${DEL}↓3${RESET}`);
        expect(buildGitSigns(base, compareUrl)).toBe(`${DIM}≡${RESET}`);
    });

    it("keeps routine dirt DIM and reserves color for states git decides, not you", () => {
        const dirt = buildGitDirt({ ...base, staged: 1, unstaged: 2, untracked: 4 });
        for (const segment of dirt) {
            expect(segment.startsWith(DIM)).toBe(true);
        }
        expect(buildGitSigns(base).startsWith(DIM)).toBe(true);
        expect(buildGitSigns({ ...base, ahead: 3, behind: 2 }).startsWith(WARN)).toBe(true);
    });

    it("emits one compact symbol segment per non-zero count", () => {
        expect(buildGitDirt(base)).toEqual([]);
        expect(buildGitDirt({ ...base, branch: "", staged: 1 })).toEqual([]);
        expect(buildGitDirt({ ...base, staged: 1, unstaged: 2, untracked: 4, conflicts: 3 })).toEqual([
            `${DIM}+1${RESET}`,
            `${DIM}!2${RESET}`,
            `${DIM}?4${RESET}`,
            `${WARN}~3${RESET}`
        ]);
    });

    it("renders the git section without any emoji at all", () => {
        expect(buildGitDirt({ ...base, staged: 1, unstaged: 2, untracked: 4, conflicts: 3 }).join("")).not.toMatch(
            /\p{Extended_Pictographic}/u
        );
    });
});

describe("SEPARATOR", () => {
    it("is the one field separator, a spaced gray middle dot", () => {
        expect(SEPARATOR).toBe(` ${GRAY}·${RESET} `);
    });
});

describe("buildSessionLine", () => {
    it("leads with the account, then the title, then the short id", () => {
        expect(buildSessionLine("Personal", ADD, "my-session", "0123abcd", "")).toBe(
            `${ADD}Personal${RESET}${SEPARATOR}${SESSION}my-session${RESET}${SEPARATOR}${GRAY}#0123abcd${RESET}`
        );
    });

    it("links the short id to the transcript file when its URL is known", () => {
        expect(buildSessionLine("Personal", ADD, "", "0123abcd", "file:///c/t.jsonl")).toBe(
            `${ADD}Personal${RESET}${SEPARATOR}${GRAY}${hyperlink("file:///c/t.jsonl", "#0123abcd")}${RESET}`
        );
    });

    it("drops the title field when the session is unnamed", () => {
        expect(buildSessionLine("Work", LOCAL, "", "0123abcd", "")).toBe(
            `${LOCAL}Work${RESET}${SEPARATOR}${GRAY}#0123abcd${RESET}`
        );
    });

    it("drops the id field when there is no session id", () => {
        expect(buildSessionLine("Personal", ADD, "my-session", "", "file:///c/t.jsonl")).toBe(
            `${ADD}Personal${RESET}${SEPARATOR}${SESSION}my-session${RESET}`
        );
    });
});

describe("trimModelName", () => {
    it("shortens the spelled-out context note to the bare size", () => {
        expect(trimModelName("Opus 5 (1M context)")).toBe("Opus 5 (1M)");
        expect(trimModelName("Sonnet 5 (200K context)")).toBe("Sonnet 5 (200K)");
    });

    it("leaves a name without the note untouched", () => {
        expect(trimModelName("Opus 5")).toBe("Opus 5");
    });
});

describe("effortGauge", () => {
    it("fills one diamond per level, five slots in total", () => {
        expect(effortGauge("low")).toBe("◆◇◇◇◇");
        expect(effortGauge("medium")).toBe("◆◆◇◇◇");
        expect(effortGauge("high")).toBe("◆◆◆◇◇");
        expect(effortGauge("xhigh")).toBe("◆◆◆◆◇");
        expect(effortGauge("max")).toBe("◆◆◆◆◆");
    });

    it("keeps the old angle-bracket spelling for a level it does not know", () => {
        expect(effortGauge("turbo")).toBe("<turbo>");
        expect(effortGauge("")).toBe("");
    });
});

describe("buildModelLine", () => {
    it("omits the gauge when no effort is reported", () => {
        expect(buildModelLine("Opus 5", "")).toBe(`${ACCENT}Opus 5${RESET}`);
    });

    it("renders the model with its effort gauge", () => {
        expect(buildModelLine("Opus 5 (1M context)", "high")).toBe(
            `${ACCENT}Opus 5 (1M)${RESET}${SEPARATOR}${GRAY}◆◆◆◇◇${RESET}`
        );
    });
});

describe("buildLocationLine", () => {
    const BRANCH_ICON = "\ue725";
    const VSCODE_ICON = "\u{f0a1e}";
    const empty = {
        projectName: "repo",
        projectUrl: "",
        worktreeName: "",
        worktreeUrl: "",
        projectEditorUrl: "",
        worktreeEditorUrl: "",
        branch: "",
        branchUrl: "",
        devServers: [] as string[],
        mrBlock: ""
    };

    it("shows only the project name outside a repo", () => {
        expect(buildLocationLine(empty)).toBe(`${WHITE}repo${RESET}`);
    });

    it("puts the branch right after the name, with the branch glyph", () => {
        expect(buildLocationLine({ ...empty, branch: "main" })).toBe(
            `${WHITE}repo${RESET}${SEPARATOR}${GRAY}${BRANCH_ICON} main${RESET}`
        );
    });

    it("links the branch name to its remote URL, leaving the glyph outside the link", () => {
        expect(
            buildLocationLine({ ...empty, branch: "main", branchUrl: "https://github.com/me/repo/tree/main" })
        ).toBe(
            `${WHITE}repo${RESET}${SEPARATOR}` +
                `${GRAY}${BRANCH_ICON} ${hyperlink("https://github.com/me/repo/tree/main", "main")}${RESET}`
        );
    });

    it("names both halves of a worktree, project gray and worktree white", () => {
        expect(
            buildLocationLine({
                ...empty,
                projectUrl: "file:///c/repo/",
                worktreeName: "wt-fix",
                worktreeUrl: "file:///c/repo-wt/"
            })
        ).toBe(
            `${GRAY}${hyperlink("file:///c/repo/", "repo")}${RESET}${GRAY}/${RESET}` +
                `${WHITE}${hyperlink("file:///c/repo-wt/", "wt-fix")}${RESET}`
        );
    });

    it("gives each worktree half its own editor icon", () => {
        expect(
            buildLocationLine({
                ...empty,
                worktreeName: "wt-fix",
                projectEditorUrl: "file:///c/open-main.url",
                worktreeEditorUrl: "file:///c/open-wt.url"
            })
        ).toBe(
            `${GRAY}repo${RESET} ${GRAY}${hyperlink("file:///c/open-main.url", VSCODE_ICON)}${RESET} ${GRAY}/${RESET}` +
                `${WHITE}wt-fix${RESET} ${GRAY}${hyperlink("file:///c/open-wt.url", VSCODE_ICON)}${RESET}`
        );
    });

    it("appends the MR block even when there is no branch section", () => {
        expect(buildLocationLine({ ...empty, mrBlock: `${MR}#42${RESET}` })).toBe(
            `${WHITE}repo${RESET}${SEPARATOR}${MR}#42${RESET}`
        );
    });

    it("joins name+editor, branch, dev servers and MR block in that order", () => {
        expect(
            buildLocationLine({
                ...empty,
                branch: "main",
                projectEditorUrl: "file:///c/open.url",
                devServers: [`${DIM}:8100${RESET}`],
                mrBlock: `${MR}#42${RESET}`
            })
        ).toBe(
            `${WHITE}repo${RESET} ${GRAY}${hyperlink("file:///c/open.url", VSCODE_ICON)}${RESET}` +
                `${SEPARATOR}${GRAY}${BRANCH_ICON} main${RESET}` +
                `${SEPARATOR}${DIM}:8100${RESET}${SEPARATOR}${MR}#42${RESET}`
        );
    });

    it("links the project name when a folder URL is given", () => {
        expect(buildLocationLine({ ...empty, projectUrl: "file:///c/repo/" })).toBe(
            `${WHITE}${hyperlink("file:///c/repo/", "repo")}${RESET}`
        );
    });

    it("attaches the VS Code glyph directly after the project name", () => {
        expect(buildLocationLine({ ...empty, projectEditorUrl: "file:///c/open.url" })).toBe(
            `${WHITE}repo${RESET} ${GRAY}${hyperlink("file:///c/open.url", VSCODE_ICON)}${RESET}`
        );
    });

    it("keeps the name readable when no URL could be built", () => {
        expect(buildLocationLine(empty)).not.toContain("\x1b]8");
    });
});

describe("parseWorktreePaths", () => {
    it("reads common dir and toplevel from the two rev-parse lines", () => {
        expect(parseWorktreePaths("C:/repo/.git\nC:/repo-wt\n")).toEqual({
            commonDir: "C:/repo/.git",
            toplevel: "C:/repo-wt"
        });
    });

    it("returns nothing when either line is missing", () => {
        expect(parseWorktreePaths("C:/repo/.git\n")).toBeUndefined();
        expect(parseWorktreePaths("")).toBeUndefined();
    });
});

describe("resolveProjectLocation", () => {
    it("uses the cwd alone in a main checkout, where common dir sits inside the toplevel", () => {
        const location = resolveProjectLocation("C:\\p\\repo", { commonDir: "C:/p/repo/.git", toplevel: "C:/p/repo" });
        expect(location.projectName).toBe("repo");
        expect(location.worktreeName).toBe("");
        expect(location.projectDir).toBe("C:\\p\\repo");
    });

    it("splits a linked worktree into project and worktree halves", () => {
        const location = resolveProjectLocation("C:\\p\\repo-wt", {
            commonDir: "C:/p/repo/.git",
            toplevel: "C:/p/repo-wt"
        });
        expect(location.projectName).toBe("repo");
        expect(location.worktreeName).toBe("repo-wt");
        expect(location.projectUrl).toBe("file:///C:/p/repo/");
        expect(location.worktreeUrl).toBe("file:///C:/p/repo-wt/");
        expect(location.projectDir).toBe("C:/p/repo");
    });

    it("survives git's forward slashes against a backslashed cwd", () => {
        const location = resolveProjectLocation("C:\\p\\repo", { commonDir: "C:/P/REPO/.git", toplevel: "C:/p/repo" });
        expect(location.worktreeName).toBe("");
    });

    it("falls back to the cwd when rev-parse produced nothing", () => {
        const location = resolveProjectLocation("C:\\p\\repo", undefined);
        expect(location.projectName).toBe("repo");
        expect(location.worktreeName).toBe("");
    });
});

describe("dev server segments", () => {
    const PENCIL_ICON = "\u{f03eb}";

    it("keeps the scheme of every well-formed probe line and drops the rest", () => {
        const cache = `8100${UNIT_SEPARATOR}https\n8101${UNIT_SEPARATOR}http\n8102${UNIT_SEPARATOR}down\njunk\n`;
        expect(parsePortSchemes(cache)).toEqual(
            new Map([
                [8100, "https"],
                [8101, "http"]
            ])
        );
        expect(parsePortSchemes("")).toEqual(new Map());
    });

    it("colors a listening port green and a silent one dim, both linked to the browser", () => {
        expect(buildDevServerSegments([8100, 8101], new Map([[8100, "http"]]), "")).toEqual([
            `${ADD}${hyperlink("http://localhost:8100", ":8100")}${RESET}`,
            `${DIM}${hyperlink("http://localhost:8101", ":8101")}${RESET}`
        ]);
    });

    it("links a TLS dev server over https, since http would draw an empty response", () => {
        expect(buildDevServerSegments([8100], new Map([[8100, "https"]]), "")).toEqual([
            `${ADD}${hyperlink("https://localhost:8100", ":8100")}${RESET}`
        ]);
    });

    it("closes a configured port list with a dim pencil linking to the config", () => {
        expect(buildDevServerSegments([8100], new Map(), "file:///c/ports.json")).toEqual([
            `${DIM}${hyperlink("http://localhost:8100", ":8100")}${RESET}`,
            `${DIM}${hyperlink("file:///c/ports.json", PENCIL_ICON)}${RESET}`
        ]);
    });

    it("offers a dim ports hint when the project has no ports configured", () => {
        expect(buildDevServerSegments([], new Map(), "file:///c/ports.json")).toEqual([
            `${DIM}${hyperlink("file:///c/ports.json", `${PENCIL_ICON} ports`)}${RESET}`
        ]);
    });

    it("stays entirely silent without ports or a config URL", () => {
        expect(buildDevServerSegments([], new Map(), "")).toEqual([]);
    });
});

describe("buildBranchUrl", () => {
    it("converts an scp-like remote to the GitHub tree URL", () => {
        expect(buildBranchUrl("git@github.com:me/repo.git", "main")).toBe(
            "https://github.com/me/repo/tree/main"
        );
    });

    it("strips .git from an https remote and keeps the host's scheme", () => {
        expect(buildBranchUrl("https://github.com/me/repo.git", "main")).toBe(
            "https://github.com/me/repo/tree/main"
        );
    });

    it("nests the tree path under /-/ for a GitLab host", () => {
        expect(buildBranchUrl("git@gitlab.com:group/repo.git", "main")).toBe(
            "https://gitlab.com/group/repo/-/tree/main"
        );
    });

    it("rewrites ssh:// remotes to https and drops the ssh port", () => {
        expect(buildBranchUrl("ssh://git@gitlab.example.com:2222/group/repo.git", "dev")).toBe(
            "https://gitlab.example.com/group/repo/-/tree/dev"
        );
    });

    it("keeps slashes in a branch name while encoding what needs it", () => {
        expect(buildBranchUrl("git@github.com:me/repo.git", "feat/#12 fix")).toBe(
            "https://github.com/me/repo/tree/feat/%2312%20fix"
        );
    });

    it("returns nothing for an empty, branchless or unparseable remote", () => {
        expect(buildBranchUrl("", "main")).toBe("");
        expect(buildBranchUrl("git@github.com:me/repo.git", "")).toBe("");
        expect(buildBranchUrl("/local/bare/repo.git", "main")).toBe("");
    });
});

describe("buildCompareUrl", () => {
    it("spells base...head against the host's compare path", () => {
        expect(buildCompareUrl("git@github.com:me/repo.git", "main", "dev")).toBe(
            "https://github.com/me/repo/compare/main...dev"
        );
        expect(buildCompareUrl("git@gitlab.com:group/repo.git", "main", "dev")).toBe(
            "https://gitlab.com/group/repo/-/compare/main...dev"
        );
    });

    it("keeps slashes in branch names while encoding what needs it", () => {
        expect(buildCompareUrl("git@github.com:me/repo.git", "main", "feat/#12 fix")).toBe(
            "https://github.com/me/repo/compare/main...feat/%2312%20fix"
        );
    });

    it("returns nothing when either side is missing or the two are the same", () => {
        expect(buildCompareUrl("git@github.com:me/repo.git", "", "dev")).toBe("");
        expect(buildCompareUrl("git@github.com:me/repo.git", "main", "")).toBe("");
        expect(buildCompareUrl("git@github.com:me/repo.git", "main", "main")).toBe("");
        expect(buildCompareUrl("/local/bare/repo.git", "main", "dev")).toBe("");
    });
});

describe("parseDefaultBranch", () => {
    it("prefers the branch origin/HEAD points at", () => {
        const refs = "origin/HEAD\torigin/dev\norigin/main\t\norigin/master\t\n";
        expect(parseDefaultBranch(refs)).toBe("dev");
    });

    it("falls back to main, then master, for a clone with no origin/HEAD", () => {
        expect(parseDefaultBranch("origin/main\t\norigin/master\t\n")).toBe("main");
        expect(parseDefaultBranch("origin/master\t\n")).toBe("master");
    });

    it("returns nothing when no candidate ref exists", () => {
        expect(parseDefaultBranch("")).toBe("");
        expect(parseDefaultBranch("upstream/main\t\n")).toBe("");
    });
});

describe("hyperlink", () => {
    // A `ESC \` terminator would be re-read by expandBackslashEscapes and eat the
    // label's first character; `\c` would truncate the whole line.
    it("terminates with BEL so no label can be swallowed as an escape", () => {
        expect(hyperlink("file:///c/code/", "📁 code")).toBe("\x1b]8;;file:///c/code/\x07📁 code\x1b]8;;\x07");
    });

    it("survives the backslash expansion every line is emitted through", () => {
        const link = hyperlink("file:///c/trace/", "trace");
        expect(expandBackslashEscapes(link)).toEqual({ text: link, truncated: false });
    });
});

describe("toFileUrl", () => {
    it("turns a Windows path into a three-slash file URL", () => {
        expect(toFileUrl("C:\\_MP_projects\\mpx-claude-code")).toBe("file:///C:/_MP_projects/mpx-claude-code");
    });

    it("keeps a POSIX path from growing a fourth slash", () => {
        expect(toFileUrl("/home/me/repo")).toBe("file:///home/me/repo");
    });

    it("drops a trailing separator so the caller controls it", () => {
        expect(toFileUrl("C:\\repo\\")).toBe("file:///C:/repo");
    });

    it("encodes the characters that would otherwise end the path", () => {
        expect(toFileUrl("/home/me/my repo#1?x")).toBe("file:///home/me/my%20repo%231%3Fx");
    });
});

describe("buildBranchStateLine", () => {
    const empty = { gitSigns: "", gitDirt: [] as string[], fetchAge: "" };

    it("is empty outside a repo, so the row is dropped entirely", () => {
        expect(buildBranchStateLine(empty)).toBe("");
    });

    it("joins signs, every dirt kind and the fetch age, indented under the location line", () => {
        expect(
            buildBranchStateLine({
                gitSigns: `${DIM}≡${RESET}`,
                gitDirt: [`${DIM}+1${RESET}`, `${DIM}!2${RESET}`, `${DIM}?4${RESET}`, `${WARN}~3${RESET}`],
                fetchAge: `${DIM}10m ago${RESET}`
            })
        ).toBe(
            `${INDENT_GUARD}   ${DIM}≡${RESET}${SEPARATOR}${DIM}+1${RESET}${SEPARATOR}${DIM}!2${RESET}` +
                `${SEPARATOR}${DIM}?4${RESET}${SEPARATOR}${WARN}~3${RESET}` +
                `${SEPARATOR}${DIM}10m ago${RESET}`
        );
    });

    it("never dangles a separator when only one field has content", () => {
        expect(buildBranchStateLine({ ...empty, gitSigns: `${DIM}≡${RESET}` })).toBe(
            `${INDENT_GUARD}   ${DIM}≡${RESET}`
        );
        expect(buildBranchStateLine({ ...empty, fetchAge: `${DIM}2h ago${RESET}` })).toBe(
            `${INDENT_GUARD}   ${DIM}2h ago${RESET}`
        );
    });

    it("leads with the braille blank so a whitespace trim cannot eat the indent", () => {
        expect(INDENT_GUARD).toBe("⠀");
        expect(`${INDENT_GUARD}   x`.trim()).toBe(`${INDENT_GUARD}   x`);
    });
});

describe("buildUsageLine", () => {
    const empty = {
        sessionTokensIn: "",
        tokensK: "",
        ctxPct: "",
        usdDisplay: "",
        czkDisplay: ""
    };

    it("emits nothing at all when nothing is known, so the row is dropped", () => {
        expect(buildUsageLine(empty)).toBe("");
    });

    it("shows the percentage alone when no token count is available", () => {
        expect(buildUsageLine({ ...empty, ctxPct: "42" })).toBe(`${GRAY}42%${RESET}`);
    });

    it("shows tokens with the percentage in parentheses, with no flame prefix", () => {
        expect(buildUsageLine({ ...empty, sessionTokensIn: "52340", tokensK: "52", ctxPct: "26" })).toBe(
            `${GRAY}52k (26%)${RESET}`
        );
    });

    it("escalates the context color at exactly 100000, 140000 and 180000 tokens", () => {
        const colorFor = (tokens: string) =>
            buildUsageLine({ ...empty, sessionTokensIn: tokens, tokensK: "1" }).slice(0, GRAY.length);
        expect(colorFor("99999")).toBe(GRAY);
        expect(colorFor("100000")).toBe(YELLOW);
        expect(colorFor("139999")).toBe(YELLOW);
        expect(colorFor("140000")).toBe(ORANGE);
        expect(colorFor("179999")).toBe(ORANGE);
        expect(colorFor("180000")).toBe(RED);
    });

    it("moves the escalation with the compaction limit rather than the model window", () => {
        const colorFor = (tokens: string, compactLimit: number) =>
            buildUsageLine({ ...empty, sessionTokensIn: tokens, tokensK: "1", compactLimit }).slice(0, GRAY.length);
        // A 400k limit puts the same fractions at 200k / 280k / 360k.
        expect(colorFor("180000", 400000)).toBe(GRAY);
        expect(colorFor("200000", 400000)).toBe(YELLOW);
        expect(colorFor("280000", 400000)).toBe(ORANGE);
        expect(colorFor("360000", 400000)).toBe(RED);
    });

    it("draws no bar without both a token count and a limit", () => {
        expect(buildUsageLine({ ...empty, sessionTokensIn: "100000", tokensK: "100" })).not.toContain(BAR_EMPTY);
        expect(buildUsageLine({ ...empty, compactLimit: 200000 })).not.toContain(BAR_EMPTY);
    });

    it("fills the bar against the compaction limit, in the context color", () => {
        const line = buildUsageLine({ ...empty, sessionTokensIn: "100000", tokensK: "100", compactLimit: 200000 });
        // 50% of the limit: five filled cells, five empty, all filled ones yellow.
        expect(line.split(`${YELLOW}█${RESET}`).length - 1).toBe(5);
        expect(line.split(`${BAR_EMPTY}░${RESET}`).length - 1).toBe(5);
    });

    it("caps the bar at full rather than overflowing past the limit", () => {
        const line = buildUsageLine({ ...empty, sessionTokensIn: "400000", tokensK: "400", compactLimit: 200000 });
        expect(line.split(`${RED}█${RESET}`).length - 1).toBe(10);
        expect(line).not.toContain(BAR_EMPTY);
    });

    it("keeps the percentage reading against the model window, not the limit", () => {
        const line = buildUsageLine({
            ...empty,
            sessionTokensIn: "118000",
            tokensK: "118",
            ctxPct: "11",
            compactLimit: 200000
        });
        expect(line).toContain("118k (11%)");
    });

    it("appends the converted cost only when a USD figure exists", () => {
        expect(buildUsageLine({ ...empty, czkDisplay: "11.71Kč" })).toBe("");
        expect(buildUsageLine({ ...empty, usdDisplay: "0.500", czkDisplay: "11.71Kč" })).toBe(
            `${DIM}$0.500${RESET}${SEPARATOR}${DIM}11.71Kč${RESET}`
        );
    });

    it("dims the cost so it never competes with the context gauge", () => {
        expect(buildUsageLine({ ...empty, ctxPct: "42", usdDisplay: "0.500" })).toBe(
            `${GRAY}42%${RESET}${SEPARATOR}${DIM}$0.500${RESET}`
        );
    });
});

describe("buildQuotaLine", () => {
    const USAGE_URL = "https://claude.ai/settings/usage";
    const live = {
        fiveRaw: "37",
        fiveResets: "",
        sevenRaw: "61",
        sevenResets: "",
        usageSource: "live" as const,
        usageAgeSeconds: 0,
        now: NOW
    };

    it("emits nothing without a five-hour figure", () => {
        expect(buildQuotaLine({ ...live, fiveRaw: "" })).toBe("");
        expect(buildQuotaLine({ ...live, fiveRaw: "null" })).toBe("");
    });

    it("renders both windows separated by the shared separator", () => {
        expect(buildQuotaLine(live)).toBe(
            `${GRAY}${hyperlink(USAGE_URL, "5h")} ${progressBar(37, 8)} 37%${SEPARATOR}${GRAY}${hyperlink(USAGE_URL, "7d")} ${progressBar(61, 8)} 61%${RESET}`
        );
    });

    it("falls back to n/a when the seven-day window is unknown", () => {
        expect(buildQuotaLine({ ...live, sevenRaw: "" })).toBe(
            `${GRAY}${hyperlink(USAGE_URL, "5h")} ${progressBar(37, 8)} 37%${SEPARATOR}${GRAY}${hyperlink(USAGE_URL, "7d")} n/a${RESET}`
        );
    });

    it("clamps a percentage above 100", () => {
        expect(buildQuotaLine({ ...live, fiveRaw: "104", sevenRaw: "" })).toBe(
            `${GRAY}${hyperlink(USAGE_URL, "5h")} ${progressBar(100, 8)} 100%${SEPARATOR}${GRAY}${hyperlink(USAGE_URL, "7d")} n/a${RESET}`
        );
    });

    it("appends countdowns when a reset time is known", () => {
        const line = buildQuotaLine({
            ...live,
            fiveResets: String(NOW + 3600 + 21 * 60),
            sevenResets: String(NOW + 5 * 86400)
        });
        expect(line).toContain(` ${DIM}1h 21m${RESET}`);
        expect(line).toContain(` ${DIM}5d 0h${RESET}`);
    });

    it("omits a countdown whose reset has already passed", () => {
        expect(buildQuotaLine({ ...live, fiveResets: String(NOW - 1) })).toBe(buildQuotaLine(live));
    });

    it("never ages live data, however long ago the session started", () => {
        expect(buildQuotaLine({ ...live, usageAgeSeconds: 99999 })).toBe(buildQuotaLine(live));
    });

    it("adds a muted age note once cached data passes 15 minutes", () => {
        const fresh = { ...live, usageSource: "cache" as const, usageAgeSeconds: 900 };
        expect(buildQuotaLine(fresh)).toBe(buildQuotaLine(live));
        expect(buildQuotaLine({ ...fresh, usageAgeSeconds: 901 })).toBe(
            `${GRAY}${hyperlink(USAGE_URL, "5h")} ${progressBar(37, 8)} 37%${SEPARATOR}${GRAY}${hyperlink(USAGE_URL, "7d")} ${progressBar(61, 8)} 61%` +
                `${SEPARATOR}${DIM}15m${RESET}`
        );
    });

    it("turns coral and warns once cached data passes 30 minutes", () => {
        const old = { ...live, usageSource: "cache" as const, usageAgeSeconds: 1801 };
        expect(buildQuotaLine(old)).toBe(
            `${WARN}⚠ ${WARN}${hyperlink(USAGE_URL, "5h")} ${progressBar(37, 8)}${WARN} 37%${SEPARATOR}${WARN}${hyperlink(USAGE_URL, "7d")} ${progressBar(61, 8)}${WARN} 61%` +
                `${SEPARATOR}${WARN}30m old ⚠${RESET}`
        );
    });

    it("keeps the reset countdown dim even while the rest of the line warns", () => {
        const old = {
            ...live,
            usageSource: "cache" as const,
            usageAgeSeconds: 1801,
            fiveResets: String(NOW + 3600 + 21 * 60)
        };
        expect(buildQuotaLine(old)).toContain(`${DIM}1h 21m${RESET}`);
    });
});

describe("buildFetchAge", () => {
    it("stays silent under ten minutes", () => {
        expect(buildFetchAge(String(NOW - 599), NOW)).toBe("");
        expect(buildFetchAge("", NOW)).toBe("");
    });

    it("counts minutes, then hours, then days", () => {
        expect(buildFetchAge(String(NOW - 600), NOW)).toBe(`${DIM}10m ago${RESET}`);
        expect(buildFetchAge(String(NOW - 7200), NOW)).toBe(`${DIM}2h ago${RESET}`);
        expect(buildFetchAge(String(NOW - 3 * 86400), NOW)).toBe(`${DIM}3d ago${RESET}`);
    });

    it("stays dim however stale it gets, because staleness is context and not a warning", () => {
        expect(buildFetchAge(String(NOW - 30 * 86400), NOW)).not.toContain(WARN);
    });
});

describe("buildMrBlock", () => {
    const fields = parseMrCacheLine(
        [
            String(NOW - 30),
            "github",
            "42",
            "false",
            "false",
            "false",
            "1",
            "0",
            "MERGEABLE",
            "0",
            "SUCCESS",
            "",
            String(NOW)
        ].join(UNIT_SEPARATOR)
    );

    it("emits nothing without an MR number", () => {
        expect(buildMrBlock({ ...fields, iid: "" }, 0)).toBe("");
    });

    it("prefixes GitHub with # and anything else with !", () => {
        expect(buildMrBlock(fields, 0)).toContain(`${MR}#42${RESET}`);
        expect(buildMrBlock({ ...fields, provider: "gitlab" }, 0)).toContain(`${MR}!42${RESET}`);
    });

    it("wraps the reference in an OSC-8 hyperlink when a URL is cached", () => {
        expect(buildMrBlock({ ...fields, url: "https://example.test/pr/42" }, 0)).toContain(
            `${MR}${hyperlink("https://example.test/pr/42", "#42")}${RESET}`
        );
    });

    it("prefers draft over every other state", () => {
        expect(buildMrBlock({ ...fields, draft: "true", conflicts: "true", approved: "true" }, 0)).toContain(
            `${DRAFT}draft${RESET}`
        );
    });

    it("spells out each mutually exclusive review state", () => {
        expect(buildMrBlock({ ...fields, conflicts: "true" }, 0)).toContain(`${WARN}conflicts${RESET}`);
        expect(buildMrBlock({ ...fields, status: "CHANGES_REQUESTED" }, 0)).toContain(`${WARN}changes-req${RESET}`);
        expect(buildMrBlock({ ...fields, approved: "true" }, 0)).toContain(`${ADD}approved${RESET}`);
        expect(buildMrBlock({ ...fields, approvalsLeft: "1", approvalsRequired: "2" }, 0)).toContain(
            `${GRAY}1/2 approvals${RESET}`
        );
        expect(buildMrBlock(fields, 0)).toContain(`${ADD}mergeable${RESET}`);
    });

    it("gives each pipeline state its own text, so color is never the only signal", () => {
        const ciTextFor = (pipeline: string) =>
            buildMrBlock({ ...fields, pipeline }, 0).replace(buildMrBlock({ ...fields, pipeline: "" }, 0), "");
        const success = ciTextFor("SUCCESS");
        const failed = ciTextFor("FAILED");
        const running = ciTextFor("RUNNING");
        const skipped = ciTextFor("SKIPPED");

        expect(success).toBe(`${SEPARATOR}${ADD}ci ok${RESET}`);
        expect(failed).toBe(`${SEPARATOR}${WARN}ci fail${RESET}`);
        expect(running).toBe(`${SEPARATOR}${YELLOW}ci run${RESET}`);
        expect(skipped).toBe(`${SEPARATOR}${GRAY}ci skip${RESET}`);
        expect(ciTextFor("CANCELED")).toBe(skipped);

        // Stripped of color, the four still read as four different states.
        const plain = [success, failed, running, skipped].map((text) => text.replace(/\x1b\[[0-9;]*m/g, ""));
        expect(new Set(plain).size).toBe(4);
    });

    it("emits no pipeline segment for an unknown or absent pipeline state", () => {
        expect(buildMrBlock({ ...fields, pipeline: "" }, 0)).not.toContain("ci ");
        expect(buildMrBlock({ ...fields, pipeline: "PENDING" }, 0)).not.toContain("ci ");
    });

    it("binds the review state to the reference and separates every field after it", () => {
        expect(buildMrBlock({ ...fields, draft: "true", pipeline: "FAILED", notes: "3" }, 0)).toBe(
            `${MR}#42${RESET} ${DRAFT}draft${RESET}${SEPARATOR}${WARN}ci fail${RESET}${SEPARATOR}${GRAY}💬 3${RESET}`
        );
    });

    it("links CI to the provider's own list of runs for this MR/PR", () => {
        expect(buildMrBlock({ ...fields, url: "https://github.test/o/r/pull/42" }, 0)).toContain(
            `${ADD}${hyperlink("https://github.test/o/r/pull/42/checks", "ci ok")}${RESET}`
        );
        const mr = { ...fields, provider: "gitlab", url: "https://gitlab.test/o/r/-/merge_requests/42" };
        expect(buildMrBlock(mr, 0)).toContain(
            `${ADD}${hyperlink("https://gitlab.test/o/r/-/merge_requests/42/pipelines", "ci ok")}${RESET}`
        );
    });

    it("keeps CI readable when no MR/PR URL was cached", () => {
        expect(buildMrBlock(fields, 0)).toContain(`${ADD}ci ok${RESET}`);
    });

    it("separates the notes emoji from its count", () => {
        expect(buildMrBlock({ ...fields, notes: "3" }, 0)).toContain(`${GRAY}💬 3${RESET}`);
    });

    it("falls back to a lowercased raw status", () => {
        expect(buildMrBlock({ ...fields, status: "BLOCKED" }, 0)).toContain(`${GRAY}blocked${RESET}`);
    });

    it("appends a dimmed age note only past ten minutes", () => {
        expect(buildMrBlock(fields, 599)).not.toContain("ago");
        expect(buildMrBlock(fields, 660)).toContain(`${SEPARATOR}${DIM}11m ago${RESET}`);
    });

    it("renders no fallback-prone dingbat in any state", () => {
        const rendered = [
            buildMrBlock({ ...fields, draft: "true" }, 660),
            buildMrBlock({ ...fields, conflicts: "true", pipeline: "FAILED", notes: "3" }, 0),
            buildMrBlock({ ...fields, status: "CHANGES_REQUESTED", pipeline: "RUNNING" }, 0),
            buildMrBlock({ ...fields, approved: "true", pipeline: "SKIPPED" }, 0),
            buildMrBlock({ ...fields, approvalsLeft: "1", pipeline: "SUCCESS" }, 0)
        ].join("");
        expect(rendered).not.toMatch(/[✎⟳◐⬤⊘⇅⌂≡✓✗●]/u);
    });
});

describe("cacheKey", () => {
    it("replaces every non-alphanumeric byte", () => {
        expect(cacheKey("/home/me/repo|main")).toBe("_home_me_repo_main");
    });

    it("keeps the tail when the key would exceed 100 characters", () => {
        const key = cacheKey(`${"/very/long/path".repeat(20)}|main`);
        expect(key).toHaveLength(100);
        expect(key.endsWith("_main")).toBe(true);
    });
});

describe("basename", () => {
    it("treats a Windows backslash as a separator, as Git Bash does", () => {
        expect(basename("C:\\_MP_projects\\mpx-claude-code")).toBe("mpx-claude-code");
        expect(basename("C:\\foo\\")).toBe("foo");
    });

    it("handles roots and empty input", () => {
        expect(basename("")).toBe("");
        expect(basename("/")).toBe("/");
        expect(basename("/home/me/repo")).toBe("repo");
    });
});

describe("expandBackslashEscapes", () => {
    it("leaves ordinary text untouched", () => {
        expect(expandBackslashEscapes("plain text")).toEqual({ text: "plain text", truncated: false });
    });

    it("expands the escapes bash printf %b expands", () => {
        expect(expandBackslashEscapes("a\\tb").text).toBe("a\tb");
        expect(expandBackslashEscapes("a\\101b").text).toBe("aAb");
        expect(expandBackslashEscapes("a\\x41b").text).toBe("aAb");
    });

    it("keeps an unknown escape verbatim", () => {
        expect(expandBackslashEscapes("a\\qb").text).toBe("a\\qb");
    });

    it("stops the rest of the output at a \\c", () => {
        expect(expandBackslashEscapes("keep\\cdrop")).toEqual({ text: "keep", truncated: true });
    });
});

describe("extractPayloadFields", () => {
    it("falls back to placeholders for an unparseable payload", () => {
        expect(extractPayloadFields("not json")).toMatchObject({ model: "?", cwd: "", maxContext: "200000" });
    });

    it("prefers the display name over the model id", () => {
        expect(extractPayloadFields(JSON.stringify({ model: { display_name: "Opus 5", id: "claude-opus-5" } })).model)
            .toBe("Opus 5");
        expect(extractPayloadFields(JSON.stringify({ model: { id: "claude-opus-5" } })).model).toBe("claude-opus-5");
    });

    it("keeps a zero, which is not the same as an absent field", () => {
        const fields = extractPayloadFields(
            JSON.stringify({ cost: { total_cost_usd: 0 }, context_window: { used_percentage: 0 } })
        );
        expect(fields).toMatchObject({ sessionCostUsdRaw: "0", contextUsedPct: "0", sessionTokensIn: "" });
    });

    it("flattens newlines so a field cannot break the line layout", () => {
        expect(extractPayloadFields(JSON.stringify({ session_name: "two\nlines" })).sessionName).toBe("two lines");
    });
});
