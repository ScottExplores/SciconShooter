[CmdletBinding()]
param(
  [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$gameUrl = 'http://127.0.0.1:5176/'
$stateRoot = Join-Path $env:LOCALAPPDATA 'Scicon Shooter Local'
$standardLog = Join-Path $stateRoot 'server.log'
$errorLog = Join-Path $stateRoot 'server-error.log'

New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

function Write-LauncherLog {
  param([string]$Message)
  Add-Content -LiteralPath $standardLog -Value "[$(Get-Date -Format s)] $Message"
}

function Test-GameReady {
  try {
    $response = Invoke-WebRequest -Uri $gameUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200 -and
      $response.Content -match '<title>Scicon Shooter</title>'
  } catch {
    return $false
  }
}

try {
  if (-not (Test-GameReady)) {
    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    $npmCommand = Get-Command npm.cmd -ErrorAction Stop
    $viteEntry = Join-Path $repositoryRoot 'node_modules\vite\bin\vite.js'

    if (-not (Test-Path -LiteralPath $viteEntry)) {
      Write-LauncherLog 'Project dependencies are missing; installing the local package.'
      & $npmCommand.Source install --ignore-scripts --no-audit --no-fund 1>> $standardLog 2>> $errorLog
      if ($LASTEXITCODE -ne 0) {
        throw "Dependency installation failed with exit code $LASTEXITCODE."
      }
    }

    Write-LauncherLog 'Refreshing generated styles before startup.'
    & $npmCommand.Source run generate:tailwind 1>> $standardLog 2>> $errorLog
    if ($LASTEXITCODE -ne 0) {
      throw "Style generation failed with exit code $LASTEXITCODE."
    }

    Write-LauncherLog 'Starting Scicon Shooter on http://127.0.0.1:5176/.'
    Start-Process `
      -FilePath $nodeCommand.Source `
      -ArgumentList @(
        '--use-system-ca',
        '--env-file-if-exists=.env.local',
        "`"$viteEntry`"",
        '--host',
        '127.0.0.1',
        '--port',
        '5176',
        '--strictPort'
      ) `
      -WorkingDirectory $repositoryRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $standardLog `
      -RedirectStandardError $errorLog | Out-Null

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
      Start-Sleep -Milliseconds 500
      if (Test-GameReady) {
        $ready = $true
        break
      }
    }

    if (-not $ready) {
      throw 'Scicon Shooter did not become ready on 127.0.0.1:5176.'
    }
  }

  if ($OpenBrowser) {
    Start-Process -FilePath $gameUrl
  }
} catch {
  Add-Content -LiteralPath $errorLog -Value "[$(Get-Date -Format s)] $($_.Exception.Message)"
  if ($OpenBrowser) {
    $shell = New-Object -ComObject WScript.Shell
    $null = $shell.Popup(
      "Scicon Shooter could not start. Details are in:`n$errorLog",
      0,
      'Scicon Shooter Local',
      16
    )
  }
  exit 1
}
