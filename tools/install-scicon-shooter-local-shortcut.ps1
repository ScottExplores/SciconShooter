[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$launcher = Join-Path $PSScriptRoot 'start-scicon-shooter-local.ps1'
$desktop = [Environment]::GetFolderPath('Desktop')
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$stateRoot = Join-Path $env:LOCALAPPDATA 'Scicon Shooter Local'
$shortcutIcon = Join-Path $stateRoot 'SciconShooter.ico'
$desktopShortcut = Join-Path $desktop 'Scicon Shooter Local.lnk'

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Local launcher not found: $launcher"
}

New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

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
$shortcut = $shell.CreateShortcut($desktopShortcut)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" -OpenBrowser"
$shortcut.WorkingDirectory = $repositoryRoot
$shortcut.Description = 'Start the local Scicon Shooter development server and open the game.'
if (Test-Path -LiteralPath $shortcutIcon) {
  $shortcut.IconLocation = "$shortcutIcon,0"
}
$shortcut.Save()

[pscustomobject]@{
  DesktopShortcut = $desktopShortcut
  Launcher = $launcher
  GameUrl = 'http://127.0.0.1:5179/?display=mobile-frame'
}
