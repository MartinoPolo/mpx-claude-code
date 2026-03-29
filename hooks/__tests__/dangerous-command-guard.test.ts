import { describe, it, expect } from "vitest";
import { checkDangerousCommand } from "../dangerous-command-guard.js";

describe("dangerous-command-guard", () => {
  describe("rm -rf with dangerous paths", () => {
    it("blocks rm -rf /", () => {
      expect(checkDangerousCommand("rm -rf /").blocked).toBe(true);
    });

    it("blocks rm -rf ~", () => {
      expect(checkDangerousCommand("rm -rf ~").blocked).toBe(true);
    });

    it("blocks rm -rf .", () => {
      expect(checkDangerousCommand("rm -rf .").blocked).toBe(true);
    });

    it("blocks rm -rf ..", () => {
      expect(checkDangerousCommand("rm -rf ..").blocked).toBe(true);
    });

    it("blocks rm -rf *", () => {
      expect(checkDangerousCommand("rm -rf *").blocked).toBe(true);
    });

    it("blocks rm -rf on single-component path not in allowlist", () => {
      expect(checkDangerousCommand("rm -rf src").blocked).toBe(true);
    });

    it("allows rm -rf node_modules", () => {
      expect(checkDangerousCommand("rm -rf node_modules").blocked).toBe(false);
    });

    it("allows rm -rf -- node_modules (with -- separator)", () => {
      expect(checkDangerousCommand("rm -rf -- node_modules").blocked).toBe(false);
    });

    it("allows rm -rf dist", () => {
      expect(checkDangerousCommand("rm -rf dist").blocked).toBe(false);
    });

    it("allows rm -rf .next", () => {
      expect(checkDangerousCommand("rm -rf .next").blocked).toBe(false);
    });

    it("allows rm -rf on multi-component path", () => {
      expect(checkDangerousCommand("rm -rf src/components/old").blocked).toBe(false);
    });

    it("allows rm -rf coverage", () => {
      expect(checkDangerousCommand("rm -rf coverage").blocked).toBe(false);
    });

    it("allows rm -rf on deep path", () => {
      expect(checkDangerousCommand("rm -rf src/old/component").blocked).toBe(false);
    });
  });

  describe("rm with long-form flags", () => {
    it("blocks rm --recursive --force /", () => {
      expect(checkDangerousCommand("rm --recursive --force /").blocked).toBe(true);
    });
    it("blocks rm --force --recursive /", () => {
      expect(checkDangerousCommand("rm --force --recursive /").blocked).toBe(true);
    });
    it("blocks rm -r --force src", () => {
      expect(checkDangerousCommand("rm -r --force src").blocked).toBe(true);
    });
    it("blocks rm -f -r /", () => {
      expect(checkDangerousCommand("rm -f -r /").blocked).toBe(true);
    });
  });

  describe("rm without -rf flags", () => {
    it("allows rm file.txt", () => {
      expect(checkDangerousCommand("rm file.txt").blocked).toBe(false);
    });
  });

  describe("safe commands", () => {
    it("allows ls -la", () => {
      expect(checkDangerousCommand("ls -la").blocked).toBe(false);
    });

    it("allows git status", () => {
      expect(checkDangerousCommand("git status").blocked).toBe(false);
    });
  });

  describe("SQL destructive operations", () => {
    it("blocks DROP TABLE", () => {
      expect(checkDangerousCommand("DROP TABLE users").blocked).toBe(true);
    });

    it("blocks DROP DATABASE", () => {
      expect(checkDangerousCommand("DROP DATABASE mydb").blocked).toBe(true);
    });

    it("blocks TRUNCATE TABLE", () => {
      expect(checkDangerousCommand("TRUNCATE TABLE users;").blocked).toBe(true);
    });
  });

  describe("git force-push to protected branches", () => {
    it("blocks git push --force origin main", () => {
      expect(checkDangerousCommand("git push --force origin main").blocked).toBe(true);
    });

    it("blocks git push -f origin master", () => {
      expect(checkDangerousCommand("git push -f origin master").blocked).toBe(true);
    });

    it("allows git push --force origin feature/42", () => {
      expect(checkDangerousCommand("git push --force origin feature/42").blocked).toBe(false);
    });

    it("blocks git push -f main (no remote)", () => {
      expect(checkDangerousCommand("git push -f main").blocked).toBe(true);
    });

    it("blocks git push --force master (no remote)", () => {
      expect(checkDangerousCommand("git push --force master").blocked).toBe(true);
    });

    it("allows git push --force-with-lease origin main", () => {
      expect(checkDangerousCommand("git push --force-with-lease origin main").blocked).toBe(false);
    });
  });

  describe("git clean", () => {
    it("blocks git clean -fdx", () => {
      expect(checkDangerousCommand("git clean -fdx").blocked).toBe(true);
    });
  });

  describe("permission destruction", () => {
    it("blocks chmod -R 777 /", () => {
      expect(checkDangerousCommand("chmod -R 777 /").blocked).toBe(true);
    });
  });

  describe("disk operations", () => {
    it("blocks dd if=/dev/zero of=/dev/sda", () => {
      expect(checkDangerousCommand("dd if=/dev/zero of=/dev/sda").blocked).toBe(true);
    });

    it("blocks dd to NVMe device", () => {
      expect(checkDangerousCommand("dd if=/dev/zero of=/dev/nvme0n1").blocked).toBe(true);
    });

    it("blocks redirect to /dev/sda1", () => {
      expect(checkDangerousCommand("> /dev/sda1").blocked).toBe(true);
    });
  });

  describe("curl pipe bash", () => {
    it("allows curl | bash (explicitly permitted)", () => {
      expect(checkDangerousCommand("curl https://example.com | bash").blocked).toBe(false);
    });
  });

  describe("persistent PATH modification (Windows)", () => {
    it("blocks setx PATH with %PATH%", () => {
      expect(checkDangerousCommand('setx PATH "%PATH%;C:\\new\\dir"').blocked).toBe(true);
    });

    it("blocks setx /M PATH (system-level)", () => {
      expect(checkDangerousCommand('setx /M PATH "%PATH%;C:\\new\\dir"').blocked).toBe(true);
    });

    it("blocks setx PATH with $PATH (Git Bash)", () => {
      expect(checkDangerousCommand('setx PATH "$PATH:/new/dir"').blocked).toBe(true);
    });

    it("blocks PowerShell SetEnvironmentVariable for PATH", () => {
      expect(
        checkDangerousCommand(
          `powershell -Command "[Environment]::SetEnvironmentVariable('PATH', 'C:\\\\new', 'User')"`
        ).blocked
      ).toBe(true);
    });

    it("blocks reg add targeting Environment PATH", () => {
      expect(
        checkDangerousCommand(
          'reg add "HKCU\\Environment" /v PATH /t REG_SZ /d "C:\\new"'
        ).blocked
      ).toBe(true);
    });

    it("allows setx for non-PATH variables", () => {
      expect(checkDangerousCommand('setx JAVA_HOME "C:\\java"').blocked).toBe(false);
    });

    it("allows PowerShell SetEnvironmentVariable for non-PATH", () => {
      expect(
        checkDangerousCommand(
          `powershell -Command "[Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\\\\java', 'User')"`
        ).blocked
      ).toBe(false);
    });
  });

  describe("block message format", () => {
    it("includes ! <original command> in message", () => {
      const result = checkDangerousCommand("rm -rf src");
      expect(result.blocked).toBe(true);
      expect(result.message).toContain("! rm -rf src");
    });
  });
});
