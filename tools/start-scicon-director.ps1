[CmdletBinding()]
param(
  [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$directorRoot = Join-Path $repositoryRoot 'director'
$healthUrl = 'http://127.0.0.1:5174/__director/health'
$directorUrl = 'http://127.0.0.1:5174/level-editor'
$stateRoot = Join-Path $env:LOCALAPPDATA 'Scicon Director'
$standardLog = Join-Path $stateRoot 'director.log'
$errorLog = Join-Path $stateRoot 'director-error.log'

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

try {
  if (-not (Test-DirectorReady)) {
    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    $viteEntry = Join-Path $directorRoot 'node_modules\vite\bin\vite.js'

    if (-not (Test-Path -LiteralPath $viteEntry)) {
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
