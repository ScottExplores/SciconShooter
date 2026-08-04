[CmdletBinding()]
param(
  [switch]$OpenBrowser,
  [ValidateSet(
    'hub',
    'reports',
    'project',
    'missions',
    'waves',
    'bosses',
    'formations',
    'sandbox',
    'loadouts',
    'assets',
    'analytics',
    'reviews',
    'studio',
    'level-editor',
    'combat-lab'
  )]
  [string]$Page = 'hub'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$directorRoot = Join-Path $repositoryRoot 'director'
$healthUrl = 'http://127.0.0.1:5174/__director/health'
$canonicalPage = switch ($Page) {
  'level-editor' { 'missions' }
  'combat-lab' { 'sandbox' }
  'hub' { '' }
  default { $Page }
}
$directorUrl = if ($canonicalPage) {
  "http://127.0.0.1:5174/$canonicalPage"
} else {
  'http://127.0.0.1:5174/'
}
$stateRoot = Join-Path $env:LOCALAPPDATA 'Scicon Director'
$standardLog = Join-Path $stateRoot 'director.log'
$errorLog = Join-Path $stateRoot 'director-error.log'
$reportCacheScript = Join-Path $repositoryRoot 'tools\cache-player-reports.mjs'
$reportCachePath = Join-Path $stateRoot 'player-reports.json'

New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

function Write-DirectorLauncherLog {
  param([string]$Message)
  Add-Content -LiteralPath $standardLog -Value "[$(Get-Date -Format s)] $Message"
}

function Test-DirectorReady {
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    return $health.ok -eq $true -and
      $health.localOnly -eq $true -and
      $health.productionWrites -eq $false -and
      $health.mainnetTransactions -eq $false
  } catch {
    return $false
  }
}

function Update-PlayerReportCache {
  if (-not (Test-Path -LiteralPath $reportCacheScript)) {
    return
  }

  try {
    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    & $nodeCommand.Source `
      '--use-system-ca' `
      '--env-file-if-exists=.env.local' `
      $reportCacheScript `
      "--output=$reportCachePath" 1>> $standardLog 2>> $errorLog
    if ($LASTEXITCODE -ne 0) {
      Write-DirectorLauncherLog "Player report cache refresh exited with code $LASTEXITCODE; the last safe cache remains available."
    }
  } catch {
    Write-DirectorLauncherLog "Player report cache refresh was skipped: $($_.Exception.Message)"
  }
}

try {
  Update-PlayerReportCache

  if (-not (Test-DirectorReady)) {
    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    $viteEntry = Join-Path $directorRoot 'node_modules\vite\bin\vite.js'
    $spriteDependency = Join-Path $directorRoot 'node_modules\pngjs\package.json'

    if (-not (Test-Path -LiteralPath $viteEntry) -or -not (Test-Path -LiteralPath $spriteDependency)) {
      Write-DirectorLauncherLog 'Director dependencies are missing; installing the locked local package.'
      $npmCommand = Get-Command npm.cmd -ErrorAction Stop
      & $npmCommand.Source --prefix $directorRoot install --ignore-scripts --no-audit --no-fund 1>> $standardLog 2>> $errorLog
      if ($LASTEXITCODE -ne 0) {
        throw "Director dependency installation failed with exit code $LASTEXITCODE."
      }
    }

    Write-DirectorLauncherLog 'Starting the loopback-only Director server.'
    Start-Process `
      -FilePath $nodeCommand.Source `
      -ArgumentList @('--use-system-ca', "`"$viteEntry`"") `
      -WorkingDirectory $directorRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $standardLog `
      -RedirectStandardError $errorLog | Out-Null

    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
      Start-Sleep -Milliseconds 500
      if (Test-DirectorReady) {
        $ready = $true
        break
      }
    }
    if (-not $ready) {
      throw 'The Director did not become ready on 127.0.0.1:5174.'
    }
  }

  if ($OpenBrowser) {
    Start-Process -FilePath $directorUrl
  }
} catch {
  Add-Content -LiteralPath $errorLog -Value "[$(Get-Date -Format s)] $($_.Exception.Message)"
  if ($OpenBrowser) {
    $shell = New-Object -ComObject WScript.Shell
    $null = $shell.Popup(
      "Scicon Director could not start. Details are in:`n$errorLog",
      0,
      'Scicon Director',
      16
    )
  }
  exit 1
}
