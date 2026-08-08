# Windows Commands

The verified platform path. Domain rules live in [DOMAINS.md](DOMAINS.md).

## Two rules that govern everything here

**1. Run every deletion through the PowerShell tool.** The `dangerous-command-guard.mjs` hook is registered `PreToolUse` with `matcher: "Bash"`, so it inspects Bash only. It blocks `rmdir /s`, `del /f /q /s`, and `rm -rf <single-component-name>` outside its allowlist. The PowerShell tool is not intercepted, and PowerShell is the right tool for this work anyway. Route deletions through `scripts/Invoke-Removal.ps1`.

**2. Keep the trailing backslash on drive roots.** `"C:\".TrimEnd('\')` yields `"C:"`, which in .NET means *the current directory on drive C:*, not the root. This once reported a 459 GB drive as 0.5 GB, twice in a row, with no error. `Get-NormalizedRoot` in `scripts/_Common.ps1` handles it.

## Footguns encoded in the bundled scripts

| Footgun | Handling |
| --- | --- |
| Bare `C:` resolves to the process working directory on that drive | `Get-NormalizedRoot` restores the trailing backslash |
| `.Attributes` on a child dir throws on locked junctions (`C:\Documents and Settings`) and aborts the whole sibling loop, silently truncating the scan | `Get-ChildDirectoryPath` returns plain strings; `Test-ReparsePoint` checks per item |
| Junctions get followed and double-counted | Every walker skips reparse points **tagged as name surrogates** |
| Skipping every reparse point drops the whole OneDrive tree: Files-On-Demand tags each folder, so scanners report zero findings there with no error | `Get-ReparsePointKind` reads the reparse **tag** via `FindFirstFileW` and skips only the name-surrogate bit `0x20000000`; cloud/dedup/WIM placeholders get walked |
| The cloud attribute flags (`RECALL_ON_OPEN`, `PINNED`) do **not** identify a OneDrive folder — most carry `ReparsePoint` with none of them set | Classify by tag, never by attributes |
| A fully dehydrated placeholder enumerates as **empty** with no error, indistinguishable from a genuinely empty folder | Collected into `-UnscannedPlaceholderPath`; every scanner prints `Write-UnscannedPlaceholderWarning` so an under-scan is never read as a clean result |
| `Remove-Item -Recurse` on a junction can delete the target's contents in PowerShell 5.1 | `Invoke-Removal.ps1` calls `.Delete()` to unlink instead, and only for `Link` — placeholders take the normal path |
| pnpm-hardlinked `node_modules` free far less than logical size | Report the `Get-FreeSpaceSnapshot` delta, never the sum of sizes |
| Cache deletion returns exit code 5 and reclaims nothing while a browser is open | Failures are logged per item and surfaced, not swallowed |
| `wsl --manage --set-sparse` is refused as potentially corrupting | Never pass `--allow-unsafe` on a disk holding live data |
| Registry UserAssist launch history is too sparse to judge usage | `Get-InstalledApps.ps1` uses data-folder `LastWriteTime` |
| Matching an app to its data folder on the first word filed **Auto Dark Mode → Autodesk**, **Fast Node Manager → FastStone**, **VLC → JellyfinMediaPlayer**, making ten active apps look idle | Token containment both ways, one name wholly inside the other, ignoring generic vendor words; the `MatchedOn` column shows what the verdict rests on |
| `Import-Csv` in 5.1 ignores the UTF-8 BOM `Export-Csv` writes, so non-ASCII paths come back mangled and every row logs as `Missing` — a silent no-op that reads like success | `Read-ScanCsv` in `_Common.ps1`; never call `Import-Csv` directly |
| `Measure-Object -Sum` over an empty set has no `Sum` property, which throws under `Set-StrictMode` instead of returning zero | Read it through `Get-PropertyValue ... 'Sum' 0` |
| `@($list)` on a `List[object]` throws `ArgumentException` and yields an **empty** array in PowerShell 5.1 | Use `.ToArray()`; `Write-ScanCsv` takes an untyped `$Row` and normalises internally |
| A single-element array unrolls to a bare string on return or assignment, so `.Count` throws | Wrap call sites and whole `if` expressions in `@()` |
| Missing registry properties (`Publisher`, `DisplayVersion`) throw under `Set-StrictMode` | Read them via `Get-PropertyValue` |

## Scan boundary

```powershell
Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 3'   # 3 = local fixed disk only
```

## Fast scanner detection

```powershell
$wizTree = Get-Command wiztree -ErrorAction SilentlyContinue
if (-not $wizTree) { $wizTree = Get-ChildItem 'C:\Program Files\WizTree\WizTree64.exe' -ErrorAction SilentlyContinue }
Get-Command du -ErrorAction SilentlyContinue        # Sysinternals
Get-Command TreeSizeFree -ErrorAction SilentlyContinue
```

WizTree reads the NTFS MFT directly and maps a full drive in seconds:

```powershell
& "C:\Program Files\WizTree\WizTree64.exe" "C:\" /export="$env:TEMP\wiztree-c.csv" /admin=1
```

Offer once when absent, then fall back without asking again:

```powershell
winget install --id AntibodySoftware.WizTree --silent --accept-package-agreements
```

The bundled fallback, used when no fast scanner is present:

```powershell
powershell -NoProfile -File scripts/Scan-FolderMap.ps1 -Root "C:\" -Depth 3 -MinGB 0.5 -OutCsv "<scratch>\map-c.csv"
```

## Domain commands

### 1. Regenerable dev caches

```powershell
npm cache clean --force
pnpm store prune                      # store only; pnpm\global holds installed tools
yarn cache clean
bun pm cache rm
uv cache clean
cargo cache --autoclean               # when cargo-cache is installed
```

Cache roots worth measuring before proposing:

```powershell
"$env:LOCALAPPDATA\Yarn\Cache", "$env:LOCALAPPDATA\npm-cache", "$env:LOCALAPPDATA\pnpm\store",
"$env:LOCALAPPDATA\uv\cache", "$env:LOCALAPPDATA\NVIDIA\DXCache", "$env:LOCALAPPDATA\NVIDIA\GLCache",
"$env:LOCALAPPDATA\ms-playwright", "$env:TEMP", "$env:USERPROFILE\.cargo\registry\src",
"$env:USERPROFILE\scoop\cache", "$env:USERPROFILE\.gradle\caches"
```

Keep the newest Playwright build per engine, remove superseded ones.

### 2. Docker / WSL

```powershell
docker system df -v
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Image}}'   # includes STOPPED containers
docker builder prune -f
docker image prune -f                                          # dangling only
docker image rm <id>                                           # cherry-picked, after grouping by origin
wsl -l -v
```

Cross-reference `docker ps -a` before calling any image unused. Images held by stopped containers are live work.

Virtual disk locations:

```powershell
"$env:LOCALAPPDATA\Docker\wsl\disk\docker_data.vhdx"
"$env:LOCALAPPDATA\Packages\*\LocalState\ext4.vhdx"
```

Compaction goes in the elevated script:

```powershell
wsl --shutdown
Optimize-VHD -Path "<vhdx>" -Mode Full        # needs Hyper-V module
# without Hyper-V: diskpart -> select vdisk file="<vhdx>" -> compact vdisk
```

### 3. Stale build output

```powershell
powershell -NoProfile -File scripts/Find-BuildArtifacts.ps1 -Root $env:MPX_PROJECTS,$env:MPX_WORK,$env:MPX_CLONED -OutCsv "<scratch>\build.csv"
```

### 4. Apps and orphaned app data

```powershell
powershell -NoProfile -File scripts/Get-InstalledApps.ps1 -IdleMonths 6 -OutCsv "<scratch>\apps.csv"
```

Uninstall with the registry's own quiet string, then verify the folder is gone:

```powershell
Start-Process -FilePath "<uninstaller.exe>" -ArgumentList '/S' -Wait
Test-Path "<InstallLocation>"        # True means it deregistered but left its folder
```

Orphaned app data lives in `$env:APPDATA` and `$env:LOCALAPPDATA` immediate subfolders — match against the apps CSV.

### 5. Screenshots

```powershell
powershell -NoProfile -File scripts/Find-Screenshots.ps1 -Root $env:USERPROFILE,$env:MPX_ONEDRIVE -OlderThanMonths 3 -OutCsv "<scratch>\shots.csv"
```

### 6. Duplicates and empty items

```powershell
powershell -NoProfile -File scripts/Find-Duplicates.ps1 -Root "D:\" -MinMB 5 -OutCsv "<scratch>\dupes.csv"
powershell -NoProfile -File scripts/Find-EmptyItems.ps1 -Root $env:USERPROFILE -OutCsv "<scratch>\empty.csv"
```

### 7. Downloads and installers

```powershell
Get-ChildItem "$env:USERPROFILE\Downloads" -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -match '^\.(exe|msi|iso|zip|7z|rar)$' -and $_.LastWriteTime -lt (Get-Date).AddMonths(-6) } |
    Sort-Object Length -Descending |
    Select-Object FullName, @{n='MB';e={[math]::Round($_.Length/1MB,1)}}, LastWriteTime
```

Vendor unpack folders worth checking: `C:\NVIDIA`, `C:\AMD`, `C:\Intel`.

### 8. System reclaim (elevated script only)

```powershell
Dism.exe /Online /Cleanup-Image /StartComponentCleanup
Stop-Service wuauserv, bits -Force
Remove-Item "$env:WINDIR\SoftwareDistribution\Download\*" -Recurse -Force
Start-Service wuauserv, bits
Remove-Item "$env:WINDIR\MEMORY.DMP" -Force
Remove-Item "$env:LOCALAPPDATA\CrashDumps\*" -Force
Delivery Optimization: Delete-DeliveryOptimizationCache -Force
vssadmin list shadowstorage
```

`C:\Windows.old` removal is one-way and forfeits OS rollback — state that in the approval question.

## Visual review

```powershell
powershell -NoProfile -File scripts/New-VisualStaging.ps1 -InputCsv "<scratch>\shots.csv" -StagingRoot "<scratch>\stage\screenshots" -Open
```

Hardlinks when the candidate is on the staging volume, `.lnk` shortcuts across volumes. Thumbnails render either way. Ask the group's approval after the window opens, then delete the staging folder.

## Execution

```powershell
powershell -NoProfile -File scripts/Invoke-Removal.ps1 -InputCsv "<scratch>\shots.csv" -Destination Quarantine -DryRun
powershell -NoProfile -File scripts/Invoke-Removal.ps1 -InputCsv "<scratch>\shots.csv" -Destination Quarantine -LogCsv "<scratch>\removed.csv"
```

`-DryRun` is an explicit switch, not `SupportsShouldProcess`/`-WhatIf`: `-WhatIf` sets `$WhatIfPreference` for the whole script scope, which leaks into module auto-loading and buries the report under `What if: Set Alias` lines.

`-Destination Fast` is for regenerable caches only. Quarantine lands in `<drive>:\_cleanup_quarantine\<YYYY-MM-DD>\`, one root per drive so every move stays same-volume and instant.
