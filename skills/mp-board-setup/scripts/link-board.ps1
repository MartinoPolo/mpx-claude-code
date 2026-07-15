#requires -Version 5
# Idempotent board setup: create the vault board file + skeleton, link it into the
# repo under .mpx (BOARD.md file symlink + board-files junction), and gitignore both.
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$Repo,
  [Parameter(Mandatory)] [string]$Vault,
  [Parameter(Mandatory)] [string]$Project
)

$ErrorActionPreference = 'Stop'

# Git must preserve real symlinks on Windows (default core.symlinks=false turns them into text files).
git config --global core.symlinks true

$boardsDir = Join-Path $Vault 'Boards'
$filesDir  = Join-Path $Vault 'Files'
$mpxDir    = Join-Path $Repo  '.mpx'
$board     = Join-Path $boardsDir "$Project.md"
$boardLink = Join-Path $mpxDir 'BOARD.md'
$filesLink = Join-Path $mpxDir 'board-files'

foreach ($d in @($boardsDir, $filesDir, $mpxDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}

# Board skeleton — a single `# To Process` intake section, written only when the board does
# not already exist (never clobber notes). Lifecycle lanes (# MANUAL TESTING, # ARCHIVE) are
# added later as items reach them, not seeded here.
if (-not (Test-Path $board)) {
@'
# To Process
'@ | Set-Content -Path $board -Encoding utf8
  Write-Host "created board: $board"
} else {
  Write-Host "board exists, left as-is: $board"
}

# Directory junction for images (no admin required).
if (-not (Test-Path $filesLink)) {
  New-Item -ItemType Junction -Path $filesLink -Target $filesDir | Out-Null
  Write-Host "junction: .mpx/board-files -> $filesDir"
} else {
  Write-Host "junction exists: .mpx/board-files"
}

# File symlink for the board text (needs Developer Mode or elevation).
if (-not (Test-Path $boardLink)) {
  try {
    New-Item -ItemType SymbolicLink -Path $boardLink -Target $board | Out-Null
    Write-Host "symlink: .mpx/BOARD.md -> $board"
  } catch {
    # No Developer Mode: retry the single mklink op in an elevated child process (UAC prompt).
    Write-Warning "Direct symlink failed ($($_.Exception.Message)); retrying elevated -- accept the UAC prompt..."
    $bl = $boardLink -replace "'", "''"
    $bd = $board     -replace "'", "''"
    $mk = "New-Item -ItemType SymbolicLink -Path '$bl' -Target '$bd' | Out-Null"
    try {
      Start-Process -FilePath powershell -Verb RunAs -Wait -WindowStyle Hidden `
        -ArgumentList '-NoProfile', '-NonInteractive', '-Command', $mk
    } catch {
      Write-Warning "Elevation was declined or failed: $($_.Exception.Message)"
    }
    if (Test-Path $boardLink) {
      Write-Host "symlink (elevated): .mpx/BOARD.md -> $board"
    } else {
      Write-Warning "Could not create .mpx/BOARD.md symlink. Enable Windows Developer Mode (Settings > Privacy & security > For developers) or run elevated, then re-run."
    }
  }
} else {
  Write-Host "symlink exists: .mpx/BOARD.md"
}

# Gitignore the two per-machine links.
$gitignore = Join-Path $Repo '.gitignore'
$entries   = @('.mpx/BOARD.md', '.mpx/board-files/')
$existing  = if (Test-Path $gitignore) { Get-Content $gitignore } else { @() }
$toAdd     = $entries | Where-Object { $existing -notcontains $_ }
if ($toAdd) {
  Add-Content -Path $gitignore -Value $toAdd
  Write-Host "gitignored: $($toAdd -join ', ')"
}

Write-Host ""
Write-Host "Links under .mpx:"
Get-ChildItem $mpxDir | Where-Object { $_.Name -in 'BOARD.md', 'board-files' } |
  Format-Table Name, LinkType, Target -AutoSize
