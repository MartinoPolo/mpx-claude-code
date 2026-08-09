#!/usr/bin/env node
// Mines ~/.claude/projects/**/*.jsonl for genuine skill and sub-agent INVOCATIONS.
//
// Only three signals are counted, all of them structural (never prose):
//   1. assistant tool_use block with name === "Skill"  -> input.skill
//   2. assistant tool_use block with name === "Agent"  -> input.subagent_type
//   3. user-role <command-name>/x</command-name> block -> slash-command expansion
// Everything else (the injected agent roster, SKILL.md file paths, prose mentions,
// tool_result echoes) is structurally incapable of matching these, so it is excluded.
//
// Global dedup by tool_use id / record uuid removes the duplication caused by
// session resume + compaction rewriting earlier history into new .jsonl files.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const PROJECTS = path.join(os.homedir(), ".claude", "projects");
const SKILLS_DIR = "C:\\_MP_projects\\mpx-claude-code\\skills";
const AGENTS_DIR = "C:\\_MP_projects\\mpx-claude-code\\agents";

const knownSkills = new Set(
  fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "shared")
    .map((d) => d.name),
);
const knownAgents = new Set(
  fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")),
);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

const files = walk(PROJECTS);

// name -> { total, sessions:Set, first, last, projects:Set, viaSlash, viaTool }
const skills = new Map();
const agents = new Map();
const seenIds = new Set();

function bump(map, name, meta, kind) {
  let r = map.get(name);
  if (!r) {
    r = { total: 0, sessions: new Set(), first: null, last: null, projects: new Set(), viaSlash: 0, viaTool: 0, sidechain: 0 };
    map.set(name, r);
  }
  r.total++;
  r[kind]++;
  if (meta.sidechain) r.sidechain++;
  r.sessions.add(meta.session);
  r.projects.add(meta.project);
  const ts = meta.ts;
  if (ts) {
    if (!r.first || ts < r.first) r.first = ts;
    if (!r.last || ts > r.last) r.last = ts;
  }
}

let lineCount = 0, byteCount = 0, parseErrors = 0;
let globalFirst = null, globalLast = null;

function contentBlocks(msg) {
  if (!msg) return [];
  const c = msg.content;
  if (typeof c === "string") return [{ type: "text", text: c }];
  return Array.isArray(c) ? c : [];
}

for (const file of files) {
  byteCount += fs.statSync(file).size;
  // project dir = first path segment under PROJECTS
  const rel = path.relative(PROJECTS, file);
  const project = rel.split(path.sep)[0];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    lineCount++;
    let o;
    try { o = JSON.parse(line); } catch { parseErrors++; continue; }
    const ts = o.timestamp || null;
    if (ts) {
      if (!globalFirst || ts < globalFirst) globalFirst = ts;
      if (!globalLast || ts > globalLast) globalLast = ts;
    }
    const meta = { session: o.sessionId || o.session_id || rel, project, ts, sidechain: !!o.isSidechain };

    if (o.type === "assistant") {
      for (const b of contentBlocks(o.message)) {
        if (b.type !== "tool_use") continue;
        if (b.name !== "Skill" && b.name !== "Agent") continue;
        const id = b.id || `${file}:${o.uuid}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        if (b.name === "Skill") {
          const s = b.input?.skill;
          if (s) bump(skills, s, meta, "viaTool");
        } else {
          const a = b.input?.subagent_type || "general-purpose(implicit)";
          bump(agents, a, meta, "viaTool");
        }
      }
    } else if (o.type === "user") {
      for (const b of contentBlocks(o.message)) {
        if (b.type !== "text" || typeof b.text !== "string") continue;
        const m = b.text.match(/<command-name>\s*\/?([A-Za-z0-9_:-]+)\s*<\/command-name>/);
        if (!m) continue;
        const id = `cmd:${o.uuid || `${file}:${lineCount}`}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const name = m[1];
        if (knownSkills.has(name)) bump(skills, name, meta, "viaSlash");
        else bump(skills, `~builtin:${name}`, meta, "viaSlash");
      }
    }
  }
}

function table(map, known, label) {
  const rows = [...map.entries()]
    .map(([name, r]) => ({
      name, total: r.total, sessions: r.sessions.size,
      first: (r.first || "").slice(0, 10), last: (r.last || "").slice(0, 10),
      projects: [...r.projects].join(" | "), viaTool: r.viaTool, viaSlash: r.viaSlash, sidechain: r.sidechain,
    }))
    .sort((a, b) => b.total - a.total || b.sessions - a.sessions);
  console.log(`\n===== ${label} (observed) =====`);
  for (const r of rows) {
    console.log([r.name, r.total, r.sessions, r.first, r.last, `tool=${r.viaTool}`, `slash=${r.viaSlash}`, `sub=${r.sidechain}`, r.projects].join("\t"));
  }
  const unused = [...known].filter((n) => !map.has(n)).sort();
  console.log(`\n----- ${label}: ZERO invocations (${unused.length}/${known.size}) -----`);
  console.log(unused.join("\n"));
}

table(skills, knownSkills, "SKILLS");
table(agents, knownAgents, "AGENTS");

console.log("\n===== COVERAGE =====");
console.log(`files=${files.length} lines=${lineCount} bytes=${byteCount} (${(byteCount / 1e6).toFixed(1)} MB) parseErrors=${parseErrors}`);
console.log(`unique tool_use/cmd ids counted=${seenIds.size}`);
console.log(`timestamp range: ${globalFirst} .. ${globalLast}`);
console.log(`known skills=${knownSkills.size} known agents=${knownAgents.size}`);
