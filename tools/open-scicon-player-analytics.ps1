[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$builder = Join-Path $PSScriptRoot 'build-player-analytics-dashboard.mjs'
$environmentFile = Join-Path $repositoryRoot '.env.local'
$stateRoot = Join-Path $env:LOCALAPPDATA 'Scicon Player Analytics'
$outputPath = Join-Path $stateRoot 'player-analytics.html'
$node = (Get-Command node.exe -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $builder)) {
  throw "Player analytics builder not found: $builder"
}

New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

Push-Location $repositoryRoot
try {
  $nodeArguments = @(
    '--use-system-ca'
    "--env-file-if-exists=$environmentFile"
    $builder
    '--output'
    $outputPath
  )
  $receipt = & $node @nodeArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Player analytics builder exited with code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $outputPath)) {
  throw "Player analytics dashboard was not created: $outputPath"
}

Start-Process -FilePath $outputPath

[pscustomobject]@{
  Dashboard = $outputPath
  Receipt = ($receipt -join [Environment]::NewLine)
  Opened = $true
}
