param(
  [switch]$Check
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $repoRoot 'tools\imagegen-sources\scicon-retraction-fleet-v2'
$outputDir = Join-Path $repoRoot 'public\game-art\generated\scicon-retraction-fleet-v2'
$frameSize = 64
$contentSize = 52
$states = @('neutral', 'charge', 'fire')
$sourceDate = '2026-08-05'

$enemies = @(
  [ordered]@{ id = 'redline-skirmisher'; name = 'Redline Skirmisher'; source = '01-redline-skirmisher-chroma.png'; assetKey = 'SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES'; roleIds = @('role-jet-scout') },
  [ordered]@{ id = 'crosscut-raider'; name = 'Crosscut Raider'; source = '02-crosscut-raider-chroma.png'; assetKey = 'SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES'; roleIds = @('role-jet-interceptor') },
  [ordered]@{ id = 'audit-bulwark'; name = 'Audit Bulwark'; source = '03-audit-bulwark-chroma.png'; assetKey = 'SCICON_ENEMY_AUDIT_BULWARK_FRAMES'; roleIds = @('role-jet-heavy') },
  [ordered]@{ id = 'quasar-lancer-v2'; name = 'Quasar Lancer'; source = '04-quasar-lancer-v2-chroma.png'; assetKey = 'SCICON_ENEMY_QUASAR_LANCER_V2_FRAMES'; roleIds = @('role-quasar-lancer') },
  [ordered]@{ id = 'vector-reaver-v2'; name = 'Vector Reaver'; source = '05-vector-reaver-v2-chroma.png'; assetKey = 'SCICON_ENEMY_VECTOR_REAVER_V2_FRAMES'; roleIds = @('role-vector-reaver') }
)

function New-ArgbBitmap([int]$width, [int]$height) {
  return [System.Drawing.Bitmap]::new(
    $width,
    $height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
}

function Convert-ChromaFrame(
  [System.Drawing.Bitmap]$source,
  [int]$left,
  [int]$top,
  [int]$width,
  [int]$height
) {
  $frame = New-ArgbBitmap $width $height
  $graphics = [System.Drawing.Graphics]::FromImage($frame)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.DrawImage(
      $source,
      [System.Drawing.Rectangle]::new(0, 0, $width, $height),
      [System.Drawing.Rectangle]::new($left, $top, $width, $height),
      [System.Drawing.GraphicsUnit]::Pixel
    )
  }
  finally {
    $graphics.Dispose()
  }

  $rect = [System.Drawing.Rectangle]::new(0, 0, $width, $height)
  $bits = $frame.LockBits(
    $rect,
    [System.Drawing.Imaging.ImageLockMode]::ReadWrite,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $bytes = [Math]::Abs($bits.Stride) * $height
  $pixels = [byte[]]::new($bytes)
  [Runtime.InteropServices.Marshal]::Copy($bits.Scan0, $pixels, 0, $bytes)

  $minX = $width
  $minY = $height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $height; $y += 1) {
    $row = $y * $bits.Stride
    for ($x = 0; $x -lt $width; $x += 1) {
      $index = $row + $x * 4
      $blue = [int]$pixels[$index]
      $green = [int]$pixels[$index + 1]
      $red = [int]$pixels[$index + 2]
      $magentaLead = [Math]::Min($red, $blue) - $green
      $isChroma = $red -gt 55 -and $blue -gt 55 -and $green -lt 160 -and $magentaLead -gt 30

      if ($isChroma) {
        $pixels[$index] = 0
        $pixels[$index + 1] = 0
        $pixels[$index + 2] = 0
        $pixels[$index + 3] = 0
        continue
      }

      $pixels[$index + 3] = 255
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }

  [Runtime.InteropServices.Marshal]::Copy($pixels, 0, $bits.Scan0, $bytes)
  $frame.UnlockBits($bits)

  if ($maxX -lt $minX -or $maxY -lt $minY) {
    $frame.Dispose()
    throw 'Generated enemy frame contains no non-chroma pixels.'
  }

  return [pscustomobject]@{
    Image = $frame
    Bounds = [System.Drawing.Rectangle]::FromLTRB($minX, $minY, $maxX + 1, $maxY + 1)
  }
}

function New-NormalizedFrame(
  [System.Drawing.Bitmap]$source,
  [System.Drawing.Rectangle]$bounds,
  [double]$scale
) {
  $width = [Math]::Max(1, [Math]::Round($bounds.Width * $scale))
  $height = [Math]::Max(1, [Math]::Round($bounds.Height * $scale))
  $left = [Math]::Floor(($frameSize - $width) / 2)
  $top = [Math]::Floor(($frameSize - $height) / 2)
  $normalized = New-ArgbBitmap $frameSize $frameSize
  $graphics = [System.Drawing.Graphics]::FromImage($normalized)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $graphics.DrawImage(
      $source,
      [System.Drawing.Rectangle]::new($left, $top, $width, $height),
      $bounds,
      [System.Drawing.GraphicsUnit]::Pixel
    )
  }
  finally {
    $graphics.Dispose()
  }
  return $normalized
}

function Get-PublicPath([string]$path) {
  $publicRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'public')).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $fullPath = [IO.Path]::GetFullPath($path)
  if (-not $fullPath.StartsWith($publicRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is outside public/: $fullPath"
  }
  $relative = $fullPath.Substring($publicRoot.Length)
  return '/' + ($relative -replace '\\', '/')
}

function Get-Sha256([string]$path) {
  return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$buildRoot = Join-Path ([IO.Path]::GetTempPath()) ('scicon-retraction-fleet-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null

try {
  $manifestEnemies = @()
  $overview = New-ArgbBitmap ($frameSize * 3) ($frameSize * $enemies.Count)
  $overviewGraphics = [System.Drawing.Graphics]::FromImage($overview)
  $overviewGraphics.Clear([System.Drawing.Color]::Transparent)
  $overviewGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy

  try {
    for ($enemyIndex = 0; $enemyIndex -lt $enemies.Count; $enemyIndex += 1) {
      $enemy = $enemies[$enemyIndex]
      $sourcePath = Join-Path $sourceDir $enemy.source
      if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing ImageGen source: $sourcePath" }

      $source = [System.Drawing.Bitmap]::FromFile($sourcePath)
      $rawFrames = @()
      try {
        $edges = @(0, [Math]::Round($source.Width / 3), [Math]::Round($source.Width * 2 / 3), $source.Width)
        for ($frameIndex = 0; $frameIndex -lt 3; $frameIndex += 1) {
          $left = $edges[$frameIndex]
          $width = $edges[$frameIndex + 1] - $left
          $rawFrames += Convert-ChromaFrame $source $left 0 $width $source.Height
        }
      }
      finally {
        $source.Dispose()
      }

      $maxWidth = ($rawFrames | ForEach-Object { $_.Bounds.Width } | Measure-Object -Maximum).Maximum
      $maxHeight = ($rawFrames | ForEach-Object { $_.Bounds.Height } | Measure-Object -Maximum).Maximum
      $scale = [Math]::Min($contentSize / $maxWidth, $contentSize / $maxHeight)

      $enemyDir = Join-Path $buildRoot ('enemies\' + $enemy.id)
      $frameDir = Join-Path $enemyDir 'frames'
      New-Item -ItemType Directory -Path $frameDir -Force | Out-Null
      $sheet = New-ArgbBitmap ($frameSize * 3) $frameSize
      $sheetGraphics = [System.Drawing.Graphics]::FromImage($sheet)
      $sheetGraphics.Clear([System.Drawing.Color]::Transparent)
      $sheetGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $framePaths = @()

      try {
        for ($frameIndex = 0; $frameIndex -lt 3; $frameIndex += 1) {
          $normalized = New-NormalizedFrame $rawFrames[$frameIndex].Image $rawFrames[$frameIndex].Bounds $scale
          try {
            $fileName = '{0}-{1:d2}-{2}.png' -f $enemy.id, ($frameIndex + 1), $states[$frameIndex]
            $framePath = Join-Path $frameDir $fileName
            $normalized.Save($framePath, [System.Drawing.Imaging.ImageFormat]::Png)
            $framePaths += $framePath
            $sheetGraphics.DrawImageUnscaled($normalized, $frameIndex * $frameSize, 0)
            $overviewGraphics.DrawImageUnscaled($normalized, $frameIndex * $frameSize, $enemyIndex * $frameSize)
          }
          finally {
            $normalized.Dispose()
          }
        }
      }
      finally {
        $sheetGraphics.Dispose()
        $rawFrames | ForEach-Object { $_.Image.Dispose() }
      }

      $sheetPath = Join-Path $enemyDir ($enemy.id + '-sprite-sheet.png')
      $sheet.Save($sheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
      $sheet.Dispose()

      $manifestEnemies += [ordered]@{
        id = $enemy.id
        name = $enemy.name
        assetKey = $enemy.assetKey
        roleIds = $enemy.roleIds
        faction = 'retraction-fleet'
        source = 'tools/imagegen-sources/scicon-retraction-fleet-v2/' + $enemy.source
        states = $states
        frames = @($framePaths | ForEach-Object { Get-PublicPath ($_.Replace($buildRoot, $outputDir)) })
        frameFileHashes = [ordered]@{
          neutral = Get-Sha256 $framePaths[0]
          charge = Get-Sha256 $framePaths[1]
          fire = Get-Sha256 $framePaths[2]
        }
        sheet = Get-PublicPath ($sheetPath.Replace($buildRoot, $outputDir))
        sheetFileHash = Get-Sha256 $sheetPath
      }
    }

    $overviewPath = Join-Path $buildRoot 'scicon-retraction-fleet-v2-overview.png'
    $overview.Save($overviewPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    if ($overviewGraphics) { $overviewGraphics.Dispose() }
    if ($overview) { $overview.Dispose() }
  }

  $manifest = [ordered]@{
    id = 'scicon-retraction-fleet-v2'
    version = 2
    generated = $sourceDate
    sourceMode = 'OpenAI built-in image generation with local chroma-key removal'
    productionFormat = 'Three-frame transparent PNG sprite sheets'
    style = 'Compact red/gunmetal Scicon pixel-art enemy faction'
    factionStory = 'The Retraction Fleet escalates from skirmishers and crosscut raiders into armored audit hulls and specialist laser aces.'
    frame = [ordered]@{ width = $frameSize; height = $frameSize; colorMode = 'RGBA' }
    frameCount = 3
    frameOrder = $states
    fixedRegistration = $true
    hitboxInvariant = 'Runtime collision is defined by the assigned enemy chassis, not sprite alpha bounds.'
    overview = Get-PublicPath ((Join-Path $buildRoot 'scicon-retraction-fleet-v2-overview.png').Replace($buildRoot, $outputDir))
    enemies = $manifestEnemies
  }
  $manifestPath = Join-Path $buildRoot 'pack-manifest.json'
  $json = ($manifest | ConvertTo-Json -Depth 12) + "`n"
  [IO.File]::WriteAllText($manifestPath, $json, [Text.UTF8Encoding]::new($false))

  $readme = @'
# Scicon Retraction Fleet v2

Five compact red/gunmetal enemy families that replace the retired pink jet
sprites and the two needle-shaped late-game hulls. Each family has three
transparent 64x64 PNG frames and a 192x64 horizontal sprite sheet.

The faction shares a red reactor and cyan maneuver-light language, while every
silhouette reflects its move: skirmisher dodge, crosscut pincer, armored brace,
lane-laser emitter, or scissor-wing strike. Runtime hitboxes remain chassis
owned and independent of visible pixels.
'@
  [IO.File]::WriteAllText((Join-Path $buildRoot 'README.md'), $readme.TrimStart(), [Text.UTF8Encoding]::new($false))

  if ($Check) {
    if (-not (Test-Path -LiteralPath $outputDir)) { throw "Output pack does not exist: $outputDir" }
    $expected = Get-ChildItem -LiteralPath $buildRoot -Recurse -File | ForEach-Object {
      $_.FullName.Substring($buildRoot.TrimEnd([IO.Path]::DirectorySeparatorChar).Length + 1)
    }
    $actual = Get-ChildItem -LiteralPath $outputDir -Recurse -File | ForEach-Object {
      $_.FullName.Substring($outputDir.TrimEnd([IO.Path]::DirectorySeparatorChar).Length + 1)
    }
    if (Compare-Object $expected $actual) { throw 'Retraction Fleet output file list is stale.' }
    foreach ($relative in $expected) {
      $builtHash = Get-Sha256 (Join-Path $buildRoot $relative)
      $trackedHash = Get-Sha256 (Join-Path $outputDir $relative)
      if ($builtHash -ne $trackedHash) { throw "Retraction Fleet output is stale: $relative" }
    }
    Write-Output 'Scicon Retraction Fleet v2 output is deterministic and current.'
  }
  else {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    Copy-Item -Path (Join-Path $buildRoot '*') -Destination $outputDir -Recurse -Force
    Write-Output "Built $($enemies.Count) compact Retraction Fleet families in $outputDir"
  }
}
finally {
  if (Test-Path -LiteralPath $buildRoot) {
    Remove-Item -LiteralPath $buildRoot -Recurse -Force
  }
}
