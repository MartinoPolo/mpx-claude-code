import { describe, expect, it } from "vitest";

import { SEPARATOR, composeTitle } from "../terminal-title.mts";

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
