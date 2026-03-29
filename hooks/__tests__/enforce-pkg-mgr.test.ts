import { describe, it, expect } from "vitest";
import { getToolRedirectWarnings } from "../enforce-pkg-mgr.js";

describe("getToolRedirectWarnings", () => {
  it("warns on standalone grep", () => {
    const warnings = getToolRedirectWarnings("grep -r pattern .");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Grep tool");
  });

  it("warns on standalone rg", () => {
    const warnings = getToolRedirectWarnings("rg pattern src/");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Grep tool");
  });

  it("does NOT warn on grep in pipeline", () => {
    const warnings = getToolRedirectWarnings("npm list | grep react");
    expect(warnings).toHaveLength(0);
  });

  it("warns on standalone cat", () => {
    const warnings = getToolRedirectWarnings("cat package.json");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Read tool");
  });

  it("warns on standalone head", () => {
    const warnings = getToolRedirectWarnings("head -20 file.txt");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Read tool");
  });

  it("does NOT warn on cat in pipeline", () => {
    const warnings = getToolRedirectWarnings("echo test | cat");
    expect(warnings).toHaveLength(0);
  });

  it("warns on standalone find", () => {
    const warnings = getToolRedirectWarnings("find . -name '*.ts'");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Glob tool");
  });

  it("does NOT warn on unrelated commands", () => {
    const warnings = getToolRedirectWarnings("git status");
    expect(warnings).toHaveLength(0);
  });

  it("does NOT warn on npm commands", () => {
    const warnings = getToolRedirectWarnings("npm install react");
    expect(warnings).toHaveLength(0);
  });

  it("warns on grep after &&", () => {
    const warnings = getToolRedirectWarnings("cd src && grep -r pattern .");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Grep tool");
  });
});
