---
name: mp-clean-pc
description: 'Full-disk cleanup sweep across caches, Docker/WSL, build output, apps, screenshots, duplicates, installers and system reclaim, with per-group approval and visual review. Use when: "clean my pc", "disk cleanup", "free up space"'
argument-hint: "[domain] [drive]"
disable-model-invocation: true
allowed-tools: Bash, PowerShell, Read, Write, Agent, Artifact, AskUserQuestion
metadata:
  author: MartinoPolo
  version: "0.2"
  category: utility
---

# Clean PC

Scan every local disk, rank what can be reclaimed, and remove only what the user approves group by group. $ARGUMENTS

Detection rules and safety heuristics: [DOMAINS.md](DOMAINS.md). Concrete commands: [WINDOWS.md](WINDOWS.md) (verified), [MACOS.md](MACOS.md) / [LINUX.md](LINUX.md) (unverified).

The bundled scanners and the removal helper live in `${CLAUDE_SKILL_DIR}/scripts/`. Every `scripts/...` path below and in the platform files resolves against that directory.

## Process

1. Resolve platform, scope and prior state
2. Detect a fast scanner
3. Scan all domains in parallel sub-agents
4. Present a ranked dashboard
5. Approve group by group
6. Execute and report the measured delta

### Step 1: Resolve Platform, Scope and Prior State

Detect the OS and read the matching platform file. Windows is the verified path; on macOS or Linux, tell the user those commands are unverified and dry-run each one.

Read `~/.claude/mp-clean-pc/state.json` when it exists:

- **Checkpoint present** → offer to resume from the last completed domain instead of rescanning.
- **Declined groups** → skip them silently. Re-asking about the same app every sweep is noise.
- **Baseline from the last run** → report the delta since then.
- **Quarantine roots** → report their current size so pending items get emptied.

Resolve project roots from `MPX_PROJECTS`, `MPX_WORK`, `MPX_CLONED`, `MPX_APPS`, `MPX_ONEDRIVE`. An unset variable means that root is unavailable — ask rather than guessing a path.

`$ARGUMENTS` optionally narrows the sweep to one domain name and/or one drive letter. With no arguments, scan all eight domains across all local fixed disks.

### Step 2: Detect a Fast Scanner

Probe for WizTree, then TreeSize, then Sysinternals `du` (macOS/Linux: `ncdu`, `dust`, `gdu`). Drive whichever is present.

When none is found, offer the install once via the platform file's command. If the user declines, fall back to `scripts/Scan-FolderMap.ps1` and stop offering for this run.

### Step 3: Scan All Domains in Parallel

Spawn one `general-purpose` sub-agent per domain with `model: "sonnet"`, all in a single message so they run concurrently. `general-purpose` declares no model of its own, so the parameter is load-bearing — see [../shared/SUBAGENT_PROTOCOL.md](../shared/SUBAGENT_PROTOCOL.md) § 3. Give each sub-agent:

- The domain's section from `DOMAINS.md` and the platform file
- The resolved roots, the exclusion list, and the quarantine roots
- The universal protection rules
- The scratchpad path for its CSV output

Each sub-agent returns groups in the schema defined in `DOMAINS.md`: `group`, `domain`, `paths`, `gb`, `age`, `destination`, `visual`, `confidence`, `reason`, `status`.

Sub-agent prompt shape:

```text
Scan domain <N> (<name>) on <platform> and return candidate groups. Read only.

Rules: <domain section from DOMAINS.md>
Commands: <domain section from the platform file>
Roots: <resolved roots>       Exclude: <quarantine roots + scratchpad>

Required actions:
1) Run the domain's scanner, or `scripts/Scan-FolderMap.ps1` as the fallback.
2) Classify every finding as Candidate or Protected, with a one-line reason.
3) Group findings so each group can be approved or declined as a unit.
4) Mark groups holding images or video as visual: true.

Required output: the group schema from DOMAINS.md, as JSON. Report sizes as
measured, and say plainly when a scan was partial or a path was unreadable.
```

Write each domain's raw CSV to the scratchpad. Checkpoint `state.json` after each domain returns, so an interrupted sweep resumes rather than restarts.

### Step 4: Present a Ranked Dashboard

Build an HTML dashboard with the `Artifact` tool, ranked by reclaimable GB: group, domain, size, age, destination, confidence, reason.

Include a separate ARCHIVE section — items untouched over a year and videos of 1 GB or more — as a report only, with a suggested external-drive destination.

Show counts, sizes, date ranges and paths. Images and video stay out of the artifact: embedding a thumbnail publishes that content. Explorer is the viewer for pixels.

State clearly that listed sizes are logical ceilings and the real gain is the free-space delta measured in Step 6.

### Step 5: Approve Group by Group

Walk groups in descending size. For each, use `AskUserQuestion` with the group's size, age, destination, confidence and reason.

**Visual groups first get a staging folder.** Run `scripts/New-VisualStaging.ps1` to hardlink every candidate into one folder and open it, so the whole group is reviewable as thumbnails in a single window. Ask after the window opens. Delete the staging folder, then move to the next group. One window at a time.

Non-visual groups stay text-only.

Attach the propagation warning to every group under a cloud-synced path: deleting there reaches every synced device and the cloud copy.

**Re-verify at execution time.** An approval describes the scan, not the truth. When execution reveals the scan was wrong — an image that turns out to belong to a stopped container, a project that turns out to be live — stop, say so, and ask again. New evidence overrides an earlier approval.

Record every decision in `state.json`, declines included.

### Step 6: Execute and Report

Take a free-space snapshot, execute approved groups by destination, then snapshot again.

| Destination | Route |
| --- | --- |
| `Fast` | `Invoke-Removal.ps1 -Destination Fast` — regenerable caches only |
| `RecycleBin` | `Invoke-Removal.ps1 -Destination RecycleBin` — the default |
| `Quarantine` | `Invoke-Removal.ps1 -Destination Quarantine` — visual files, browsable and reversible |
| `Elevated` | collected into one script, never run inline |
| `ReportOnly` | ARCHIVE — no file operations |

Run `-DryRun` first on any group above 5 GB.

Collect every admin-requiring operation into a single reviewed `.ps1` in the scratchpad and hand it to the user to run elevated. One script at the end, not a UAC prompt per operation.

Update the dashboard to a results view and write `state.json`.

Report:

- **Measured free-space delta per drive** — the honest number
- Groups executed, declined, and failed, with reasons
- Locked files that reclaimed nothing, stated as failures rather than successes
- Quarantine size and location, for the user to empty
- ARCHIVE candidates
- The elevated script's path and what it will do

## Output

A ranked dashboard, a per-group decision log, and a free-space delta per drive. Sum-of-sizes is never reported as the result: hardlinked stores and locked files make it a fiction.
