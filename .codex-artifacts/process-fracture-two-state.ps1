param(
  [Parameter(Mandatory = $true)][string]$SourcePath,
  [Parameter(Mandatory = $true)][string]$EvidenceDirectory,
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)

Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
Copy-Item -LiteralPath $SourcePath -Destination (Join-Path $EvidenceDirectory 'fracture-engine-elite-attack-b-damage-source.png') -Force

$sourceImage = [System.Drawing.Bitmap]::new($SourcePath)
$cellWidth = [math]::Floor($sourceImage.Width / 2)
$stateNames = @('attack-b', 'damage')

try {
  for ($stateIndex = 0; $stateIndex -lt 2; $stateIndex += 1) {
    $cell = [System.Drawing.Bitmap]::new($cellWidth, $sourceImage.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $cellGraphics = [System.Drawing.Graphics]::FromImage($cell)
    try {
      $sourceRectangle = [System.Drawing.Rectangle]::new($stateIndex * $cellWidth, 0, $cellWidth, $sourceImage.Height)
      $cellGraphics.DrawImage($sourceImage, [System.Drawing.Rectangle]::new(0, 0, $cellWidth, $sourceImage.Height), $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)
    } finally {
      $cellGraphics.Dispose()
    }

    $minimumX = $cell.Width
    $minimumY = $cell.Height
    $maximumX = -1
    $maximumY = -1
    for ($pixelY = 0; $pixelY -lt $cell.Height; $pixelY += 1) {
      for ($pixelX = 0; $pixelX -lt $cell.Width; $pixelX += 1) {
        $pixel = $cell.GetPixel($pixelX, $pixelY)
        $isChroma = $pixel.G -gt 105 -and $pixel.G -gt ($pixel.R * 1.35) -and $pixel.G -gt ($pixel.B * 1.28)
        if ($isChroma) {
          $cell.SetPixel($pixelX, $pixelY, [System.Drawing.Color]::FromArgb(0, $pixel.R, $pixel.G, $pixel.B))
        } elseif ($pixel.A -gt 0) {
          $minimumX = [math]::Min($minimumX, $pixelX)
          $minimumY = [math]::Min($minimumY, $pixelY)
          $maximumX = [math]::Max($maximumX, $pixelX)
          $maximumY = [math]::Max($maximumY, $pixelY)
        }
      }
    }

    $alphaPath = Join-Path $EvidenceDirectory ("fracture-engine-elite-{0}-alpha.png" -f $stateNames[$stateIndex])
    $cell.Save($alphaPath, [System.Drawing.Imaging.ImageFormat]::Png)
    if ($maximumX -lt $minimumX -or $maximumY -lt $minimumY) {
      throw "No foreground pixels found for $($stateNames[$stateIndex])"
    }

    $cropWidth = $maximumX - $minimumX + 1
    $cropHeight = $maximumY - $minimumY + 1
    $scale = [math]::Min(228 / $cropWidth, 222 / $cropHeight)
    $targetWidth = [math]::Max(1, [math]::Round($cropWidth * $scale))
    $targetHeight = [math]::Max(1, [math]::Round($cropHeight * $scale))
    $targetX = [math]::Round((256 - $targetWidth) / 2)
    $targetY = [math]::Round((256 - $targetHeight) / 2)
    $production = [System.Drawing.Bitmap]::new(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $productionGraphics = [System.Drawing.Graphics]::FromImage($production)
    try {
      $productionGraphics.Clear([System.Drawing.Color]::Transparent)
      $productionGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $productionGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $productionGraphics.DrawImage(
        $cell,
        [System.Drawing.Rectangle]::new($targetX, $targetY, $targetWidth, $targetHeight),
        [System.Drawing.Rectangle]::new($minimumX, $minimumY, $cropWidth, $cropHeight),
        [System.Drawing.GraphicsUnit]::Pixel
      )
    } finally {
      $productionGraphics.Dispose()
    }
    $outputPath = Join-Path $OutputDirectory ("fracture-engine-elite-{0}.png" -f $stateNames[$stateIndex])
    $production.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $production.Dispose()
    $cell.Dispose()
    Write-Output ("{0}: source {1}x{2}, output {3}x{4} at {5},{6}" -f $stateNames[$stateIndex], $cropWidth, $cropHeight, $targetWidth, $targetHeight, $targetX, $targetY)
  }
} finally {
  $sourceImage.Dispose()
}
