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

# Treat unreadable paths as reparse points so the caller skips them.
function Test-ReparsePoint {
    param([Parameter(Mandatory)][string]$Path)
    try {
        $attributes = [System.IO.File]::GetAttributes($Path)
        return (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
    } catch {
        return $true
    }
}

# Enumerate child directories as plain path strings.
# Reading .Attributes on each child during enumeration throws UnauthorizedAccessException
# on locked junctions (for example "C:\Documents and Settings") and aborts the whole
# sibling loop, silently truncating the scan. Return strings here and let the caller
# check each item individually via Test-ReparsePoint.
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
# Iterative rather than recursive to survive deep trees; skips reparse points so
# linked trees are neither followed nor double-counted.
function Get-DirectoryStat {
    param(
        [Parameter(Mandatory)][string]$Path,
        [string[]]$ExcludePath = @()
    )
    $totalBytes = [long]0
    $totalFiles = 0
    $newestWrite = [datetime]::MinValue

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

        foreach ($childPath in Get-ChildDirectoryPath $current) {
            if (-not (Test-ReparsePoint $childPath)) { $pending.Push($childPath) }
        }
    }

    [pscustomobject]@{
        Path      = $Path
        Bytes     = $totalBytes
        GB        = [math]::Round($totalBytes / 1GB, 3)
        Files     = $totalFiles
        LastWrite = $newestWrite
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
