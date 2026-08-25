#!/usr/bin/env node
// Initialize a new project with git, repository config, and shared agent instructions
// Usage: node $HOME/.claude/scripts/init-repo.mjs

import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const NC = "\x1b[0m";

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "";

console.log(`${GREEN}Initializing project...${NC}`);

if (existsSync(".git")) {
    console.log(`${YELLOW}Git repository already exists. Skipping git init.${NC}`);
} else {
    console.log("Initializing git repository...");
    execFileSync("git", ["init"], { stdio: "inherit" });
}

console.log("Creating .gitignore...");
let templateDir = path.join(SELF_DIR, "..", "templates");
if (!existsSync(path.join(templateDir, "gitignore.template"))) {
    templateDir = path.join(HOME_DIR, ".claude", "templates");
}
if (!existsSync(path.join(templateDir, "gitignore.template"))) {
    console.error(`${RED}Error: gitignore.template not found in scripts/../templates/ or ~/.claude/templates/${NC}`);
    process.exit(1);
}
copyFileSync(path.join(templateDir, "gitignore.template"), ".gitignore");

console.log("Creating .gitattributes...");
writeFileSync(
    ".gitattributes",
    `# Normalize all text to LF in git and working tree
* text=auto eol=lf

# Shell scripts - always LF (CRLF breaks shebangs)
*.sh text eol=lf

# Common text
*.md text eol=lf
*.json text eol=lf
*.txt text eol=lf
*.yaml text eol=lf
*.yml text eol=lf
*.toml text eol=lf
*.css text eol=lf
*.js text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.jsx text eol=lf
*.html text eol=lf
*.py text eol=lf
*.rs text eol=lf
*.go text eol=lf

# Binary - no conversion
*.png binary
*.jpg binary
*.gif binary
*.ico binary
*.woff binary
*.woff2 binary
*.ttf binary
*.eot binary
*.pdf binary
*.zip binary
`
);

console.log("Creating .editorconfig...");
writeFileSync(
    ".editorconfig",
    `root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[*.{png,jpg,gif,ico,woff,woff2,ttf,eot,pdf,zip}]
end_of_line = unset
insert_final_newline = unset
charset = unset
trim_trailing_whitespace = unset
`
);

const instructionFiles = ["AGENTS.md", "CLAUDE.md"];
if (!existsSync("AGENTS.md")) {
    console.log("Creating AGENTS.md seed...");
    writeFileSync(
        "AGENTS.md",
        `# Project Instructions

Add only project-specific conventions that cannot be discovered from repository files.
Point to authoritative documentation for branch-specific workflows instead of copying it here.
`
    );
}

if (!existsSync("CLAUDE.md")) {
    console.log("Creating CLAUDE.md pointer...");
    writeFileSync("CLAUDE.md", `@AGENTS.md\n`);
}

console.log("Creating initial commit...");
execFileSync(
    "git",
    ["add", ".gitignore", ".gitattributes", ".editorconfig", ...instructionFiles],
    { stdio: "inherit" }
);

let hasStagedChanges = true;
try {
    execFileSync("git", ["diff", "--cached", "--quiet"], { stdio: "ignore" });
    hasStagedChanges = false;
} catch {
    hasStagedChanges = true;
}

if (!hasStagedChanges) {
    console.log(`${YELLOW}No changes to commit.${NC}`);
} else {
    execFileSync(
        "git",
        [
            "commit",
            "-m",
            `Initial project setup

- Add comprehensive .gitignore
- Add .gitattributes for line ending normalization
- Add .editorconfig for editor consistency
- Add minimal shared agent instructions`
        ],
        { stdio: "inherit" }
    );
}

console.log("");
console.log(`${GREEN}Project initialized successfully!${NC}`);
console.log("");
console.log("Created:");
console.log("  .gitignore          - Comprehensive ignore patterns");
console.log("  .gitattributes      - Line ending normalization");
console.log("  .editorconfig       - Editor consistency settings");
console.log("  AGENTS.md           - Shared project-instruction seed (when absent)");
console.log("  CLAUDE.md           - Pointer to AGENTS.md (when absent)");
console.log("");
console.log("Next steps:");
console.log("  1. Run /mp:grill to work through requirements");
console.log("  2. Run /mp-gh:to-epic to create an epic");
console.log("  3. Run /mp-gh:to-issues to break the epic into sub-issues");
console.log("  4. Run /mp-gh:execute to implement");
console.log("");
console.log(`${YELLOW}Framework rules:${NC}`);
console.log("  User-level rules (svelte, python, rust, css, typescript) load from ~/.claude/rules/");
console.log("  For React/Solid projects, symlink the per-project rule into .claude/rules/.");
console.log("  See WINDOWS-SETUP.md > 'Per-Project Framework Rules' for the PowerShell");
console.log("  New-Item -ItemType SymbolicLink procedure (plain 'ln -s' does not create real symlinks on Windows).");
