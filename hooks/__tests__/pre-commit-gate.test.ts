import { describe, it, expect } from "vitest";
import { scanForSecrets, validateCommitFormat, extractCommitMessage } from "../pre-commit-gate.js";

describe("pre-commit-gate", () => {
  describe("scanForSecrets", () => {
    it("detects AWS access key", () => {
      const diff = "+const key = 'AKIAIOSFODNN7EXAMPLE';";
      const findings = scanForSecrets(diff, "config.js");
      expect(findings).toHaveLength(1);
      expect(findings[0].name).toBe("AWS Access Key");
      expect(findings[0].file).toBe("config.js");
    });

    it("detects GitHub PAT", () => {
      const diff = "+const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';";
      const findings = scanForSecrets(diff, "auth.js");
      expect(findings).toHaveLength(1);
      expect(findings[0].name).toBe("GitHub PAT");
    });

    it("detects private key header", () => {
      const diff = "+-----BEGIN RSA PRIVATE KEY-----";
      const findings = scanForSecrets(diff, "key.pem");
      expect(findings).toHaveLength(1);
      expect(findings[0].name).toBe("Private Key");
    });

    it("detects generic secret pattern", () => {
      const diff = '+password = "mysecretpass123"';
      const findings = scanForSecrets(diff, ".env");
      expect(findings).toHaveLength(1);
      expect(findings[0].name).toBe("Generic Secret");
    });

    it("returns empty array for normal code", () => {
      const diff = "+const x = 42;\n+function hello() { return 'world'; }";
      const findings = scanForSecrets(diff, "index.js");
      expect(findings).toHaveLength(0);
    });

    it("detects Slack token", () => {
      const diff = "+const slack = 'xoxb-123-456-abc';";
      const findings = scanForSecrets(diff, "slack.js");
      expect(findings).toHaveLength(1);
      expect(findings[0].name).toBe("Slack Token");
    });

    it("ignores context lines (no + prefix)", () => {
      const diff = " password = \"mysecretpass123\"\n-old_line\n+const safe = true;";
      const findings = scanForSecrets(diff, "file.js");
      expect(findings).toHaveLength(0);
    });

    it("ignores +++ header lines", () => {
      const diff = "+++ b/secret.txt\n+const safe = true;";
      const findings = scanForSecrets(diff, "secret.txt");
      expect(findings).toHaveLength(0);
    });
  });

  describe("validateCommitFormat", () => {
    it("accepts 'feat: add login'", () => {
      const result = validateCommitFormat("feat: add login");
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("accepts 'feat(auth): add login'", () => {
      const result = validateCommitFormat("feat(auth): add login");
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("rejects 'Add login' as invalid format", () => {
      const result = validateCommitFormat("Add login");
      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("conventional format");
    });

    it("warns when first line exceeds 72 chars", () => {
      const message = "fix: " + "a".repeat(70);
      const result = validateCommitFormat(message);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("72");
    });

    it("accepts 'refactor(ui): update styles'", () => {
      const result = validateCommitFormat("refactor(ui): update styles");
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("rejects 'WIP' as invalid format", () => {
      const result = validateCommitFormat("WIP");
      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("extractCommitMessage", () => {
    it("extracts message from -m with double quotes", () => {
      const msg = extractCommitMessage('git commit -m "feat: test"');
      expect(msg).toBe("feat: test");
    });

    it("extracts message from -m with single quotes", () => {
      const msg = extractCommitMessage("git commit -m 'fix: bug'");
      expect(msg).toBe("fix: bug");
    });

    it("extracts first line from heredoc format", () => {
      const command = "git commit -m \"$(cat <<'EOF'\nfeat: add feature\n\nBody text here\nEOF\n)\"";
      const msg = extractCommitMessage(command);
      expect(msg).toBe("feat: add feature");
    });

    it("returns null when no message found", () => {
      const msg = extractCommitMessage("git commit");
      expect(msg).toBeNull();
    });

    it("extracts message with apostrophe in double quotes", () => {
      expect(extractCommitMessage('git commit -m "feat: it\'s a test"')).toBe("feat: it's a test");
    });

    it("extracts message with double quotes in single quotes", () => {
      expect(extractCommitMessage("git commit -m 'fix: remove \"extra\" code'")).toBe('fix: remove "extra" code');
    });

    it("extracts from indent-stripped heredoc", () => {
      expect(extractCommitMessage('git commit -m "$(cat <<-\'EOF\'\nfeat: test\nEOF\n)"')).toBe("feat: test");
    });

    it("extracts from cat heredoc pattern", () => {
      const cmd = `git commit -m "$(cat <<'EOF'\nfeat(auth): add login\n\nBody text here\nEOF\n)"`;
      expect(extractCommitMessage(cmd)).toBe("feat(auth): add login");
    });
  });

  describe("validateCommitFormat boundary checks", () => {
    it("no length warning for exactly 72 chars", () => {
      const msg = "feat: " + "a".repeat(66); // 72 chars total
      const result = validateCommitFormat(msg);
      expect(result.warnings).toHaveLength(0);
    });

    it("warns for 73-char subject line", () => {
      const msg = "feat: " + "a".repeat(67); // 73 chars total
      const result = validateCommitFormat(msg);
      expect(result.warnings.some(w => w.includes("72"))).toBe(true);
    });
  });
});
