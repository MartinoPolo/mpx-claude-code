<#
.SYNOPSIS
Find empty directories and zero-byte files under the given roots.

.DESCRIPTION
Directories holding only empty subdirectories are reported as empty too.
Scaffolding for installed or active tooling is marked Keep rather than Candidate.

.EXAMPLE
powershell -NoProfile -File Find-EmptyItems.ps1 -Root "C:\Users\me" -OutCsv "$env:TEMP\empty.csv"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string[]]$Root,
    [string]$OutCsv,
    [string[]]$ExcludePath = @()
)

. "$PSScriptRoot\_Common.ps1"
Set-StrictMode -Version Latest

$ExcludePath = @($ExcludePath) + @(Get-QuarantineRoot)

# Empty directories that belong to a working install or a live repo. Reported, never proposed.
$keepPattern = @(
    '\\\.git($|\\)', '\\\.svn($|\\)', '\\node_modules\\', '\\AppData\\Local\\Microsoft\\',
    '\\Windows($|\\)', '\\Program Files', '\\ProgramData\\Microsoft\\', '\\\.vscode($|\\)'
)

function Test-KeepPath {
    param([Parameter(Mandatory)][string]$Path)
    foreach ($pattern in $keepPattern) {
        if ($Path -match $pattern) { return $true }
    }
    return $false
}

$results = New-Object System.Collections.Generic.List[object]

# Post-order walk: a directory is judged only after its children, so a tree of
# empty directories collapses upward into a single reportable root.
function Measure-Tree {
    param([Parameter(Mandatory)][string]$Path)

    if (Test-ExcludedPath -Path $Path -ExcludePath $ExcludePath) { return $true }

    $filePaths = Get-ChildFilePath $Path
    $hasContent = $false

    foreach ($filePath in $filePaths) {
        try {
            $info = New-Object System.IO.FileInfo $filePath
            if ($info.Length -eq 0) {
                $results.Add([pscustomobject]@{
                    Path      = $filePath
                    Type      = 'ZeroByteFile'
                    LastWrite = $info.LastWriteTime
                    Status    = if (Test-KeepPath $filePath) { 'Keep' } else { 'Candidate' }
                    Reason    = 'zero-byte file'
                })
            } else {
                $hasContent = $true
            }
        } catch { $hasContent = $true }
    }

    foreach ($childPath in Get-ChildDirectoryPath $Path) {
        if (Test-ReparsePoint $childPath) { $hasContent = $true; continue }
        $childIsEmpty = Measure-Tree -Path $childPath
        if (-not $childIsEmpty) { $hasContent = $true }
    }

    if (-not $hasContent) {
        $lastWrite = [datetime]::MinValue
        try { $lastWrite = (New-Object System.IO.DirectoryInfo $Path).LastWriteTime } catch { }
        $results.Add([pscustomobject]@{
            Path      = $Path
            Type      = 'EmptyDirectory'
            LastWrite = $lastWrite
            Status    = if (Test-KeepPath $Path) { 'Keep' } else { 'Candidate' }
            Reason    = if (Test-KeepPath $Path) { 'scaffolding for installed or active tooling' } else { 'contains no files at any depth' }
        })
    }

    return (-not $hasContent)
}

foreach ($rootPath in $Root) {
    if (-not $rootPath -or -not (Test-Path $rootPath)) {
        Write-Host "Skipping unavailable root: $rootPath"
        continue
    }
    Measure-Tree -Path (Get-NormalizedRoot $rootPath) | Out-Null
}

# Report only the topmost directory of each empty tree; nested ones go with it.
$emptyDirs = @($results | Where-Object Type -eq 'EmptyDirectory')
$nested = foreach ($dir in $emptyDirs) {
    foreach ($other in $emptyDirs) {
        if ($dir.Path -ne $other.Path -and $dir.Path.StartsWith($other.Path + '\')) { $dir.Path; break }
    }
}
$nestedSet = [System.Collections.Generic.HashSet[string]]::new([string[]]@($nested))

$rows = @($results | Where-Object { -not $nestedSet.Contains($_.Path) } | Sort-Object Type, Path)
Write-Host "Found $(@($rows | Where-Object Type -eq 'EmptyDirectory').Count) empty dirs, $(@($rows | Where-Object Type -eq 'ZeroByteFile').Count) zero-byte files"

if ($OutCsv) { Write-ScanCsv -Row $rows -Path $OutCsv } else { $rows }
