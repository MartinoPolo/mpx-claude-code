# Cleanup Domains

Detection rules and safety heuristics for each domain. Platform-neutral — concrete commands live in `WINDOWS.md`, `MACOS.md`, `LINUX.md`.

Every domain sub-agent returns groups in this shape:

| Field | Meaning |
| --- | --- |
| `group` | Short label shown in the approval question, e.g. `Yarn cache` |
| `domain` | Domain number 1-8, or `archive` |
| `paths` | Full paths in the group |
| `gb` | Logical size — a ceiling, not a promise |
| `age` | Newest last-write across the group |
| `destination` | `Fast` \| `RecycleBin` \| `Quarantine` \| `Elevated` \| `ReportOnly` |
| `visual` | `true` when the group holds images or video → triggers the staging-folder review |
| `confidence` | `high` \| `medium` \| `low` |
| `reason` | One line the user can judge from |
| `status` | `Candidate` \| `Protected` — protected items are listed, never proposed |

Confidence `low` groups are reported for information and left unproposed.

## Universal protection rules

Apply before anything reaches an approval question.

- **Photos are out of scope.** Camera-origin files are never enumerated as deletion candidates. Markers: `IMG_`, `DSC_`, `PXL_`, `VID_`, `MOV_`, `DCIM`, `Camera Roll`, `YYYYMMDD_HHMMSS` filenames.
- **Personal video is never a delete candidate.** Release markers (`S01E02`, `1080p`, `2160p`, `x265`, `WEB-DL`, `BluRay`, release-group suffixes) qualify a video for the ARCHIVE report only.
- **Curated folders win over every other signal.** A path containing `memories`, `keep`, `favorites`/`favourites`, `album`, or a year-named photo folder is protected even when its contents match a deletion pattern.
- **Active project = git `HEAD` within 3 months** → regenerable caches only; build output stays.
- **Quarantine roots are excluded from every scan** so pending items never resurface as fresh candidates.
- **Local fixed disks only.** Network shares, mapped drives and removable media are skipped.
- **Cloud-synced paths carry a propagation warning** on every group: a delete there reaches every synced device and the cloud copy.
- **A cloud tree that scans clean has not necessarily been scanned.** Files-On-Demand placeholders enumerate as empty without error. Every scanner reports what it could not open; carry that count into the dashboard rather than presenting the domain as complete.
- **Hashing is local.** Only path, size, date and digest leave the machine; file contents are never read into context.

## 1. Regenerable dev caches

**Destination:** `Fast` — Recycle Bin is unusable at 500k-file scale and pointless for data that rebuilds itself.

Package manager caches (npm, pnpm, yarn, bun, uv, pip, cargo, scoop, Gradle, Maven), browser-engine downloads (Playwright, Puppeteer), GPU shader caches, and system temp.

- Prune via each tool's own command where one exists — it knows what is still referenced.
- Keep globally-installed tooling. The pnpm store is cache; `pnpm/global` is installed programs.
- Keep the newest browser-engine build, remove superseded ones. Off-by-one here has removed the in-use build; harmless but worth avoiding.
- Skip the session scratchpad — the sweep's own working files live there.
- Browser asset caches only. Cookies, history and logins are never touched.

**Locked files:** browsers and editors hold their caches open; deletion silently reclaims nothing while returning success-adjacent exit codes. Verify by free-space delta and report honestly.

## 2. Docker / WSL / VM disks

**Destination:** `RecycleBin` for exports, `Elevated` for compaction.

Order: build cache → dangling images → cherry-picked unreferenced images → disk compaction.

- **An image attached to a stopped container is not an orphan.** Cross-reference every container, not just running ones. A pre-approved "unused image" prune once came within one command of deleting a live work stack. When a supposedly-safe prune turns out to hold real work, stop and re-confirm — an earlier approval does not survive new evidence.
- Group remaining images by origin (public base images, private-registry work images, locally-built) and let the user pick per group.
- Volumes hold data. Report them; never propose them.
- Virtual disks do not shrink when files inside are deleted — compaction is a separate elevated step.
- Sparse-conversion is refused by the OS as potentially corrupting. Do not override that on a disk holding live data.

## 3. Stale dev build output

**Destination:** `RecycleBin`.

`node_modules`, `target`, `dist`, `build`, `.next`, `.svelte-kit`, `.nuxt`, `.turbo`, `coverage`, `__pycache__`, `.venv`.

- Only in projects whose repo has no commit within 3 months.
- Stop descending at the first match — nested matches are already inside the parent's total.
- A directory with no git history is `medium` confidence at best: confirm before proposing.
- **Hardlinked stores mean logical size overstates the gain.** One sweep showed 2.88 GB logical and freed 1.31 GB. Report the measured delta.

## 4. Installed apps and orphaned app data

**Destination:** `RecycleBin` for leftovers; uninstalls run through each app's own uninstaller.

- Inventory from the system's package/uninstall registry, all hives and architectures.
- **Judge usage by the app's data-folder write time.** Registry launch-history is too sparse to trust; it has reported obviously-active apps as never launched.
- **Check what the folder match rests on before trusting an idle verdict.** A wrong data-folder match is what makes an active app look idle; the scanner exposes the matched tokens for exactly this.
- **Re-verify every uninstall at execution time — new evidence overrides an earlier approval.** One sweep reached execution with approval to remove two python.org MSI installs, a Windows SDK and the live WSL package. The PEP 514 registry (`HKCU:\SOFTWARE\Python\PythonCore\<ver>\InstallPath`) showed the MSIs owned the interpreters on `PATH`; `Windows Kits\10\Include` showed the "old" SDK was the newest one present and the only one the MSVC toolchain could link against; the WSL package was backing live distros. All three were revoked at the last moment.
- **When a removal is justified by "a newer version stays", prove the newer version exists — by file count, not by folder presence.** A sweep removed Visual Studio 2017 on the stated grounds that VS2022 would take over. The `2022` directory existed and held zero files; the machine was left with no C/C++ compiler and a Rust toolchain that could no longer link. An empty vendor shell is the normal residue of an uninstall, so its presence is evidence of the opposite.
- Uninstalling the last of a kind is a different decision from uninstalling one of several. Compilers, SDKs, language runtimes and hypervisors need the "what else provides this?" check before the group is ever proposed.
- A registry `EstimatedSize` is an estimate. Never report it as reclaimable space.
- Idle threshold: 6 months without data-folder activity.
- Prefer each app's silent-uninstall string; verify removal afterwards, since some uninstallers deregister but leave their folder.
- Orphaned app data qualifies only when **both** hold: the folder matches no installed app, **and** it is older than 6 months. Vendor and framework folders are skipped unless clearly belonging to something uninstalled.
- Old game data may hold saves. Flag it as such rather than assuming it is safe.

## 5. Screenshots

**Destination:** `Quarantine`. **Visual:** yes.

- Detect by capture-tool naming (`Screenshot_`, `Screen Shot `, `Snipaste_`, `ShareX_`, `Greenshot_`, `Lightshot`, `Capture_`, `Clipboard_`) or by living in a screenshot sink folder.
- Candidate when older than 3 months. Newer ones stay.
- Curated-folder and camera-origin protection apply first.
- Approved as one group per folder after the staging-folder review — no per-file questions.

## 6. Duplicates, empty items and sync conflicts

**Destination:** `Quarantine` for content files, `RecycleBin` for empty items.

- Duplicates: group by exact byte length first, hash only within same-length groups. Keep the oldest copy — it is what links and references point at.
- Sync conflict copies: device-tagged names (`note (Yoga9iron).md`), numeric suffixes (`report (1).pdf`), `- Copy`, `conflicted copy`, `.sync-conflict-`.
- A conflict-named file whose content differs from its sibling is **not** a duplicate. Report it for review.
- Empty directories: judge post-order so a tree of empty directories collapses to one reportable root. Report only the topmost.
- Keep empty directories that are scaffolding for installed tooling or git internals. When unsure, keep.

## 7. Downloads, installers and stale media

**Destination:** `RecycleBin` for installers, `ReportOnly` for media.

- Installers (`.exe`, `.msi`, `.dmg`, `.pkg`, `.deb`, `.iso`, archives) in download folders, older than 6 months.
- Unpacked driver payloads left behind by vendor installers.
- Media files go to ARCHIVE, never to a delete group.

## 8. System-level reclaim

**Destination:** `Elevated` — collected into one script, never executed inline.

Component-store cleanup, update caches, previous-OS folders, crash dumps and error reports, delivery/update caches, shadow copies, hibernation sizing.

- Previous-OS folders expire on their own; removal is one-way and forfeits rollback. Say so.
- Shadow copies are restore points. Removing them removes the ability to roll back.

## ARCHIVE (report only)

**Destination:** `ReportOnly` — zero file operations, ever.

- Anything untouched for over a year.
- Videos of 1 GB or more, excluding personal video.

Output is a ranked list: path, size, last-touch date, and a suggested external-drive destination. The user moves things themselves.
