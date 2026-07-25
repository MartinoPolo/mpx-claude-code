# Linux Commands

> **UNVERIFIED.** These commands have never been executed by this skill. The Windows path is the tested one. Treat everything here as a starting point: dry-run each command, confirm paths exist, and prefer reporting over deleting until a run has proven itself.

Domain rules live in [DOMAINS.md](DOMAINS.md). The bundled `scripts/*.ps1` are Windows-only; on Linux the shell commands below replace them.

## Scan boundary

```bash
lsblk -o NAME,MOUNTPOINT,SIZE,TYPE,RM        # RM=1 means removable
findmnt -t nfs,cifs,fuse.sshfs               # network mounts to skip
df -h -x tmpfs -x devtmpfs
```

Include local block devices. Skip removable and network mounts.

## Fast scanner detection

```bash
command -v ncdu || command -v dust || command -v gdu || command -v duc
sudo apt install ncdu     # or dnf/pacman; offer once, then fall back
du -x -d 3 -BG / 2>/dev/null | sort -rn | head -50
```

`-x` keeps `du` on one filesystem — the equivalent of the junction-safe rule, and it also stops the walk from descending into `/proc`, `/sys` and bind mounts.

## Deletion

```bash
command -v gio && gio trash "<path>"      # reversible, freedesktop trash
command -v trash-put && trash-put "<path>"

# Quarantine, mirroring the Windows behaviour
mkdir -p "$HOME/_cleanup_quarantine/$(date +%F)"
```

Keep quarantine on the same filesystem as the source so `mv` stays instant rather than copying.

## Domain commands

### 1. Regenerable dev caches

```bash
npm cache clean --force
pnpm store prune
yarn cache clean
uv cache clean
cargo cache --autoclean
sudo apt clean            # or: dnf clean all / pacman -Sc
journalctl --vacuum-size=200M
```

Cache roots: `~/.cache`, `~/.npm`, `~/.local/share/pnpm/store`, `~/.cargo/registry/src`, `~/.gradle/caches`, `~/.cache/ms-playwright`, `/var/cache`, `/var/tmp`.

`journalctl` logs and old kernels in `/boot` are frequently the largest system-side win.

### 2. Docker / VM disks

```bash
docker system df -v
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Image}}'
docker builder prune -f
docker image prune -f
```

Storage lives at `/var/lib/docker` (root-owned — sizing needs `sudo`). With the overlay2 driver, space frees on delete without a compaction step, so there is no vhdx-equivalent.

### 3. Stale build output

```bash
find "$HOME/projects" -type d \( -name node_modules -o -name target -o -name .next -o -name .svelte-kit \) -prune -print
git -C "<repo>" log -1 --format=%cI     # activity check, 3-month cutoff
```

### 4. Apps and orphaned app data

```bash
apt list --installed          # or: dnf list installed / pacman -Qe
sudo apt autoremove           # orphaned dependencies
flatpak uninstall --unused
snap list --all               # then remove disabled revisions
```

Leftover config after removal: `~/.config`, `~/.local/share`, `~/.cache`. Match those against the installed-package list; anything unmatched and older than 6 months qualifies.

### 5. Screenshots

```bash
find "$HOME/Pictures/Screenshots" "$HOME/Pictures" -maxdepth 2 \
     \( -name 'Screenshot*' -o -name 'Screen Shot*' -o -name 'Spectacle*' -o -name 'flameshot*' \) -mtime +90
```

### 6. Duplicates and empty items

```bash
find "<root>" -type d -empty -print
find "<root>" -type f -empty -print
find "<root>" -type f -size +5M -printf '%s %p\n' | sort -n    # group by size first
sha256sum "<file>"                                              # hash only same-size candidates
command -v rdfind && rdfind -dryrun true "<root>"               # if available
```

Nextcloud and Syncthing conflict copies: `*conflicted copy*`, `*.sync-conflict-*`.

### 7. Downloads and installers

```bash
find "$HOME/Downloads" -type f \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' -o -name '*.iso' -o -name '*.tar.*' \) -mtime +180
```

### 8. System reclaim

```bash
sudo journalctl --vacuum-time=30d
sudo apt autoremove --purge          # removes superseded kernels
dpkg --list | grep '^rc'             # removed-but-configured packages
sudo du -sh /var/log/*
```

Old kernels in `/boot` matter most on a small boot partition. Keep at least the running kernel and one fallback. Collect all `sudo` operations into one script rather than prompting repeatedly.

## Visual review

```bash
xdg-open "<staging-folder>"
ln "<source>" "<staging>/<name>"      # hardlink, same filesystem
ln -s "<source>" "<staging>/<name>"   # symlink fallback across filesystems
```

Thumbnail rendering depends on the file manager; GNOME Files and Dolphin both handle links.
