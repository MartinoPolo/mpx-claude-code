<#
.SYNOPSIS
Execute an approved removal group and report the real free-space delta.

.DESCRIPTION
Three destinations:
  RecycleBin - reversible, the default for anything that took judgment.
  Quarantine - move to <drive>:\_cleanup_quarantine\<date>\ preserving structure. Visual
               files go here so they stay browsable in Explorer instead of being flattened
               into the Recycle Bin. One root per drive keeps every move same-volume.
  Fast       - direct delete, for regenerable caches only. Recycle Bin is unusable at
               500k-file scale and pointless for data that rebuilds itself.

Always run with -DryRun first. Free space is measured before and after: logical candidate
size overstates the gain whenever hardlinks are involved.

-DryRun is an explicit switch rather than SupportsShouldProcess/-WhatIf on purpose:
-WhatIf sets $WhatIfPreference for the whole script scope, which leaks into module
auto-loading and buries the report under "What if: Set Alias" noise.

.EXAMPLE
powershell -NoProfile -File Invoke-Removal.ps1 -InputCsv "$env:TEMP\shots.csv" -Destination Quarantine -DryRun
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory, ParameterSetName = 'Csv')][string]$InputCsv,
    [Parameter(Mandatory, ParameterSetName = 'Paths')][string[]]$Path,
    [Parameter(Mandatory)][ValidateSet('RecycleBin', 'Quarantine', 'Fast')][string]$Destination,
    [string]$QuarantineDate = (Get-Date -Format 'yyyy-MM-dd'),
    [string]$LogCsv,
    [switch]$DryRun
)

. "$PSScriptRoot\_Common.ps1"
Set-StrictMode -Version Latest

Add-Type -AssemblyName Microsoft.VisualBasic

# The outer @() matters: an if-expression unrolls a single-element array on assignment,
# leaving a bare string that has no .Count.
$targetPath = @(if ($PSCmdlet.ParameterSetName -eq 'Csv') {
    Import-Csv -Path $InputCsv | Where-Object { $_.Status -eq 'Candidate' } | ForEach-Object { $_.Path }
} else {
    $Path
})

if ($targetPath.Count -eq 0) {
    Write-Host 'Nothing to remove.'
    return
}

$before = Get-FreeSpaceSnapshot
$log = New-Object System.Collections.Generic.List[object]

function Move-ToQuarantine {
    param([Parameter(Mandatory)][string]$Source)
    $qualifier = Split-Path $Source -Qualifier
    $relative = $Source.Substring($qualifier.Length).TrimStart('\')
    $destination = Join-Path (Join-Path "$qualifier\_cleanup_quarantine" $QuarantineDate) $relative
    $parent = Split-Path $destination -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Move-Item -LiteralPath $Source -Destination $destination -Force -ErrorAction Stop
    return $destination
}

foreach ($item in $targetPath) {
    if (-not (Test-Path -LiteralPath $item)) {
        $log.Add([pscustomobject]@{ Path = $item; Result = 'Missing'; Detail = 'already gone' })
        continue
    }

    $isDirectory = Test-Path -LiteralPath $item -PathType Container

    # A junction looks like a directory; deleting one recursively can take the target's
    # contents with it under PowerShell 5.1. Unlink it instead.
    if ($isDirectory -and (Test-ReparsePoint $item)) {
        if ($DryRun) {
            $log.Add([pscustomobject]@{ Path = $item; Result = 'WouldUnlink'; Detail = 'reparse point, target would be untouched' })
        } else {
            try {
                (Get-Item -LiteralPath $item -Force).Delete()
                $log.Add([pscustomobject]@{ Path = $item; Result = 'Unlinked'; Detail = 'reparse point removed, target untouched' })
            } catch {
                $log.Add([pscustomobject]@{ Path = $item; Result = 'Failed'; Detail = $_.Exception.Message })
            }
        }
        continue
    }

    if ($DryRun) {
        $sizeNote = if ($isDirectory) { 'directory' } else { "$([math]::Round((New-Object System.IO.FileInfo $item).Length / 1MB, 2)) MB" }
        $log.Add([pscustomobject]@{ Path = $item; Result = 'WouldRemove'; Detail = "$Destination :: $sizeNote" })
        continue
    }

    try {
        switch ($Destination) {
            'RecycleBin' {
                if ($isDirectory) {
                    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
                        $item,
                        [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
                        [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
                } else {
                    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
                        $item,
                        [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
                        [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
                }
                $log.Add([pscustomobject]@{ Path = $item; Result = 'Recycled'; Detail = 'restorable from Recycle Bin' })
            }
            'Quarantine' {
                $moved = Move-ToQuarantine -Source $item
                $log.Add([pscustomobject]@{ Path = $item; Result = 'Quarantined'; Detail = $moved })
            }
            'Fast' {
                Remove-Item -LiteralPath $item -Recurse -Force -ErrorAction Stop
                $log.Add([pscustomobject]@{ Path = $item; Result = 'Deleted'; Detail = 'regenerable cache, not recoverable' })
            }
        }
    } catch {
        # Exit code 5 / "being used by another process" means a live app holds the file.
        # Report it rather than counting the space as reclaimed.
        $log.Add([pscustomobject]@{ Path = $item; Result = 'Failed'; Detail = $_.Exception.Message })
    }
}

$after = Get-FreeSpaceSnapshot

Write-Host ''
if ($DryRun) { Write-Host 'DRY RUN - nothing was removed.' }
Write-Host 'Result by outcome:'
$log | Group-Object Result | ForEach-Object { Write-Host ("  {0,-12} {1}" -f $_.Name, $_.Count) }

Write-Host ''
Write-Host 'Measured free-space delta:'
foreach ($drive in $before) {
    $matching = $after | Where-Object Drive -eq $drive.Drive
    if ($matching) {
        $delta = [math]::Round($matching.FreeGB - $drive.FreeGB, 2)
        Write-Host ("  {0} {1,8} GB -> {2,8} GB  ({3:+0.00;-0.00;0} GB)" -f $drive.Drive, $drive.FreeGB, $matching.FreeGB, $delta)
    }
}

$failures = @($log | Where-Object Result -eq 'Failed')
if ($failures.Count -gt 0) {
    Write-Host ''
    Write-Host "$($failures.Count) items failed - most often a file locked by a running app:"
    $failures | Select-Object -First 10 | ForEach-Object { Write-Host "  $($_.Path) :: $($_.Detail)" }
}

if ($LogCsv) { Write-ScanCsv -Row $log.ToArray() -Path $LogCsv }
