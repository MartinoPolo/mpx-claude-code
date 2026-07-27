<#
.SYNOPSIS
Inventory installed applications and rank them by real usage, measured from their data folder.

.DESCRIPTION
Reads both uninstall hives (64-bit and 32-bit, HKLM and HKCU) and pairs each app with its
AppData folder. Idle age comes from that folder's newest write time.
Registry UserAssist launch history is deliberately unused: it is too sparse to trust and
has reported obviously-active apps as never launched.

.EXAMPLE
powershell -NoProfile -File Get-InstalledApps.ps1 -IdleMonths 6 -OutCsv "$env:TEMP\apps.csv"
#>
[CmdletBinding()]
param(
    [int]$IdleMonths = 6,
    [string]$OutCsv
)

. "$PSScriptRoot\_Common.ps1"
Set-StrictMode -Version Latest

$idleCutoff = (Get-Date).AddMonths(-$IdleMonths)

$uninstallKey = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)

$apps = foreach ($keyPath in $uninstallKey) {
    Get-ItemProperty -Path $keyPath -ErrorAction SilentlyContinue | Where-Object {
        (Get-PropertyValue $_ 'DisplayName') -and -not (Get-PropertyValue $_ 'SystemComponent')
    }
}

# Vendor and filesystem words that identify nothing on their own. A match resting only on
# one of these is not evidence: %LOCALAPPDATA%\Microsoft is written to constantly and would
# otherwise mark every Microsoft-published app as active.
$genericToken = @(
    'microsoft', 'google', 'apple', 'adobe', 'oracle', 'intel', 'nvidia', 'jetbrains',
    'corp', 'inc', 'ltd', 'llc', 'gmbh', 'software', 'systems', 'technologies',
    'app', 'apps', 'data', 'local', 'locallow', 'roaming', 'programs', 'packages',
    'temp', 'cache', 'common', 'files', 'windows', 'edition', 'version', 'update',
    'installer', 'setup', 'x64', 'x86', 'bit'
)

# Lowercase alphanumeric tokens, split on separators, camelCase boundaries and
# letter-to-digit boundaries, so "JellyfinMediaPlayer", "Jellyfin Media Player" and
# "jellyfin-media-player" all tokenise identically.
function Get-NameToken {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Name)
    $spaced = [regex]::Replace($Name, '(?<=[a-z0-9])(?=[A-Z])', ' ')
    $spaced = [regex]::Replace($spaced, '(?<=[A-Za-z])(?=[0-9])', ' ')
    return @($spaced -split '[^A-Za-z0-9]+' | Where-Object { $_ } | ForEach-Object { $_.ToLowerInvariant() })
}

# Newest write time of a folder or any of its immediate children.
function Get-FolderActivityTime {
    param([Parameter(Mandatory)][string]$Path)
    try {
        $newest = (New-Object System.IO.DirectoryInfo $Path).LastWriteTime
    } catch {
        return $null
    }
    foreach ($childPath in Get-ChildDirectoryPath $Path) {
        try {
            $childTime = (New-Object System.IO.DirectoryInfo $childPath).LastWriteTime
            if ($childTime -gt $newest) { $newest = $childTime }
        } catch { }
    }
    return $newest
}

# Every plausible data folder, indexed once with its tokens and activity time. Built ahead
# of the app loop because rebuilding it per app makes the scan quadratic. Two levels deep
# because vendors nest their products: %LOCALAPPDATA%\Google\Chrome.
function Get-DataFolderIndex {
    $index = New-Object System.Collections.Generic.List[object]
    foreach ($root in @($env:APPDATA, $env:LOCALAPPDATA)) {
        if (-not $root -or -not (Test-Path $root)) { continue }
        foreach ($vendorPath in Get-ChildDirectoryPath $root) {
            $vendorToken = @(Get-NameToken (Split-Path $vendorPath -Leaf))
            $vendorActivity = Get-FolderActivityTime $vendorPath
            if ($null -ne $vendorActivity) {
                $index.Add([pscustomobject]@{ Path = $vendorPath; Token = $vendorToken; LastActivity = $vendorActivity })
            }
            foreach ($productPath in Get-ChildDirectoryPath $vendorPath) {
                $productActivity = Get-FolderActivityTime $productPath
                if ($null -eq $productActivity) { continue }
                $index.Add([pscustomobject]@{
                    Path         = $productPath
                    Token        = @($vendorToken + @(Get-NameToken (Split-Path $productPath -Leaf)) | Select-Object -Unique)
                    LastActivity = $productActivity
                })
            }
        }
    }
    return $index
}

# Match by token containment, not by a single leading word. First-word substring matching
# filed "Auto Dark Mode" under Autodesk, "Fast Node Manager" under FastStone and "VLC media
# player" under JellyfinMediaPlayer, reporting ten actively-used apps as idle. One folder
# can plausibly match several apps; the most specific match wins, newest activity breaks ties.
function Get-DataFolderActivity {
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$DisplayName,
        [AllowEmptyString()][string]$InstallLocation,
        [Parameter(Mandatory)][AllowNull()]$FolderIndex
    )
    $appToken = @(Get-NameToken $DisplayName)
    if ($InstallLocation) {
        $installLeaf = Split-Path $InstallLocation.TrimEnd('\') -Leaf
        $appToken = @($appToken + @(Get-NameToken $installLeaf) | Select-Object -Unique)
    }
    if ($appToken.Count -eq 0) { return $null }

    $best = $null
    foreach ($folder in $FolderIndex) {
        $shared = @($folder.Token | Where-Object { $appToken -contains $_ })
        if ($shared.Count -eq 0) { continue }

        # One name must be wholly inside the other. Partial overlap is what produced the
        # Autodesk and FastStone misfiles.
        if ($shared.Count -ne $folder.Token.Count -and $shared.Count -ne $appToken.Count) { continue }

        $identifying = @($shared | Where-Object { $_.Length -ge 3 -and $genericToken -notcontains $_ })
        if ($identifying.Count -eq 0) { continue }

        $isBetter = ($null -eq $best) -or
                    ($identifying.Count -gt $best.Specificity) -or
                    ($identifying.Count -eq $best.Specificity -and $folder.LastActivity -gt $best.LastActivity)
        if ($isBetter) {
            $best = [pscustomobject]@{
                LastActivity = $folder.LastActivity
                DataFolder   = $folder.Path
                MatchedOn    = ($identifying -join '+')
                Specificity  = $identifying.Count
            }
        }
    }
    return $best
}

$folderIndex = Get-DataFolderIndex
Write-Host "Indexed $($folderIndex.Count) app data folders"

$rows = foreach ($app in $apps) {
    $displayName = Get-PropertyValue $app 'DisplayName' ''
    $installLocation = Get-PropertyValue $app 'InstallLocation' ''
    $activity = Get-DataFolderActivity -DisplayName $displayName -InstallLocation $installLocation -FolderIndex $folderIndex
    $lastActivity = if ($activity) { $activity.LastActivity } else { $null }
    $isIdle = ($null -ne $lastActivity -and $lastActivity -lt $idleCutoff)

    $estimatedSize = Get-PropertyValue $app 'EstimatedSize'
    $sizeMB = if ($estimatedSize) { [math]::Round($estimatedSize / 1KB, 1) } else { $null }

    [pscustomobject]@{
        DisplayName      = $displayName
        Publisher        = Get-PropertyValue $app 'Publisher' ''
        Version          = Get-PropertyValue $app 'DisplayVersion' ''
        InstallLocation  = $installLocation
        EstimatedMB      = $sizeMB
        DataFolder       = if ($activity) { $activity.DataFolder } else { '' }
        MatchedOn        = if ($activity) { $activity.MatchedOn } else { '' }
        LastActivity     = $lastActivity
        UninstallString  = Get-PropertyValue $app 'UninstallString' ''
        QuietUninstall   = Get-PropertyValue $app 'QuietUninstallString' ''
        Status           = if ($null -eq $lastActivity) { 'NoUsageSignal' } elseif ($isIdle) { 'Idle' } else { 'Active' }
        Reason           = if ($null -eq $lastActivity) { 'no matching data folder - judge manually' }
                           elseif ($isIdle) { "data folder untouched since $($lastActivity.ToString('yyyy-MM-dd'))" }
                           else { "data folder touched $($lastActivity.ToString('yyyy-MM-dd'))" }
    }
}

$result = @($rows | Sort-Object Status, LastActivity)
Write-Host "Inventoried $($result.Count) apps; $(@($result | Where-Object Status -eq 'Idle').Count) idle past $IdleMonths months"
Write-Host "Check MatchedOn before trusting any Idle verdict - a wrong data-folder match is what makes an active app look idle."

if ($OutCsv) { Write-ScanCsv -Row $result -Path $OutCsv } else { $result }
