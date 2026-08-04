[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$directorLauncher = Join-Path $PSScriptRoot 'start-scicon-director.ps1'
$controlCenterLauncher = Join-Path $PSScriptRoot 'start-scicon-control-center.ps1'
$gameLauncher = Join-Path $PSScriptRoot 'start-scicon-shooter-local.ps1'
$galleryLauncher = Join-Path $PSScriptRoot 'open-scicon-sprite-gallery.vbs'
$desktop = [Environment]::GetFolderPath('Desktop')
$startup = [Environment]::GetFolderPath('Startup')
$toolsFolder = Join-Path $desktop 'Scicon Shooter Tools'
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$explorer = (Get-Command explorer.exe -ErrorAction Stop).Source
$wscript = (Get-Command wscript.exe -ErrorAction Stop).Source
$stateRoot = Join-Path $env:LOCALAPPDATA 'Scicon Director'
$shortcutIcon = Join-Path $stateRoot 'SciconDirector.ico'
$localGameUrl = 'http://127.0.0.1:5179/?display=mobile-frame'
$liveGameUrl = 'https://sciconshooter.xyz/'

foreach ($requiredLauncher in @($directorLauncher, $controlCenterLauncher, $gameLauncher)) {
  if (-not (Test-Path -LiteralPath $requiredLauncher)) {
    throw "Launcher not found: $requiredLauncher"
  }
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

function Set-SciconShortcutIcon {
  param($Shortcut)
  if (Test-Path -LiteralPath $shortcutIcon) {
    $Shortcut.IconLocation = "$shortcutIcon,0"
  }
}

function Install-PowerShellShortcut {
  param(
    [string]$Path,
    [string]$ScriptPath,
    [string]$ExtraArguments,
    [string]$Description
  )

  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`" $ExtraArguments".Trim()
  $shortcut.WorkingDirectory = $repositoryRoot
  $shortcut.Description = $Description
  Set-SciconShortcutIcon -Shortcut $shortcut
  $shortcut.Save()
}

function Install-DirectorShortcut {
  param(
    [string]$Path,
    [string]$Page,
    [string]$Description
  )

  $pageArguments = if ($Page -eq 'hub') {
    '-OpenBrowser -Page hub'
  } else {
    "-OpenBrowser -Page $Page"
  }
  Install-PowerShellShortcut `
    -Path $Path `
    -ScriptPath $directorLauncher `
    -ExtraArguments $pageArguments `
    -Description $Description
}

function Install-TargetShortcut {
  param(
    [string]$Path,
    [string]$TargetPath,
    [string]$Arguments,
    [string]$Description
  )

  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $TargetPath
  $shortcut.Arguments = $Arguments
  $shortcut.WorkingDirectory = $repositoryRoot
  $shortcut.Description = $Description
  Set-SciconShortcutIcon -Shortcut $shortcut
  $shortcut.Save()
}

$controlCenterShortcut = Join-Path $desktop 'Scicon Shooter Control Center.lnk'
$desktopDirectorShortcut = Join-Path $desktop 'Scicon Director.lnk'
$desktopCombatLabShortcut = Join-Path $desktop 'Scicon Combat Lab.lnk'
$desktopLocalGameShortcut = Join-Path $desktop 'Scicon Shooter Local.lnk'
$startupShortcut = Join-Path $startup 'Scicon Director Auto Start.lnk'

Install-PowerShellShortcut `
  -Path $controlCenterShortcut `
  -ScriptPath $controlCenterLauncher `
  -ExtraArguments '' `
  -Description 'Start the local game tools and open the Scicon Shooter Control Center.'

Install-DirectorShortcut `
  -Path $desktopDirectorShortcut `
  -Page 'hub' `
  -Description 'Open the Scicon Shooter Control Center dashboard.'

Install-DirectorShortcut `
  -Path $desktopCombatLabShortcut `
  -Page 'sandbox' `
  -Description 'Open the Scicon Shooter Combat Lab.'

Install-PowerShellShortcut `
  -Path $desktopLocalGameShortcut `
  -ScriptPath $gameLauncher `
  -ExtraArguments '-OpenBrowser' `
  -Description "Open the canonical local game preview at $localGameUrl"

Install-PowerShellShortcut `
  -Path $startupShortcut `
  -ScriptPath $directorLauncher `
  -ExtraArguments '-Page hub' `
  -Description 'Start the local Scicon Director after Windows sign-in.'

Install-PowerShellShortcut `
  -Path (Join-Path $toolsFolder 'START HERE - Control Center.lnk') `
  -ScriptPath $controlCenterLauncher `
  -ExtraArguments '' `
  -Description 'Start the local game tools and open the owner dashboard.'

Install-DirectorShortcut `
  -Path (Join-Path $toolsFolder '01 - Bug and Feedback Log.lnk') `
  -Page 'reports' `
  -Description 'Review sanitized player bug reports, feedback, and crash diagnostics.'

Install-DirectorShortcut `
  -Path (Join-Path $toolsFolder '02 - Boss Sandbox.lnk') `
  -Page 'bosses' `
  -Description 'Open the Boss Sandbox.'

Install-DirectorShortcut `
  -Path (Join-Path $toolsFolder '03 - Mission Builder.lnk') `
  -Page 'missions' `
  -Description 'Open the Campaign Mission Builder.'

Install-DirectorShortcut `
  -Path (Join-Path $toolsFolder '04 - Combat Lab.lnk') `
  -Page 'sandbox' `
  -Description 'Open the gameplay Combat Lab.'

Install-DirectorShortcut `
  -Path (Join-Path $toolsFolder '05 - Project Guide.lnk') `
  -Page 'project' `
  -Description 'Open the owner guide and current local project status.'

Install-PowerShellShortcut `
  -Path (Join-Path $toolsFolder '06 - Local Game.lnk') `
  -ScriptPath $gameLauncher `
  -ExtraArguments '-OpenBrowser' `
  -Description "Open the canonical local game preview at $localGameUrl"

Install-TargetShortcut `
  -Path (Join-Path $toolsFolder '07 - Live Game.lnk') `
  -TargetPath $explorer `
  -Arguments $liveGameUrl `
  -Description 'Open the live Scicon Shooter website.'

Install-TargetShortcut `
  -Path (Join-Path $toolsFolder '08 - Project Folder.lnk') `
  -TargetPath $explorer `
  -Arguments "`"$repositoryRoot`"" `
  -Description 'Open the canonical Scicon Shooter project folder.'

if (Test-Path -LiteralPath $galleryLauncher) {
  Install-TargetShortcut `
    -Path (Join-Path $toolsFolder '09 - Sprite Gallery.lnk') `
    -TargetPath $wscript `
    -Arguments "`"$galleryLauncher`"" `
    -Description 'Open the Scicon Space Sprite Gallery.'
}

[pscustomobject]@{
  ControlCenterShortcut = $controlCenterShortcut
  ToolsFolder = $toolsFolder
  BugLogShortcut = Join-Path $toolsFolder '01 - Bug and Feedback Log.lnk'
  ProjectGuideShortcut = Join-Path $toolsFolder '05 - Project Guide.lnk'
  LocalGameUrl = $localGameUrl
  LiveGameUrl = $liveGameUrl
  StartupShortcut = $startupShortcut
  StartsAfterSignIn = $true
  OpensBrowserAtSignIn = $false
  ExistingLooseShortcutsPreserved = $true
}
