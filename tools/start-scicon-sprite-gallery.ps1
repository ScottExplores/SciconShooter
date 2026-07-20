[CmdletBinding()]
param(
  [int]$Port = 43817,
  [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$syncScript = Join-Path $scriptRoot 'sync-scicon-sprite-gallery.ps1'
$serverScript = Join-Path $scriptRoot 'scicon-sprite-gallery-server.mjs'
$galleryUrl = "http://127.0.0.1:$Port/"
$healthUrl = "http://127.0.0.1:$Port/api/health"

function Test-GalleryService {
  try {
    $response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 1
    return $response.ok -eq $true -and $response.service -eq 'scicon-sprite-gallery'
  } catch {
    return $false
  }
}

& $syncScript | Out-Null

if (-not (Test-GalleryService)) {
  $nodeCommand = Get-Command node -ErrorAction Stop
  $logRoot = Join-Path $env:LOCALAPPDATA 'Scicon ShooterSprite Gallery'
  New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
  $stdoutPath = Join-Path $logRoot 'gallery-server.log'
  $stderrPath = Join-Path $logRoot 'gallery-server-error.log'
  $arguments = @("`"$serverScript`"", '--port', $Port)
  Start-Process -FilePath $nodeCommand.Source -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    Start-Sleep -Milliseconds 150
    if (Test-GalleryService) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw "The Sprite Gallery service did not start. Check $stderrPath"
  }
}

if ($OpenBrowser) {
  Start-Process $galleryUrl
}

[pscustomobject][ordered]@{
  Url = $galleryUrl
  Running = $true
  DeleteMode = 'Windows Recycle Bin'
} | ConvertTo-Json -Compress

