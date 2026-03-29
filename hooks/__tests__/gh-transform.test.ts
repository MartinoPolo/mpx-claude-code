import { describe, it, expect } from "vitest";
import { transformGhCommand } from "../gh-transform.js";

describe("gh-transform", () => {
  it("adds --draft to gh pr create", () => {
    const result = transformGhCommand('gh pr create --title "feat: add login"');
    expect(result.transformed).toBe(true);
    expect(result.command).toContain("--draft");
  });

  it("does not transform when --draft already present", () => {
    const result = transformGhCommand(
      'gh pr create --draft --title "feat: add login"'
    );
    expect(result.transformed).toBe(false);
  });

  it("does not transform gh pr edit", () => {
    const result = transformGhCommand('gh pr edit --title "new title"');
    expect(result.transformed).toBe(false);
  });

  it("does not transform gh pr view", () => {
    const result = transformGhCommand("gh pr view");
    expect(result.transformed).toBe(false);
  });

  it("does not transform git status", () => {
    const result = transformGhCommand("git status");
    expect(result.transformed).toBe(false);
  });

  it("adds --draft to gh pr create with --base flag", () => {
    const result = transformGhCommand(
      'gh pr create --base main --title "fix: bug"'
    );
    expect(result.transformed).toBe(true);
    expect(result.command).toContain("--draft");
    // --draft should appear right after `gh pr create`
    expect(result.command).toMatch(/gh\s+pr\s+create\s+--draft/);
  });

  it("does not transform echo command", () => {
    const result = transformGhCommand('echo "hello"');
    expect(result.transformed).toBe(false);
  });

  it("does not transform empty command", () => {
    const result = transformGhCommand("");
    expect(result.transformed).toBe(false);
  });

  it("does not transform when --draft is the only flag", () => {
    const result = transformGhCommand("gh pr create --draft");
    expect(result.transformed).toBe(false);
  });

  it("inserts --draft right after gh pr create", () => {
    const result = transformGhCommand(
      'gh pr create --title "feat: add login" --body "description"'
    );
    expect(result.transformed).toBe(true);
    const draftIndex = result.command!.indexOf("--draft");
    const createIndex = result.command!.indexOf("gh pr create");
    // --draft should immediately follow "gh pr create "
    expect(result.command).toMatch(/gh\s+pr\s+create\s+--draft\s+--title/);
  });
});
