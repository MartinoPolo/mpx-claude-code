import { describe, expect, it } from "vitest";

import { SEPARATOR, STATE_GLYPHS, composeTitle, isTitleState, withStateGlyph } from "../terminal-title.mts";

describe("composeTitle", () => {
    it("names only the project when the worktree is the project's own checkout", () => {
        expect(composeTitle("[P]", "C:/_MP_projects/yoursafe-components", "C:/_MP_projects/yoursafe-components")).toBe(
            "[P] yoursafe-components",
        );
    });

    it("puts the worktree name ahead of the project name in a linked worktree", () => {
        expect(composeTitle("[P]", "C:/_MP_projects/yoursafe-components", "C:/_MP_worktrees/agentic-setup")).toBe(
            `[P] agentic-setup${SEPARATOR}yoursafe-components`,
        );
    });

    it("carries the account prefix it is given", () => {
        expect(composeTitle("[W]", "C:/_MP_work/verotel-api", "C:/_MP_work/verotel-api")).toBe("[W] verotel-api");
    });

    // git reports forward slashes even on Windows, while a fallback to
    // process.cwd() hands over backslashes; both reach path.basename.
    it("reads a name off a backslash path", () => {
        expect(composeTitle("[P]", "C:\\_MP_projects\\mpx-claude-code", "C:\\_MP_projects\\mpx-claude-code")).toBe(
            "[P] mpx-claude-code",
        );
    });

    // A worktree that happens to be named after its project is still one name.
    it("does not repeat a name that matches on both sides", () => {
        expect(composeTitle("[P]", "C:/_MP_projects/bugopaloola", "C:/_MP_worktrees/bugopaloola")).toBe(
            "[P] bugopaloola",
        );
    });
});

describe("withStateGlyph", () => {
    // Against the constant rather than a literal glyph: which marker is used is
    // a taste decision meant to stay a one-line edit, while what this composes —
    // marker, one space, title — is the behaviour worth pinning.
    it("leads a stopped session's title with the idle marker", () => {
        expect(withStateGlyph("[P] mpx-claude-code", "idle")).toBe(`${STATE_GLYPHS.idle} [P] mpx-claude-code`);
    });

    it("keeps a non-empty idle marker to configure", () => {
        expect(STATE_GLYPHS.idle).not.toBe("");
    });

    // No leading space either: the spinner frame the helper prepends supplies
    // its own, and a running turn is never shown a static marker.
    it("leaves a running turn's title unmarked", () => {
        expect(withStateGlyph("[P] mpx-claude-code", "busy")).toBe("[P] mpx-claude-code");
    });
});

describe("isTitleState", () => {
    it("accepts the states the hooks pass", () => {
        expect(["busy", "idle"].every(isTitleState)).toBe(true);
    });

    // Notification's `waiting` was dropped; passing it must fail loudly, not fall back.
    it("rejects a state that is not one of them", () => {
        expect(isTitleState("waiting")).toBe(false);
    });

    // Object.hasOwn rather than an `in` check, so no prototype key passes as a state.
    it("rejects an inherited object key", () => {
        expect(isTitleState("toString")).toBe(false);
    });
});
