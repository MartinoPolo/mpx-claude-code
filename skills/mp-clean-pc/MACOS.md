# macOS Commands

> **UNVERIFIED.** These commands have never been executed by this skill. The Windows path is the tested one. Treat everything here as a starting point: dry-run each command, confirm paths exist, and prefer reporting over deleting until a run has proven itself.

Domain rules live in [DOMAINS.md](DOMAINS.md). The bundled `scripts/*.ps1` are Windows-only; on macOS the shell commands below replace them.

## Scan boundary

```bash
df -h                                    # local volumes
diskutil info -all | grep -E 'Volume Name|Protocol|Removable'
```

Include local internal volumes. Skip anything mounted from `/Volumes` that reports as external or network.

## Fast scanner detection

```bash
command -v ncdu || command -v dust || command -v gdu
brew install ncdu                        # offer once, then fall back
du -x -d 3 -g / 2>/dev/null | sort -rn | head -50   # -x stays on one filesystem
```

`-x` is the macOS equivalent of the junction-safe rule: it stops `du` from crossing into other mounts.

## Deletion

There is no Recycle Bin API on the command line. Two options:

```bash
# Reversible: move to the user Trash
mv "<path>" ~/.Trash/

# Quarantine, mirroring the Windows behaviour
mkdir -p "/Users/$USER/_cleanup_quarantine/$(date +%F)"
```

Keep quarantine on the same volume as the source so moves stay instant.

## Domain commands

### 1. Regenerable dev caches

```bash
npm cache clean --force
pnpm store prune
yarn cache clean
brew cleanup -s
rm -rf ~/Library/Caches/ms-playwright/<superseded-build>
```

Cache roots: `~/Library/Caches`, `~/.npm`, `~/.cache`, `~/.gradle/caches`, `~/Library/Developer/Xcode/DerivedData`, `~/Library/Developer/CoreSimulator/Devices`.

Xcode DerivedData and unused simulator runtimes are usually the largest single win on a Mac.

### 2. Docker / VM disks

```bash
docker system df -v
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Image}}'
docker builder prune -f
docker image prune -f
```

The Docker Desktop disk image lives at `~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`. It does not shrink on its own; Docker Desktop's own "Clean / Purge data" is the supported path.

### 3. Stale build output

```bash
find "$HOME/projects" -type d \( -name node_modules -o -name target -o -name .next -o -name .svelte-kit \) -prune -print
git -C "<repo>" log -1 --format=%cI     # activity check, 3-month cutoff
```

`-prune` gives the stop-at-first-match behaviour that prevents double-counting.

### 4. Apps and orphaned app data

```bash
ls /Applications
mdls -name kMDItemLastUsedDate "/Applications/<App>.app"   # usage signal
```

Leftovers after an app is removed: `~/Library/Application Support`, `~/Library/Preferences`, `~/Library/Caches`, `~/Library/Logs`, `~/Library/Containers`.

Dragging an app to the Trash leaves all of those behind — that is the macOS equivalent of the orphaned-AppData sweep.

### 5. Screenshots

```bash
defaults read com.apple.screencapture location    # configured screenshot folder
find "$HOME/Desktop" -name 'Screen Shot *' -o -name 'Screenshot *'
```

macOS defaults to the Desktop, which is why screenshots accumulate there.

### 6. Duplicates and empty items

```bash
find "<root>" -type d -empty -print
find "<root>" -type f -empty -print
find "<root>" -type f -size +5M -exec stat -f '%z %N' {} \; | sort -n   # group by size first
shasum -a 256 "<file>"                                                   # hash only same-size candidates
```

iCloud conflict copies are named `<name> 2.<ext>`.

### 7. Downloads and installers

```bash
find "$HOME/Downloads" -type f \( -name '*.dmg' -o -name '*.pkg' -o -name '*.zip' \) -mtime +180
```

### 8. System reclaim

```bash
sudo tmutil listlocalsnapshots /                 # Time Machine local snapshots
sudo tmutil deletelocalsnapshots <date>
sudo rm -rf /Library/Caches/*
```

Local Time Machine snapshots are the macOS analogue of shadow copies: removing them removes rollback ability. Collect these into one `sudo` script rather than prompting repeatedly.

## Visual review

```bash
open "<staging-folder>"
ln "<source>" "<staging>/<name>"      # hardlink, same volume
ln -s "<source>" "<staging>/<name>"   # symlink fallback across volumes
```

Finder renders thumbnails for both.
