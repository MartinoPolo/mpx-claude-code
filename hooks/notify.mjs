/**
 * Stop hook — desktop notification (terminal flash + beep).
 *
 * The notification itself is Windows-specific (notify-flash-beep.ps1). This
 * wrapper makes the hook safe to ship in a cross-platform plugin: on any
 * non-Windows host it is a silent no-op instead of a failing powershell call.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Drain the hook payload so the writer never blocks; its contents are irrelevant.
process.stdin.resume();
process.stdin.on("data", () => {});
process.stdin.on("error", () => {});

if (process.platform !== "win32") process.exit(0);

const script = join(dirname(fileURLToPath(import.meta.url)), "notify-flash-beep.ps1");
try {
  spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], {
    stdio: "ignore",
  });
} catch {}
process.exit(0);
