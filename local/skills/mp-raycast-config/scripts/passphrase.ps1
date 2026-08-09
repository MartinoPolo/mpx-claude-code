<#
.SYNOPSIS
    Store and retrieve the Raycast export passphrase as a DPAPI-protected local secret.

.DESCRIPTION
    The passphrase is encrypted with the Windows Data Protection API under the current
    user account, so only this user on this machine can read it back. It is written to
    %LOCALAPPDATA%, deliberately outside the mpx-claude-code repo, which is public.

.EXAMPLE
    powershell -File passphrase.ps1 -Action set -Passphrase 'the-passphrase'
    powershell -File passphrase.ps1 -Action get
    powershell -File passphrase.ps1 -Action status
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('get', 'set', 'status', 'clear')][string]$Action,
    [string]$Passphrase
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$secretDirectory = Join-Path $env:LOCALAPPDATA 'mp-raycast-config'
$secretPath = Join-Path $secretDirectory 'passphrase.dpapi'

switch ($Action) {
    'set' {
        if ([string]::IsNullOrWhiteSpace($Passphrase)) {
            throw 'Provide -Passphrase when using -Action set.'
        }
        if (-not (Test-Path $secretDirectory)) {
            New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
        }
        $plainBytes = [Text.Encoding]::UTF8.GetBytes($Passphrase)
        $protected = [Security.Cryptography.ProtectedData]::Protect($plainBytes, $null, 'CurrentUser')
        [IO.File]::WriteAllBytes($secretPath, $protected)
        Write-Output "stored $secretPath"
    }
    'get' {
        if (-not (Test-Path $secretPath)) {
            Write-Output 'MISSING'
            exit 2
        }
        $protected = [IO.File]::ReadAllBytes($secretPath)
        $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, 'CurrentUser')
        Write-Output ([Text.Encoding]::UTF8.GetString($plainBytes))
    }
    'status' {
        if (Test-Path $secretPath) { Write-Output "PRESENT $secretPath" } else { Write-Output 'MISSING' }
    }
    'clear' {
        if (Test-Path $secretPath) { Remove-Item $secretPath -Force }
        Write-Output 'cleared'
    }
}
