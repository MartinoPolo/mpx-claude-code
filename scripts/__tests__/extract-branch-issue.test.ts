import { describe, it, expect } from "vitest";
import { extractIssueNumber } from "../extract-branch-issue.js";

describe("extractIssueNumber", () => {
  it("extracts leading digits before hyphen", () => {
    expect(extractIssueNumber("42-fix-login")).toBe("42");
  });

  it("extracts digits after prefix slash", () => {
    expect(extractIssueNumber("feature/42-add-auth")).toBe("42");
  });

  it("extracts multi-digit number after prefix", () => {
    expect(extractIssueNumber("bugfix/123-fix-crash")).toBe("123");
  });

  it("extracts bare number branch", () => {
    expect(extractIssueNumber("42")).toBe("42");
  });

  it("returns empty for branch with no number", () => {
    expect(extractIssueNumber("main")).toBe("");
  });

  it("returns empty when digits are not in issue position", () => {
    expect(extractIssueNumber("feature/add-auth")).toBe("");
  });

  it("extracts single digit issue number", () => {
    expect(extractIssueNumber("hotfix/7-quick-patch")).toBe("7");
  });

  it("ignores version-prefixed numbers", () => {
    expect(extractIssueNumber("v2-new-feature")).toBe("");
  });

  it("extracts leading single digit before hyphen", () => {
    expect(extractIssueNumber("2-new-feature")).toBe("2");
  });

  it("extracts issue number from nested path", () => {
    expect(extractIssueNumber("feature/v2.0/42-implement")).toBe("42");
  });
});
