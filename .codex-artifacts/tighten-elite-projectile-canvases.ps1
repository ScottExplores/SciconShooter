param([Parameter(Mandatory = $true)][string]$RootDirectory)

Add-Type -AssemblyName System.Drawing

$families = @(
  'aegis-pulse',
  'convoy-command-bolt',
  'fracture-shard',
  'gridline-bolt',
  'maw-seed',
  'prism-petal',
  'railspine-needle',
  'meridian-bolt'
)

foreach ($family in $families) {
  $files = @(Get-ChildItem -Path $RootDirectory -Recurse -File -Filter "$family-*.png" | Sort-Object Name)
  if ($files.Count -ne 4) {
    throw "$family expected four frames, found $($files.Count)"
  }

  $minimumX = [int]::MaxValue
  $minimumY = [int]::MaxValue
  $maximumX = -1
  $maximumY = -1
  $bitmaps = @()
  try {
    foreach ($file in $files) {
      $bitmap = [System.Drawing.Bitmap]::new($file.FullName)
      $bitmaps += $bitmap
      for ($pixelY = 0; $pixelY -lt $bitmap.Height; $pixelY += 1) {
        for ($pixelX = 0; $pixelX -lt $bitmap.Width; $pixelX += 1) {
          if ($bitmap.GetPixel($pixelX, $pixelY).A -le 8) { continue }
          $minimumX = [math]::Min($minimumX, $pixelX)
          $minimumY = [math]::Min($minimumY, $pixelY)
          $maximumX = [math]::Max($maximumX, $pixelX)
          $maximumY = [math]::Max($maximumY, $pixelY)
        }
      }
    }

    if ($maximumX -lt $minimumX -or $maximumY -lt $minimumY) {
      throw "$family contains no visible pixels"
    }
    $sourceWidth = $bitmaps[0].Width
    $sourceHeight = $bitmaps[0].Height
    $cropLeft = [math]::Max(0, $minimumX - 2)
    $cropTop = [math]::Max(0, $minimumY - 2)
    $cropRight = [math]::Min($sourceWidth - 1, $maximumX + 2)
    $cropBottom = [math]::Min($sourceHeight - 1, $maximumY + 2)
    $cropWidth = $cropRight - $cropLeft + 1
    $cropHeight = $cropBottom - $cropTop + 1

    for ($frameIndex = 0; $frameIndex -lt $files.Count; $frameIndex += 1) {
      $source = $bitmaps[$frameIndex]
      $cropped = [System.Drawing.Bitmap]::new($cropWidth, $cropHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $graphics = [System.Drawing.Graphics]::FromImage($cropped)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage(
          $source,
          [System.Drawing.Rectangle]::new(0, 0, $cropWidth, $cropHeight),
          [System.Drawing.Rectangle]::new($cropLeft, $cropTop, $cropWidth, $cropHeight),
          [System.Drawing.GraphicsUnit]::Pixel
        )
      } finally {
        $graphics.Dispose()
      }
      $source.Dispose()
      $bitmaps[$frameIndex] = $null
      $cropped.Save($files[$frameIndex].FullName, [System.Drawing.Imaging.ImageFormat]::Png)
      $cropped.Dispose()
    }
    Write-Output ("{0}: {1}x{2} -> {3}x{4}" -f $family, $sourceWidth, $sourceHeight, $cropWidth, $cropHeight)
  } finally {
    foreach ($bitmap in $bitmaps) {
      if ($null -ne $bitmap) { $bitmap.Dispose() }
    }
  }
}
