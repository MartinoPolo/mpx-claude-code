#!/usr/bin/env node
// Read and extend the Windows Terminal profile list.
//
// The settings file is inserted into as text rather than re-serialised, so Windows
// Terminal's own formatting, key order and any comments survive a run untouched.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function settingsPath() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) throw new Error("LOCALAPPDATA is not set — cannot locate Windows Terminal settings.");
  return join(
    localAppData,
    "Packages",
    "Microsoft.WindowsTerminal_8wekyb3d8bbwe",
    "LocalState",
    "settings.json",
  );
}

export function iconsDirectory() {
  return join(settingsPath(), "..", "icons");
}

function parsed(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Windows Terminal settings.json is not plain JSON (${error.message}). ` +
        "Remove any comments from it and re-run.",
    );
  }
}

// Index of the `]` closing the profiles.list array, found by walking brackets from the
// array's opening `[` while skipping over string literals.
function listCloseIndex(raw) {
  const listKey = raw.indexOf('"list"');
  if (listKey === -1) throw new Error("No profiles.list array found in settings.json.");
  const open = raw.indexOf("[", listKey);
  let depth = 0;
  let inString = false;
  for (let index = open; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (character === "\\") index += 1;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("profiles.list array is unterminated.");
}

// The shell a new project profile should open. Taken from whatever the existing project
// profiles already use, so this script needs no knowledge of where the shell is installed.
function commonCommandline(settings) {
  const counts = new Map();
  for (const profile of settings.profiles.list)
    if (profile.commandline && !profile.elevate)
      counts.set(profile.commandline, (counts.get(profile.commandline) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  if (ranked.length === 0)
    throw new Error("No existing profile carries a commandline to copy — add the first one by hand.");
  return ranked[0][0];
}

function listColors() {
  const settings = parsed(readFileSync(settingsPath(), "utf8"));
  return settings.profiles.list
    .filter((profile) => profile.tabColor)
    .map((profile) => ({ name: profile.name, tabColor: profile.tabColor.toUpperCase() }));
}

function addProfile({ name, directory, icon, color }) {
  const path = settingsPath();
  const raw = readFileSync(path, "utf8");
  const settings = parsed(raw);

  if (settings.profiles.list.some((profile) => profile.name === name))
    throw new Error(`A profile named "${name}" already exists — nothing to do.`);
  if (!existsSync(directory)) throw new Error(`startingDirectory does not exist: ${directory}`);
  if (!existsSync(icon)) throw new Error(`icon does not exist: ${icon}`);
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error(`tabColor must be #RRGGBB, got: ${color}`);

  const backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(path, backup);

  const guid = `{${crypto.randomUUID()}}`;
  const profile = [
    "{",
    `    "commandline": ${JSON.stringify(commonCommandline(settings))},`,
    `    "guid": "${guid}",`,
    '    "hidden": false,',
    `    "icon": "${icon.replace(/\\/g, "/")}",`,
    `    "name": "${name}",`,
    `    "startingDirectory": ${JSON.stringify(directory.replace(/\//g, "\\"))},`,
    `    "tabColor": "${color.toUpperCase()}"`,
    "}",
  ];

  const close = listCloseIndex(raw);
  // Indentation of the array's closing bracket, so the inserted block lines up with its siblings.
  const lineStart = raw.lastIndexOf("\n", close) + 1;
  const closeIndent = raw.slice(lineStart, close);
  const itemIndent = `${closeIndent}    `;
  const block = profile.map((line) => itemIndent + line).join("\n");

  const before = raw.slice(0, close).replace(/\s*$/, "");
  const updated = `${before},\n${block}\n${closeIndent}${raw.slice(close)}`;

  parsed(updated); // Refuse to write anything that would stop Windows Terminal from starting.
  writeFileSync(path, updated);
  return { guid, backup, path };
}

const [command, ...rest] = process.argv.slice(2);

if (command === "colors") {
  console.log(JSON.stringify(listColors(), null, 2));
} else if (command === "add") {
  const options = {};
  for (let index = 0; index < rest.length; index += 2)
    options[rest[index].replace(/^--/, "")] = rest[index + 1];
  const result = addProfile({
    name: options.name,
    directory: options.dir,
    icon: options.icon,
    color: options.color,
  });
  console.log(JSON.stringify(result, null, 2));
} else if (command === "icons-dir") {
  console.log(iconsDirectory());
} else {
  console.error("Usage: wt-profile.mjs colors | icons-dir | add --name <n> --dir <d> --icon <i> --color <#RRGGBB>");
  process.exit(1);
}
