[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$launcher = Join-Path $PSScriptRoot 'start-scicon-director.ps1'
$desktop = [Environment]::GetFolderPath('Desktop')
$startup = [Environment]::GetFolderPath('Startup')
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$stateRoot = Join-Path $env:LOCALAPPDATA 'Scicon Director'
$shortcutIcon = Join-Path $stateRoot 'SciconDirector.ico'

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Director launcher not found: $launcher"
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

function Install-DirectorShortcut {
  param(
    [string]$Path,
    [string]$ExtraArguments,
    [string]$Description
  )

  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" $ExtraArguments".Trim()
  $shortcut.WorkingDirectory = $repositoryRoot
  $shortcut.Description = $Description
  if (Test-Path -LiteralPath $shortcutIcon) {
    $shortcut.IconLocation = "$shortcutIcon,0"
  }
  $shortcut.Save()
}

$desktopShortcut = Join-Path $desktop 'Scicon Director.lnk'
$startupShortcut = Join-Path $startup 'Scicon Director Auto Start.lnk'

Install-DirectorShortcut `
  -Path $desktopShortcut `
  -ExtraArguments '-OpenBrowser' `
  -Description 'Start the local Scicon Director and open it in your browser.'

Install-DirectorShortcut `
  -Path $startupShortcut `
  -ExtraArguments '' `
  -Description 'Start the local Scicon Director after Windows sign-in.'

[pscustomobject]@{
  DesktopShortcut = $desktopShortcut
  StartupShortcut = $startupShortcut
  StartsAfterSignIn = $true
  OpensBrowserAtSignIn = $false
}
