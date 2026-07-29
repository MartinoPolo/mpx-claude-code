/**
 * SessionStart hook (matcher: *)
 * Surfaces this machine's root folders to every session.
 *
 * Values live in MPX_* environment variables (user scope), never in this repo —
 * the repo is public, the paths are personal. Unset variables are skipped, so a
 * machine that defines none produces no output and this hook stays silent.
 */

const ROOTS = [
  ["MPX_PROJECTS", "personal projects"],
  ["MPX_WORK", "work repositories"],
  ["MPX_CLONED", "cloned OSS repositories"],
  ["MPX_APPS", "local apps"],
  ["MPX_ONEDRIVE", "OneDrive root"],
  ["MPX_AI_GENERATED", "AI-generated assets (skill deliverables)"],
  ["MPX_OBSIDIAN_VAULT", "Obsidian vault"],
];

function main() {
  // The hook payload is irrelevant here — drain it so the writer never blocks,
  // but never parse it: an empty or malformed payload must not suppress output.
  process.stdin.resume();
  process.stdin.on("data", () => {});
  process.stdin.on("error", () => {});

  const found = ROOTS.filter(([name]) => (process.env[name] ?? "").trim());
  if (!found.length) process.exit(0);

  const lines = ["Machine roots (from MPX_* env vars — use these instead of guessing paths):"];
  for (const [name, label] of found) {
    lines.push(`- ${name} = ${process.env[name].trim()} — ${label}`);
  }
  lines.push("Paths outside the working directory should be resolved from these variables.");

  process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
}

try {
  main();
} catch {
  process.exit(0);
}
