import { describe, it, expect, vi, beforeEach } from "vitest";

import { detectBaseBranch } from "../detect-base-branch.js";

/**
 * Create a mock execSync that simulates remote branches with given commit-ahead counts.
 * branchMap: { branchName: commitsAhead } — null means merge-base fails.
 * Branches not in the map cause rev-parse --verify to throw.
 */
function createMockExecSync(branchMap: Record<string, number | null>) {
  let lastCount = 0;

  return vi.fn((command: string) => {
    // git rev-parse --verify origin/<branch>
    const verifyMatch = command.match(/^git rev-parse --verify origin\/(.+)$/);
    if (verifyMatch) {
      const branch = verifyMatch[1];
      if (branch in branchMap) {
        return "abc123\n";
      }
      throw new Error("fatal: Needed a single revision");
    }

    // git merge-base origin/<branch> HEAD
    const mergeBaseMatch = command.match(
      /^git merge-base origin\/(.+) HEAD$/,
    );
    if (mergeBaseMatch) {
      const branch = mergeBaseMatch[1];
      if (branch in branchMap && branchMap[branch] !== null) {
        lastCount = branchMap[branch]!;
        return `fakesha_${branch}\n`;
      }
      throw new Error("fatal: No merge base");
    }

    // git rev-list --count <sha>..HEAD
    const revListMatch = command.match(/^git rev-list --count .+\.\.HEAD$/);
    if (revListMatch) {
      return `${lastCount}\n`;
    }

    throw new Error(`Unexpected git command: ${command}`);
  });
}

describe("detectBaseBranch", () => {
  it("returns explicit branch when it exists on remote", () => {
    const mock = createMockExecSync({ "my-feature": 5, main: 10 });
    expect(detectBaseBranch("my-feature", { execSync: mock })).toBe(
      "my-feature",
    );
  });

  it("falls through to auto-detection when explicit branch does not exist", () => {
    const mock = createMockExecSync({ main: 3 });
    expect(detectBaseBranch("nonexistent", { execSync: mock })).toBe("main");
  });

  it("returns 'main' when only main exists", () => {
    const mock = createMockExecSync({ main: 5 });
    expect(detectBaseBranch(undefined, { execSync: mock })).toBe("main");
  });

  it("returns 'dev' when dev and main both exist and dev is closer", () => {
    const mock = createMockExecSync({ dev: 2, main: 10 });
    expect(detectBaseBranch(undefined, { execSync: mock })).toBe("dev");
  });

  it("returns 'main' when main and master both exist and main is closer", () => {
    const mock = createMockExecSync({ main: 3, master: 8 });
    expect(detectBaseBranch(undefined, { execSync: mock })).toBe("main");
  });

  it("returns priority-order winner on tie in commit count", () => {
    // dev and main both 5 commits ahead — dev wins (higher priority)
    const mock = createMockExecSync({ dev: 5, main: 5 });
    expect(detectBaseBranch(undefined, { execSync: mock })).toBe("dev");
  });

  it("returns 'main' fallback when no remote branches found", () => {
    const mock = createMockExecSync({});
    expect(detectBaseBranch(undefined, { execSync: mock })).toBe("main");
  });

  it("returns 'main' fallback when all git commands fail", () => {
    const mock = vi.fn(() => {
      throw new Error("git failed");
    });
    expect(detectBaseBranch(undefined, { execSync: mock })).toBe("main");
  });
});
