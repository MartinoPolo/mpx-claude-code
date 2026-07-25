<#
.SYNOPSIS
Find screenshots by filename pattern and location, aged past a cutoff, honouring curated-folder protection.

.DESCRIPTION
Camera-origin images and anything inside a memories/keep/favourites/album folder are
reported as Protected. Everything else older than -OlderThanMonths is a Candidate.

.EXAMPLE
powershell -NoProfile -File Find-Screenshots.ps1 -Root "C:\Users\me" -OlderThanMonths 3 -OutCsv "$env:TEMP\shots.csv"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string[]]$Root,
    [int]$OlderThanMonths = 3,
    [string]$OutCsv,
    [string[]]$ExcludePath = @()
)

. "$PSScriptRoot\_Common.ps1"
Set-StrictMode -Version Latest

$ExcludePath = @($ExcludePath) + @(Get-QuarantineRoot)
$ageCutoff = (Get-Date).AddMonths(-$OlderThanMonths)

$imageExtension = @('.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp')

# Naming conventions of the common capture tools.
$screenshotNamePattern = @(
    '^Screenshot[ _-]',           # Windows, Android, macOS
    '^Screen Shot ',              # older macOS
    '^Snipaste_',
    '^ShareX_',
    '^Greenshot_',
    '^Lightshot',
    '^screenshot[-_]?\d',
    '^Capture[ _-]?\d',
    '^image_?\d{8}',
    '^Clipboard[ _-]?\d'
)

# Folders that are screenshot sinks by definition.
$screenshotFolderPattern = @(
    '\\Screenshots?($|\\)', '\\ShareX\\Screenshots', '\\Greenshot($|\\)',
    '\\Snipaste($|\\)', '\\userdata\\.*\\760\\remote'   # Steam screenshots
)

# Curated folders win over every other signal.
$protectedFolderPattern = @(
    '\\memories?($|\\)', '\\keep($|\\)', '\\favou?rites?($|\\)',
    '\\albums?($|\\)', '\\Camera Roll($|\\)', '\\DCIM($|\\)', '\\Pictures\\\d{4}($|\\)'
)

# Camera-origin filenames. These are photos, and photos are out of scope.
$cameraNamePattern = @('^IMG[ _-]', '^DSC[ _-]?\d', '^VID[ _-]', '^MOV[ _-]', '^PXL_\d{8}', '^\d{8}_\d{6}\.')

function Test-AnyPattern {
    param([Parameter(Mandatory)][string]$Value, [Parameter(Mandatory)][string[]]$Pattern)
    foreach ($item in $Pattern) {
        if ($Value -match $item) { return $true }
    }
    return $false
}

$rows = New-Object System.Collections.Generic.List[object]

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

        $inScreenshotFolder = Test-AnyPattern -Value $current -Pattern $screenshotFolderPattern
        $inProtectedFolder = Test-AnyPattern -Value $current -Pattern $protectedFolderPattern

        foreach ($filePath in Get-ChildFilePath $current) {
            try {
                $info = New-Object System.IO.FileInfo $filePath
                if ($imageExtension -notcontains $info.Extension.ToLower()) { continue }

                $looksLikeScreenshot = $inScreenshotFolder -or (Test-AnyPattern -Value $info.Name -Pattern $screenshotNamePattern)
                if (-not $looksLikeScreenshot) { continue }

                $isCamera = Test-AnyPattern -Value $info.Name -Pattern $cameraNamePattern
                $status = 'Candidate'
                $reason = "screenshot older than $OlderThanMonths months"

                if ($inProtectedFolder) {
                    $status = 'Protected'; $reason = 'inside a curated photo or memories folder'
                } elseif ($isCamera) {
                    $status = 'Protected'; $reason = 'camera-origin filename, treated as a photo'
                } elseif ($info.LastWriteTime -gt $ageCutoff) {
                    $status = 'Protected'; $reason = "captured within the last $OlderThanMonths months"
                }

                $rows.Add([pscustomobject]@{
                    Path      = $filePath
                    Folder    = $current
                    MB        = [math]::Round($info.Length / 1MB, 2)
                    LastWrite = $info.LastWriteTime
                    Status    = $status
                    Reason    = $reason
                })
            } catch { }
        }

        foreach ($childPath in Get-ChildDirectoryPath $current) {
            if (-not (Test-ReparsePoint $childPath)) { $pending.Push($childPath) }
        }
    }
}

$result = @($rows | Sort-Object Folder, LastWrite)
$candidates = @($result | Where-Object Status -eq 'Candidate')
Write-Host "Found $($candidates.Count) screenshot candidates ($([math]::Round((($candidates | Measure-Object MB -Sum).Sum) / 1024, 2)) GB), $(@($result | Where-Object Status -eq 'Protected').Count) protected"

if ($OutCsv) { Write-ScanCsv -Row $result -Path $OutCsv } else { $result }
