#!/usr/bin/env node
// Set a project's Peacock colour, and report which colours are already taken across every
// project.
//
// The derived block was once reverse-engineered from committed Peacock blocks and verified
// (activity bar = base +10 points of HSL lightness, status-bar hover = base −10, foregrounds
// flip on perceived luminance), but Peacock's badge algorithm could not be reproduced. So
// `peacock.color` is now the single source of truth and Peacock regenerates every derived
// colour itself; `write` clears any stale derived keys left behind by an earlier colour.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Keys Peacock owns and rewrites from `peacock.color`. Anything else a user put in
// `workbench.colorCustomizations` is theirs and survives a write.
const PEACOCK_OWNED_KEYS = new Set([
  "activityBar.activeBackground",
  "activityBar.background",
  "activityBar.foreground",
  "activityBar.inactiveForeground",
  "activityBarBadge.background",
  "activityBarBadge.foreground",
  "activityBarTop.activeBackground",
  "activityBarTop.background",
  "activityBarTop.foreground",
  "activityBarTop.inactiveForeground",
  "commandCenter.border",
  "commandCenter.foreground",
  "sash.hoverBorder",
  "statusBar.background",
  "statusBar.debuggingBackground",
  "statusBar.debuggingForeground",
  "statusBar.foreground",
  "statusBarItem.hoverBackground",
  "tab.activeBorder",
  "titleBar.activeBackground",
  "titleBar.activeForeground",
  "titleBar.inactiveBackground",
  "titleBar.inactiveForeground",
]);

// Every peacock.color already committed under the machine roots, so a new project can be
// given a colour nobody else is using.
function used() {
  const roots = ["MPX_PROJECTS", "MPX_WORK"]
    .map((name) => ({ name, value: process.env[name] }))
    .filter((root) => root.value && existsSync(root.value));
  if (roots.length === 0) throw new Error("Neither MPX_PROJECTS nor MPX_WORK resolves — cannot scan for colours.");

  const taken = [];
  for (const root of roots)
    for (const entry of readdirSync(root.value, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const settings = join(root.value, entry.name, ".vscode", "settings.json");
      if (!existsSync(settings)) continue;
      try {
        const colour = JSON.parse(readFileSync(settings, "utf8"))["peacock.color"];
        if (colour) taken.push({ project: entry.name, peacockColor: colour.toUpperCase() });
      } catch {
        taken.push({ project: entry.name, peacockColor: "unreadable" });
      }
    }
  return taken;
}

function write(projectDirectory, base) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(base)) throw new Error(`Colour must be #RRGGBB, got: ${base}`);
  const directory = join(projectDirectory, ".vscode");
  const path = join(directory, "settings.json");

  let settings = {};
  if (existsSync(path)) settings = JSON.parse(readFileSync(path, "utf8"));
  else mkdirSync(directory, { recursive: true });

  // A block derived from the previous colour would keep winning visually over the new
  // peacock.color, so the stale keys go before Peacock regenerates them.
  const customizations = settings["workbench.colorCustomizations"];
  let clearedKeys = [];
  if (customizations && typeof customizations === "object") {
    clearedKeys = Object.keys(customizations).filter((key) => PEACOCK_OWNED_KEYS.has(key));
    for (const key of clearedKeys) delete customizations[key];
    if (Object.keys(customizations).length === 0) delete settings["workbench.colorCustomizations"];
  }

  settings["peacock.color"] = base.toLowerCase();

  writeFileSync(path, `${JSON.stringify(settings, null, 4)}\n`);
  return { path, peacockColor: settings["peacock.color"], clearedKeys };
}

const [command, ...rest] = process.argv.slice(2);

if (command === "used") console.log(JSON.stringify(used(), null, 2));
else if (command === "write") console.log(JSON.stringify(write(rest[0], rest[1]), null, 2));
else {
  console.error("Usage: peacock.mjs used | write <projectDir> <#RRGGBB>");
  process.exit(1);
}
