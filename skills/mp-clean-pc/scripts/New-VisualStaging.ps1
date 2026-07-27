<#
.SYNOPSIS
Gather scattered visual candidates into one folder as links and open it for review.

.DESCRIPTION
Hardlinks each candidate into a staging folder when it lives on the same volume: no copy,
no extra disk, and Explorer renders real thumbnails. Cross-volume candidates fall back to
.lnk shortcuts. Originals are never touched.
Run Remove-VisualStaging (or delete the folder) after the decision.

.EXAMPLE
powershell -NoProfile -File New-VisualStaging.ps1 -InputCsv "$env:TEMP\shots.csv" -StagingRoot "$env:TEMP\stage\screenshots" -Open
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory, ParameterSetName = 'Csv')][string]$InputCsv,
    [Parameter(Mandatory, ParameterSetName = 'Paths')][string[]]$Path,
    [Parameter(Mandatory)][string]$StagingRoot,
    [switch]$Open
)

. "$PSScriptRoot\_Common.ps1"
Set-StrictMode -Version Latest

# The outer @() matters: an if-expression unrolls a single-element array on assignment,
# leaving a bare string that has no .Count.
$candidatePath = @(if ($PSCmdlet.ParameterSetName -eq 'Csv') {
    Read-ScanCsv -Path $InputCsv |
        Where-Object { $_.Status -eq 'Candidate' } |
        ForEach-Object { $_.Path }
} else {
    $Path
})

if ($candidatePath.Count -eq 0) {
    Write-Host 'No candidates to stage.'
    return
}

if (Test-Path $StagingRoot) { Remove-Item -LiteralPath $StagingRoot -Recurse -Force }
New-Item -ItemType Directory -Path $StagingRoot -Force | Out-Null

$stagingVolume = (Split-Path (Resolve-Path $StagingRoot).Path -Qualifier)
$shell = $null
$linked = 0
$shortcut = 0
$failed = 0
$usedName = @{}

foreach ($sourcePath in $candidatePath) {
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { $failed++; continue }

    # Flatten into one folder, so collisions get a numeric suffix.
    $leaf = Split-Path $sourcePath -Leaf
    $linkName = $leaf
    $suffix = 1
    while ($usedName.ContainsKey($linkName)) {
        $linkName = '{0}_{1}{2}' -f [System.IO.Path]::GetFileNameWithoutExtension($leaf), $suffix, [System.IO.Path]::GetExtension($leaf)
        $suffix++
    }
    $usedName[$linkName] = $true
    $linkPath = Join-Path $StagingRoot $linkName

    $sourceVolume = Split-Path $sourcePath -Qualifier
    try {
        if ($sourceVolume -eq $stagingVolume) {
            New-Item -ItemType HardLink -Path $linkPath -Target $sourcePath -ErrorAction Stop | Out-Null
            $linked++
        } else {
            if (-not $shell) { $shell = New-Object -ComObject WScript.Shell }
            $link = $shell.CreateShortcut("$linkPath.lnk")
            $link.TargetPath = $sourcePath
            $link.Save()
            $shortcut++
        }
    } catch {
        $failed++
    }
}

# A manifest so the source path of any staged item stays recoverable.
$manifest = Join-Path $StagingRoot '_originals.txt'
$candidatePath | Set-Content -LiteralPath $manifest -Encoding UTF8

Write-Host "Staged $linked hardlinks, $shortcut shortcuts, $failed skipped in $StagingRoot"

if ($Open) {
    # $IsMacOS / $IsLinux are undefined in Windows PowerShell 5.1 and would throw under StrictMode.
    $platform = if (Test-Path Variable:\IsMacOS) { if ($IsMacOS) { 'mac' } elseif ($IsLinux) { 'linux' } else { 'windows' } } else { 'windows' }
    switch ($platform) {
        'mac'   { & open $StagingRoot }
        'linux' { & xdg-open $StagingRoot }
        default { & explorer.exe $StagingRoot }
    }
}
