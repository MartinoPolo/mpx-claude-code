<#
.SYNOPSIS
Find duplicate files and cloud-sync conflict copies. Hashing happens locally; only digests leave the machine.

.DESCRIPTION
Two stages: group by exact byte length first, then hash only the files that share a length.
That keeps a full-disk duplicate hunt from reading every byte on the volume.
The oldest copy in each group is marked Original; the rest are Duplicate.

.EXAMPLE
powershell -NoProfile -File Find-Duplicates.ps1 -Root "D:\" -MinMB 5 -OutCsv "$env:TEMP\dupes.csv"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string[]]$Root,
    [double]$MinMB = 1,
    [string]$OutCsv,
    [string[]]$ExcludePath = @()
)

. "$PSScriptRoot\_Common.ps1"
Set-StrictMode -Version Latest

$ExcludePath = @($ExcludePath) + @(Get-QuarantineRoot)
$minBytes = [long]($MinMB * 1MB)

# OneDrive/Dropbox conflict copies and Explorer's copy-paste suffixes.
$conflictPattern = @(
    '\s\([A-Za-z0-9_-]+\)\.[^.]+$',   # "notes (Yoga9iron).md" - device-tagged conflict copy
    '\s\(\d+\)\.[^.]+$',              # "report (1).pdf"
    '-\s*Copy(\s\(\d+\))?\.[^.]+$',   # "report - Copy.pdf"
    '\bconflicted\scopy\b',           # Dropbox
    '\.sync-conflict-'                # Syncthing
)

function Test-ConflictName {
    param([Parameter(Mandatory)][string]$Name)
    foreach ($pattern in $conflictPattern) {
        if ($Name -match $pattern) { return $true }
    }
    return $false
}

$allFiles = New-Object System.Collections.Generic.List[object]
$unscannedPlaceholder = New-Object System.Collections.Generic.List[string]

foreach ($rootPath in $Root) {
    if (-not $rootPath -or -not (Test-Path $rootPath)) {
        Write-Host "Skipping unavailable root: $rootPath"
        continue
    }

    $pending = [System.Collections.Generic.Stack[string]]::new()
    $pending.Push((Get-NormalizedRoot $rootPath))

    while ($pending.Count -gt 0) {
        $current = $pending.Pop()
        if (Test-ExcludedPath -Path $current -ExcludePath $ExcludePath) { continue }

        foreach ($filePath in Get-ChildFilePath $current) {
            try {
                $info = New-Object System.IO.FileInfo $filePath
                if ($info.Length -ge $minBytes) {
                    $allFiles.Add([pscustomobject]@{
                        Path       = $filePath
                        Name       = $info.Name
                        Bytes      = $info.Length
                        LastWrite  = $info.LastWriteTime
                        IsConflict = (Test-ConflictName -Name $info.Name)
                    })
                }
            } catch { }
        }

        foreach ($childPath in Get-TraversableChildDirectory -Path $current -UnscannedPlaceholderPath ([ref]$unscannedPlaceholder)) {
            $pending.Push($childPath)
        }
    }
}

Write-Host "Stage 1: $($allFiles.Count) files at or above $MinMB MB"
Write-UnscannedPlaceholderWarning $unscannedPlaceholder

# Stage 2: hash only within same-length groups.
$sizeGroups = @($allFiles | Group-Object Bytes | Where-Object Count -gt 1)
$toHash = @($sizeGroups | ForEach-Object { $_.Group })
Write-Host "Stage 2: hashing $($toHash.Count) files sharing a length"

$hashed = New-Object System.Collections.Generic.List[object]
foreach ($candidate in $toHash) {
    try {
        $digest = (Get-FileHash -LiteralPath $candidate.Path -Algorithm SHA256 -ErrorAction Stop).Hash
        $hashed.Add([pscustomobject]@{
            Path       = $candidate.Path
            Name       = $candidate.Name
            Bytes      = $candidate.Bytes
            LastWrite  = $candidate.LastWrite
            IsConflict = $candidate.IsConflict
            Hash       = $digest
        })
    } catch { }
}

$rows = New-Object System.Collections.Generic.List[object]
foreach ($group in ($hashed | Group-Object Hash | Where-Object Count -gt 1)) {
    # Keep the oldest copy: it is the one other files and links most likely point at.
    $ordered = @($group.Group | Sort-Object LastWrite)
    $original = $ordered[0]
    foreach ($item in $ordered) {
        $isOriginal = ($item.Path -eq $original.Path)
        $rows.Add([pscustomobject]@{
            Path       = $item.Path
            GB         = [math]::Round($item.Bytes / 1GB, 4)
            MB         = [math]::Round($item.Bytes / 1MB, 2)
            LastWrite  = $item.LastWrite
            Hash       = $item.Hash.Substring(0, 12)
            GroupSize  = $group.Count
            KeptCopy   = $original.Path
            Status     = if ($isOriginal) { 'Original' } else { 'Duplicate' }
            Reason     = if ($isOriginal) { 'oldest copy in group' }
                         elseif ($item.IsConflict) { 'sync conflict copy, identical content' }
                         else { 'identical content to kept copy' }
        })
    }
}

# Conflict-named files that never matched a hash group still deserve a look.
$duplicatePaths = [System.Collections.Generic.HashSet[string]]::new()
foreach ($recorded in $rows.ToArray()) { $duplicatePaths.Add($recorded.Path) | Out-Null }
foreach ($orphan in @($allFiles | Where-Object IsConflict)) {
    if ($duplicatePaths.Contains($orphan.Path)) { continue }
    $rows.Add([pscustomobject]@{
        Path      = $orphan.Path
        GB        = [math]::Round($orphan.Bytes / 1GB, 4)
        MB        = [math]::Round($orphan.Bytes / 1MB, 2)
        LastWrite = $orphan.LastWrite
        Hash      = ''
        GroupSize = 1
        KeptCopy  = ''
        Status    = 'ConflictNameOnly'
        Reason    = 'sync conflict name but content differs - review before removing'
    })
}

$result = @($rows | Sort-Object MB -Descending)
Write-Host "Found $(@($result | Where-Object Status -eq 'Duplicate').Count) duplicates, $(@($result | Where-Object Status -eq 'ConflictNameOnly').Count) diverged conflict copies"

if ($OutCsv) { Write-ScanCsv -Row $result -Path $OutCsv } else { $result }
