<#
.SYNOPSIS
Depth-limited folder size map for one or more roots. Fallback when WizTree/TreeSize/du are absent.

.EXAMPLE
powershell -NoProfile -File Scan-FolderMap.ps1 -Root "C:\" -Depth 3 -MinGB 0.5 -OutCsv "$env:TEMP\map-c.csv"
#>
[CmdletBinding()]
param(
    [string[]]$Root,
    [int]$Depth = 3,
    [double]$MinGB = 0.5,
    [string]$OutCsv,
    [string[]]$ExcludePath = @()
)

. "$PSScriptRoot\_Common.ps1"
Set-StrictMode -Version Latest

if (-not $Root) { $Root = @(Get-LocalFixedDriveRoot) }
$ExcludePath = @($ExcludePath) + @(Get-QuarantineRoot)

# One pass over the tree. Every file's size is credited to each of its ancestors that
# sits at or above $Depth, so no subtree is walked more than once.
function Get-FolderMap {
    param(
        [Parameter(Mandatory)][string]$RootPath,
        [int]$MaxDepth,
        [string[]]$Excluded
    )
    $normalizedRoot = Get-NormalizedRoot $RootPath
    $bytesByPath = @{}
    $lastWriteByPath = @{}
    $deniedCount = 0

    $pending = [System.Collections.Generic.Stack[object]]::new()
    $pending.Push([pscustomobject]@{ Path = $normalizedRoot; Ancestors = @($normalizedRoot); Level = 0 })

    while ($pending.Count -gt 0) {
        $node = $pending.Pop()
        if (Test-ExcludedPath -Path $node.Path -ExcludePath $Excluded) { continue }

        # @() is required: PowerShell unrolls a single-element return into a bare
        # string, which has no .Count.
        $files = @(Get-ChildFilePath $node.Path)
        if ($files.Count -eq 0) {
            try { [System.IO.Directory]::EnumerateDirectories($node.Path) | Out-Null }
            catch { $deniedCount++ }
        }

        foreach ($filePath in $files) {
            try {
                $info = New-Object System.IO.FileInfo $filePath
                foreach ($ancestor in $node.Ancestors) {
                    if (-not $bytesByPath.ContainsKey($ancestor)) {
                        $bytesByPath[$ancestor] = [long]0
                        $lastWriteByPath[$ancestor] = [datetime]::MinValue
                    }
                    $bytesByPath[$ancestor] += $info.Length
                    if ($info.LastWriteTime -gt $lastWriteByPath[$ancestor]) {
                        $lastWriteByPath[$ancestor] = $info.LastWriteTime
                    }
                }
            } catch { }
        }

        foreach ($childPath in Get-ChildDirectoryPath $node.Path) {
            if (Test-ReparsePoint $childPath) { continue }
            $childLevel = $node.Level + 1
            $childAncestors = if ($childLevel -le $MaxDepth) { @($node.Ancestors) + $childPath } else { $node.Ancestors }
            $pending.Push([pscustomobject]@{ Path = $childPath; Ancestors = $childAncestors; Level = $childLevel })
        }
    }

    Write-Host "$normalizedRoot : $($bytesByPath.Count) folders mapped, $deniedCount unreadable"

    foreach ($path in $bytesByPath.Keys) {
        [pscustomobject]@{
            Path      = $path
            GB        = [math]::Round($bytesByPath[$path] / 1GB, 3)
            Depth     = ($path.TrimEnd('\').Split('\').Count - 1)
            LastWrite = $lastWriteByPath[$path]
        }
    }
}

$rows = foreach ($rootPath in $Root) {
    Get-FolderMap -RootPath $rootPath -MaxDepth $Depth -Excluded $ExcludePath
}

$rows = @($rows | Where-Object { $_.GB -ge $MinGB } | Sort-Object GB -Descending)

if ($OutCsv) { Write-ScanCsv -Row $rows -Path $OutCsv } else { $rows }
