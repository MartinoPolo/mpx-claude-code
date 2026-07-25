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

# Newest write time anywhere one level under an app data folder, used as the usage proxy.
function Get-DataFolderActivity {
    param([Parameter(Mandatory)][string]$DisplayName)

    $searchRoot = @(
        (Join-Path $env:APPDATA ''),
        (Join-Path $env:LOCALAPPDATA '')
    )
    # Match on the first significant word so "Visual Studio Code" finds "Code".
    $token = ($DisplayName -split '[\s\-_]' | Where-Object { $_.Length -ge 4 } | Select-Object -First 1)
    if (-not $token) { return $null }

    $newest = $null
    $matchedFolder = $null
    foreach ($root in $searchRoot) {
        if (-not (Test-Path $root)) { continue }
        foreach ($folderPath in Get-ChildDirectoryPath $root) {
            $folderName = Split-Path $folderPath -Leaf
            if ($folderName -notlike "*$token*") { continue }
            try {
                $info = New-Object System.IO.DirectoryInfo $folderPath
                $folderNewest = $info.LastWriteTime
                foreach ($childPath in Get-ChildDirectoryPath $folderPath) {
                    try {
                        $childInfo = New-Object System.IO.DirectoryInfo $childPath
                        if ($childInfo.LastWriteTime -gt $folderNewest) { $folderNewest = $childInfo.LastWriteTime }
                    } catch { }
                }
                if ($null -eq $newest -or $folderNewest -gt $newest) {
                    $newest = $folderNewest
                    $matchedFolder = $folderPath
                }
            } catch { }
        }
    }
    if ($null -eq $newest) { return $null }
    [pscustomobject]@{ LastActivity = $newest; DataFolder = $matchedFolder }
}

$rows = foreach ($app in $apps) {
    $displayName = Get-PropertyValue $app 'DisplayName' ''
    $activity = Get-DataFolderActivity -DisplayName $displayName
    $lastActivity = if ($activity) { $activity.LastActivity } else { $null }
    $isIdle = ($null -ne $lastActivity -and $lastActivity -lt $idleCutoff)

    $estimatedSize = Get-PropertyValue $app 'EstimatedSize'
    $sizeMB = if ($estimatedSize) { [math]::Round($estimatedSize / 1KB, 1) } else { $null }

    [pscustomobject]@{
        DisplayName      = $displayName
        Publisher        = Get-PropertyValue $app 'Publisher' ''
        Version          = Get-PropertyValue $app 'DisplayVersion' ''
        InstallLocation  = Get-PropertyValue $app 'InstallLocation' ''
        EstimatedMB      = $sizeMB
        DataFolder       = if ($activity) { $activity.DataFolder } else { '' }
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

if ($OutCsv) { Write-ScanCsv -Row $result -Path $OutCsv } else { $result }
