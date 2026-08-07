[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$launcher = Join-Path $PSScriptRoot 'open-scicon-player-analytics.ps1'
$desktop = [Environment]::GetFolderPath('Desktop')
$toolsFolder = Join-Path $desktop 'Scicon Shooter Tools'
$desktopShortcut = Join-Path $desktop 'Scicon Player Analytics.lnk'
$toolsShortcut = Join-Path $toolsFolder '10 - Player Analytics.lnk'
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$stateRoot = Join-Path $env:LOCALAPPDATA 'Scicon Player Analytics'
$shortcutIcon = Join-Path $stateRoot 'SciconPlayerAnalytics.ico'

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Player analytics launcher not found: $launcher"
}

New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
New-Item -ItemType Directory -Path $toolsFolder -Force | Out-Null

$sourceIcon = Join-Path $repositoryRoot 'public\icon.png'
if (Test-Path -LiteralPath $sourceIcon) {
  Add-Type -AssemblyName System.Drawing
  $sourceBitmap = New-Object System.Drawing.Bitmap($sourceIcon)
  $shortcutBitmap = New-Object System.Drawing.Bitmap(128, 128)
  $graphics = [System.Drawing.Graphics]::FromImage($shortcutBitmap)
  try {
    $graphics.DrawImage($sourceBitmap, 0, 0, 128, 128)
    $iconHandle = $shortcutBitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
    $stream = [System.IO.File]::Create($shortcutIcon)
    try {
      $icon.Save($stream)
    } finally {
      $stream.Dispose()
      $icon.Dispose()
    }
  } finally {
    $graphics.Dispose()
    $shortcutBitmap.Dispose()
    $sourceBitmap.Dispose()
  }
}

$shell = New-Object -ComObject WScript.Shell

function Install-PlayerAnalyticsShortcut {
  param([string]$Path)
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
  $shortcut.WorkingDirectory = $repositoryRoot
  $shortcut.Description = 'Open the private Scicon Shooter player activity dashboard.'
  if (Test-Path -LiteralPath $shortcutIcon) {
    $shortcut.IconLocation = "$shortcutIcon,0"
  }
  $shortcut.Save()
}

Install-PlayerAnalyticsShortcut -Path $desktopShortcut
Install-PlayerAnalyticsShortcut -Path $toolsShortcut

[pscustomobject]@{
  DesktopShortcut = $desktopShortcut
  ToolsShortcut = $toolsShortcut
  Launcher = $launcher
  SecretsStoredInShortcut = $false
}
