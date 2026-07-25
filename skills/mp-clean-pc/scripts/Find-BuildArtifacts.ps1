<#
.SYNOPSIS
Find build output directories under project roots and classify each project as active or inactive by git history.

.DESCRIPTION
Active project = HEAD commit within -ActiveMonths. Active projects report their artifacts
as Protected so only regenerable caches get touched there.
Descent stops at the first match so nested node_modules are never double-counted.

.EXAMPLE
powershell -NoProfile -File Find-BuildArtifacts.ps1 -Root $env:MPX_PROJECTS -OutCsv "$env:TEMP\build.csv"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string[]]$Root,
    [int]$ActiveMonths = 3,
    [string]$OutCsv,
    [string[]]$ExcludePath = @()
)

. "$PSScriptRoot\_Common.ps1"
Set-StrictMode -Version Latest

$ExcludePath = @($ExcludePath) + @(Get-QuarantineRoot)
$activeCutoff = (Get-Date).AddMonths(-$ActiveMonths)

$artifactName = @(
    'node_modules', 'target', 'dist', 'build', 'out',
    '.next', '.svelte-kit', '.nuxt', '.turbo', '.parcel-cache', '.output',
    'coverage', '__pycache__', '.pytest_cache', '.mypy_cache', '.venv', 'venv'
)

# Newest commit date for the repo owning $Path, or $null when it is not a git work tree.
function Get-RepoLastCommit {
    param([Parameter(Mandatory)][string]$Path)
    try {
        $iso = & git -C $Path log -1 --format=%cI 2>$null
        if ($LASTEXITCODE -eq 0 -and $iso) { return [datetime]::Parse($iso) }
    } catch { }
    return $null
}

function Get-RepoRoot {
    param([Parameter(Mandatory)][string]$Path)
    try {
        $root = & git -C $Path rev-parse --show-toplevel 2>$null
        if ($LASTEXITCODE -eq 0 -and $root) { return $root.Replace('/', '\') }
    } catch { }
    return $null
}

$repoLastCommitCache = @{}
$repoRootCache = @{}
$found = New-Object System.Collections.Generic.List[object]

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

        $leafName = Split-Path $current -Leaf
        if ($artifactName -contains $leafName) {
            $owningRepo = $repoRootCache[$current]
            if (-not $owningRepo) {
                $owningRepo = Get-RepoRoot -Path (Split-Path $current -Parent)
                $repoRootCache[$current] = $owningRepo
            }

            $lastCommit = $null
            if ($owningRepo) {
                if (-not $repoLastCommitCache.ContainsKey($owningRepo)) {
                    $repoLastCommitCache[$owningRepo] = Get-RepoLastCommit -Path $owningRepo
                }
                $lastCommit = $repoLastCommitCache[$owningRepo]
            }

            $isActive = ($null -ne $lastCommit -and $lastCommit -gt $activeCutoff)
            $stat = Get-DirectoryStat -Path $current -ExcludePath $ExcludePath

            $found.Add([pscustomobject]@{
                Path        = $current
                Kind        = $leafName
                GB          = $stat.GB
                Files       = $stat.Files
                ProjectRoot = $owningRepo
                LastCommit  = $lastCommit
                LastWrite   = $stat.LastWrite
                Status      = if ($isActive) { 'Protected' } elseif ($null -eq $lastCommit) { 'NoGitHistory' } else { 'Candidate' }
                Reason      = if ($isActive) { "repo committed within $ActiveMonths months" }
                              elseif ($null -eq $lastCommit) { 'not a git work tree - confirm before removing' }
                              else { "repo idle since $($lastCommit.ToString('yyyy-MM-dd'))" }
            })
            # Stop descending: nested artifact dirs are already inside this total.
            continue
        }

        foreach ($childPath in Get-ChildDirectoryPath $current) {
            if (-not (Test-ReparsePoint $childPath)) { $pending.Push($childPath) }
        }
    }
}

$rows = @($found | Sort-Object GB -Descending)
Write-Host "Found $($rows.Count) artifact dirs; $(@($rows | Where-Object Status -eq 'Candidate').Count) in idle projects"
Write-Host "Logical size overstates the real gain when pnpm hardlinks are involved - confirm via free-space delta."

if ($OutCsv) { Write-ScanCsv -Row $rows -Path $OutCsv } else { $rows }
