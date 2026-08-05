[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$directorLauncher = Join-Path $PSScriptRoot 'start-scicon-director.ps1'
$gameLauncher = Join-Path $PSScriptRoot 'start-scicon-shooter-local.ps1'
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $directorLauncher)) {
  throw "Director launcher not found: $directorLauncher"
}

if (Test-Path -LiteralPath $gameLauncher) {
  Start-Process `
    -FilePath $powershell `
    -ArgumentList @(
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      "`"$gameLauncher`""
    ) `
    -WorkingDirectory $repositoryRoot `
    -WindowStyle Hidden | Out-Null
}

& $directorLauncher -OpenBrowser -Page hub
exit $LASTEXITCODE
