# Shared helpers for mp-clean-pc scanners.
# Dot-source from any scanner: . "$PSScriptRoot\_Common.ps1"
#
# Set-StrictMode belongs in the entry scripts, not here: dot-sourcing applies it to the
# caller's scope, which changes execution semantics for whoever loaded the library.

# Drive roots must keep their trailing backslash.
# In .NET, "C:" means "the current directory on drive C:", not the root of C:.
# Passing a TrimEnd('\')-ed root once made a full-disk scan report 0.5 GB instead of 459 GB.
function Get-NormalizedRoot {
    param([Parameter(Mandatory)][string]$Path)
    if ($Path -match '^[A-Za-z]:$') { return "$Path\" }
    if ($Path -match '^[A-Za-z]:\\$') { return $Path }
    return $Path.TrimEnd('\')
}

# Reading the reparse TAG needs FindFirstFileW: .NET Framework 4.x surfaces the
# ReparsePoint attribute but never the tag, and the tag is the only reliable way to tell a
# junction from a OneDrive placeholder. The cloud attribute flags are not a substitute -
# most OneDrive folders carry the ReparsePoint attribute with none of them set.
if (-not ('MpCleanPc.ReparseTag' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace MpCleanPc {
    public static class ReparseTag {
        // Pack = 4 is load-bearing. The native struct is DWORD-aligned throughout; with the
        // default x64 packing the 8-byte FILETIME fields align to 8 and push 4 bytes of
        // padding in after dwFileAttributes, so dwReserved0 lands on the wrong offset and
        // every tag reads back as 0.
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode, Pack = 4)]
        private struct WIN32_FIND_DATA {
            public uint dwFileAttributes;
            public uint ftCreationTimeLow;
            public uint ftCreationTimeHigh;
            public uint ftLastAccessTimeLow;
            public uint ftLastAccessTimeHigh;
            public uint ftLastWriteTimeLow;
            public uint ftLastWriteTimeHigh;
            public uint nFileSizeHigh;
            public uint nFileSizeLow;
            public uint dwReserved0;
            public uint dwReserved1;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string cFileName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 14)] public string cAlternateFileName;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr FindFirstFileW(string lpFileName, out WIN32_FIND_DATA lpFindFileData);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FindClose(IntPtr hFindFile);

        // 0 means "no tag available": either not a reparse point, or unreadable.
        public static uint Get(string path) {
            WIN32_FIND_DATA data;
            IntPtr handle = FindFirstFileW(path, out data);
            if (handle == new IntPtr(-1)) { return 0; }
            try {
                return (data.dwFileAttributes & 0x400) != 0 ? data.dwReserved0 : 0;
            } finally {
                FindClose(handle);
            }
        }
    }
}
'@
}

# Classify a reparse point, because the two kinds need opposite handling.
#   Link        - junction, symlink or volume mount point. Following one double-counts a
#                 tree or loops forever, so every walker skips these.
#   Placeholder - a reparse point that is not a link: OneDrive Files-On-Demand folder,
#                 dedup stub, WIM-backed file. An ordinary directory that must be walked.
#                 OneDrive tags EVERY folder as a reparse point, so a blanket reparse skip
#                 drops the whole cloud tree and reports zero findings there with no error.
# The discriminator is the documented name-surrogate bit: set for anything that stands in
# for another named entity (links), clear for placeholders. Preferred over matching the
# cloud tag family so dedup and WIM-backed trees are not skipped either.
# Unreadable paths report as Link so the caller skips them, as before.
function Get-ReparsePointKind {
    param([Parameter(Mandatory)][string]$Path)
    try {
        $attributes = [int][System.IO.File]::GetAttributes($Path)
    } catch {
        return 'Link'
    }
    if (($attributes -band 0x400) -eq 0) { return 'None' }

    $tag = [MpCleanPc.ReparseTag]::Get($Path)
    if ($tag -eq 0) { return 'Link' }
    if (($tag -band 0x20000000) -ne 0) { return 'Link' }
    return 'Placeholder'
}

# GetEnumerator().MoveNext() rather than a count: it stops at the first entry instead of
# materialising every child of a directory that may hold hundreds of thousands of them.
function Test-DirectoryHasEntry {
    param([Parameter(Mandatory)][string]$Path)
    try {
        $enumerator = [System.IO.Directory]::EnumerateFileSystemEntries($Path).GetEnumerator()
        try { return $enumerator.MoveNext() } finally { $enumerator.Dispose() }
    } catch {
        return $false
    }
}

# Child directories worth descending into: placeholders are traversed, links are not.
# A fully dehydrated cloud placeholder enumerates as empty without raising an error, which
# is indistinguishable from a genuinely empty folder. Those paths go into
# $UnscannedPlaceholderPath so the caller reports the gap instead of reporting zero
# findings for a tree that is merely not downloaded.
function Get-TraversableChildDirectory {
    param(
        [Parameter(Mandatory)][string]$Path,
        [ref]$UnscannedPlaceholderPath
    )
    $traversable = New-Object System.Collections.Generic.List[string]
    foreach ($childPath in Get-ChildDirectoryPath $Path) {
        $kind = Get-ReparsePointKind $childPath
        if ($kind -eq 'Link') { continue }
        if ($kind -eq 'Placeholder' -and -not (Test-DirectoryHasEntry $childPath)) {
            if ($null -ne $UnscannedPlaceholderPath) { $UnscannedPlaceholderPath.Value.Add($childPath) }
            continue
        }
        $traversable.Add($childPath)
    }
    return $traversable.ToArray()
}

# One line every scanner prints so an under-scan is never mistaken for a clean result.
function Write-UnscannedPlaceholderWarning {
    param([Parameter(Mandatory)][AllowNull()]$UnscannedPlaceholderPath)
    $paths = @($UnscannedPlaceholderPath)
    if ($paths.Count -eq 0) { return }
    Write-Host "WARNING: $($paths.Count) placeholder folder(s) could not be scanned - their contents are not downloaded locally, so any findings inside them are missing from this run:"
    $paths | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" }
    if ($paths.Count -gt 10) { Write-Host "  ... and $($paths.Count - 10) more" }
}

# Enumerate child directories as plain path strings.
# Reading .Attributes on each child during enumeration throws UnauthorizedAccessException
# on locked junctions (for example "C:\Documents and Settings") and aborts the whole
# sibling loop, silently truncating the scan. Return strings here and let the caller
# check each item individually via Get-ReparsePointKind.
function Get-ChildDirectoryPath {
    param([Parameter(Mandatory)][string]$Path)
    try {
        return @([System.IO.Directory]::EnumerateDirectories($Path))
    } catch {
        return @()
    }
}

function Get-ChildFilePath {
    param([Parameter(Mandatory)][string]$Path)
    try {
        return @([System.IO.Directory]::EnumerateFiles($Path))
    } catch {
        return @()
    }
}

# Local fixed disks only. Network shares, mapped drives and removable media stay out of scope.
function Get-LocalFixedDriveRoot {
    Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 3' |
        ForEach-Object { Get-NormalizedRoot $_.DeviceID }
}

# Read a property that may not exist. Registry objects routinely omit Publisher,
# DisplayVersion or EstimatedSize, and StrictMode turns a missing property into a throw.
function Get-PropertyValue {
    param(
        [Parameter(Mandatory)][AllowNull()]$InputObject,
        [Parameter(Mandatory)][string]$Name,
        $Default = $null
    )
    if ($null -eq $InputObject) { return $Default }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) { return $Default }
    return $property.Value
}

function Test-ExcludedPath {
    param(
        [Parameter(Mandatory)][string]$Path,
        [string[]]$ExcludePath = @()
    )
    foreach ($excluded in $ExcludePath) {
        if ($Path -like "$excluded*") { return $true }
    }
    return $false
}

# Quarantine roots are excluded from every scan so approved-but-not-yet-emptied
# files never resurface as fresh candidates on the next sweep.
function Get-QuarantineRoot {
    Get-LocalFixedDriveRoot | ForEach-Object { Join-Path $_ '_cleanup_quarantine' }
}

# Recursive size, file count and newest write time for one directory tree.
# Iterative rather than recursive to survive deep trees; skips links so linked trees are
# neither followed nor double-counted, while still descending into cloud placeholders.
function Get-DirectoryStat {
    param(
        [Parameter(Mandatory)][string]$Path,
        [string[]]$ExcludePath = @()
    )
    $totalBytes = [long]0
    $totalFiles = 0
    $newestWrite = [datetime]::MinValue
    $unscannedPlaceholder = New-Object System.Collections.Generic.List[string]

    $pending = [System.Collections.Generic.Stack[string]]::new()
    $pending.Push((Get-NormalizedRoot $Path))

    while ($pending.Count -gt 0) {
        $current = $pending.Pop()
        if (Test-ExcludedPath -Path $current -ExcludePath $ExcludePath) { continue }

        foreach ($filePath in Get-ChildFilePath $current) {
            try {
                $info = New-Object System.IO.FileInfo $filePath
                $totalBytes += $info.Length
                $totalFiles++
                if ($info.LastWriteTime -gt $newestWrite) { $newestWrite = $info.LastWriteTime }
            } catch { }
        }

        foreach ($childPath in Get-TraversableChildDirectory -Path $current -UnscannedPlaceholderPath ([ref]$unscannedPlaceholder)) {
            $pending.Push($childPath)
        }
    }

    [pscustomobject]@{
        Path           = $Path
        Bytes          = $totalBytes
        GB             = [math]::Round($totalBytes / 1GB, 3)
        Files          = $totalFiles
        LastWrite      = $newestWrite
        UnscannedPlaceholder = $unscannedPlaceholder.ToArray()
    }
}

# Free-space snapshot. Report the delta between two of these rather than the sum of
# candidate sizes: pnpm hardlinks and NTFS dedup mean logical size overstates the real gain.
function Get-FreeSpaceSnapshot {
    Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 3' | ForEach-Object {
        [pscustomobject]@{
            Drive  = $_.DeviceID
            FreeGB = [math]::Round($_.FreeSpace / 1GB, 2)
            SizeGB = [math]::Round($_.Size / 1GB, 2)
        }
    }
}

# $Row is deliberately untyped. Binding a List[object] to an [object[]] parameter — or
# wrapping one in @() — throws "Argument types do not match" in Windows PowerShell 5.1 and
# yields an empty array. Normalising inside keeps every caller safe from that.
function Write-ScanCsv {
    param(
        [Parameter(Mandatory)][AllowNull()]$Row,
        [Parameter(Mandatory)][string]$Path
    )
    $items = @($Row | Where-Object { $null -ne $_ })

    $parent = Split-Path $Path -Parent
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $items | Export-Csv -Path $Path -NoTypeInformation -Encoding UTF8
    Write-Host "Wrote $($items.Count) rows to $Path"
}

# Import-Csv in Windows PowerShell 5.1 does not honour the UTF-8 BOM that Export-Csv writes;
# it decodes with the ANSI code page, so a path like "Snimek obrazovky.png" comes back
# mangled and every candidate then resolves as already-gone. That failure is silent: the
# removal log reads "Missing" for every row, indistinguishable from a successful run.
function Read-ScanCsv {
    param([Parameter(Mandatory)][string]$Path)
    return @(Get-Content -LiteralPath $Path -Encoding UTF8 -Raw | ConvertFrom-Csv)
}
