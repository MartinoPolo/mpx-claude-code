#!/usr/bin/env node
/**
 * Audit a decoded Raycast config for entries that no longer work.
 *
 * Usage:
 *   node audit.mjs <decoded.json> [--json]
 *
 * Findings are advisory. Nothing is written; the caller decides what to repair or drop.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const QUICKLINK_COMMAND_PREFIX = "c:r:quicklinks::*::quicklink::=::";
// Crockford base32 without I, L, O and U; 10 timestamp chars then 16 of randomness.
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

const [configPath, ...flags] = process.argv.slice(2);
if (!configPath) {
  console.error("usage: node audit.mjs <decoded.json> [--json]");
  process.exit(1);
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const quicklinks = config.quicklinks?.quicklinks ?? [];
const commandSettings = config.settings?.commands ?? [];
const findings = [];

function report(kind, quicklink, detail) {
  findings.push({ kind, id: quicklink?.id, name: quicklink?.name, link: quicklink?.link, detail });
}

/** Turn a quicklink `link` into a local filesystem path, or null when it is not one. */
function resolveLocalPath(link) {
  const expanded = link.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (match, name) => process.env[name] ?? match);
  if (/^file:\/\/\//i.test(expanded)) {
    return decodeURIComponent(expanded.replace(/^file:\/\/\//i, "")).split(/[?#]/)[0];
  }
  if (/^[A-Za-z]:[\\/]/.test(expanded)) return expanded.split(/[?#]/)[0];
  return null;
}

/** The vault root that `obsidian://open?vault=NAME` would resolve to, or null. */
function resolveObsidianVault(link) {
  const match = /^obsidian:\/\/open\?(.*)$/i.exec(link);
  if (!match) return null;
  const vaultName = new URLSearchParams(match[1]).get("vault");
  const activeVault = process.env.MPX_OBSIDIAN_VAULT;
  if (!vaultName || !activeVault) return null;
  return { vaultName, vaultPath: join(dirname(activeVault), vaultName) };
}

for (const quicklink of quicklinks) {
  const localPath = resolveLocalPath(quicklink.link);
  if (localPath && !existsSync(localPath)) {
    report("dead-path", quicklink, `${localPath} does not exist`);
  }

  const vault = resolveObsidianVault(quicklink.link);
  if (vault && !existsSync(vault.vaultPath)) {
    report("dead-vault", quicklink, `vault "${vault.vaultName}" not found (active vault is "${basename(process.env.MPX_OBSIDIAN_VAULT)}")`);
  }

  // A command line rather than a link: only the executable's existence is checkable.
  const commandMatch = /^(?:cmd\s+\/c\s+)?["']?([A-Za-z]:[\\/][^"']+?\.(?:cmd|bat|ps1|exe))["']?/i.exec(quicklink.link);
  if (commandMatch && !existsSync(commandMatch[1])) {
    report("dead-script", quicklink, `${commandMatch[1]} does not exist`);
  }
}

// Raycast rejects the whole quicklinks category on the first record that fails validation,
// and reports it only as a red badge in the import dialog. Catch it here instead.
const idsSeen = new Set();
for (const quicklink of quicklinks) {
  if (!ULID_PATTERN.test(quicklink.id)) {
    report("invalid-id", quicklink, `"${quicklink.id}" is not a valid ULID — import rejects the category`);
  }
  if (idsSeen.has(quicklink.id)) report("duplicate-id", quicklink, "two quicklinks share this id");
  idsSeen.add(quicklink.id);
  if (Boolean(quicklink.openWith) !== Boolean(quicklink.applicationId)) {
    report("unpaired-openwith", quicklink, "openWith and applicationId must both be set, to the same value");
  }
}

const linksSeen = new Map();
const namesSeen = new Map();
for (const quicklink of quicklinks) {
  const linkKey = quicklink.link.trim().toLowerCase();
  const nameKey = quicklink.name.trim().toLowerCase();
  if (linksSeen.has(linkKey)) report("duplicate-link", quicklink, `same link as "${linksSeen.get(linkKey)}"`);
  else linksSeen.set(linkKey, quicklink.name);
  if (namesSeen.has(nameKey)) report("duplicate-name", quicklink, "another quicklink has this name");
  else namesSeen.set(nameKey, quicklink.name);
}

const quicklinkIds = new Set(quicklinks.map((quicklink) => quicklink.id));
for (const setting of commandSettings) {
  if (!setting.id.startsWith(QUICKLINK_COMMAND_PREFIX)) continue;
  const targetId = setting.id.slice(QUICKLINK_COMMAND_PREFIX.length);
  const target = quicklinks.find((quicklink) => quicklink.id === targetId);
  if (!quicklinkIds.has(targetId)) {
    findings.push({ kind: "orphan-alias", id: targetId, name: null, link: null, detail: `alias "${setting.alias ?? ""}" points at a quicklink that no longer exists` });
  } else if (setting.enabled === false) {
    report("disabled", target, `alias "${setting.alias ?? ""}" is on a disabled quicklink`);
  }
}

// Family keywords keep a group findable by the word the user thinks of first.
const familyRules = [
  { test: (link) => /^https?:\/\/[^/]*zoom\.us\//i.test(link), keyword: "zoom" },
  { test: (link) => /^https?:\/\/localhost[:/]/i.test(link), keyword: "localhost" },
];
for (const quicklink of quicklinks) {
  for (const rule of familyRules) {
    if (rule.test(quicklink.link) && !quicklink.name.toLowerCase().includes(rule.keyword)) {
      report("missing-keyword", quicklink, `name omits the family keyword "${rule.keyword}"`);
    }
  }
}

if (flags.includes("--json")) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  const byKind = new Map();
  for (const finding of findings) {
    if (!byKind.has(finding.kind)) byKind.set(finding.kind, []);
    byKind.get(finding.kind).push(finding);
  }
  console.log(`${quicklinks.length} quicklinks, ${commandSettings.length} command settings, ${findings.length} findings\n`);
  for (const [kind, group] of byKind) {
    console.log(`## ${kind} (${group.length})`);
    for (const finding of group) console.log(`  ${finding.name ?? finding.id} — ${finding.detail}`);
    console.log();
  }
}
