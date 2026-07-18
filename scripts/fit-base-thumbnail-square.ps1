param(
    [string]$SourcePath = "public/app-thumbnail.png",
    [string]$OutputPath = "marketing/campaign-assets/scicon-shooter-base-dashboard-thumbnail-square.jpg"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourceFile = if ([System.IO.Path]::IsPathRooted($SourcePath)) { $SourcePath } else { Join-Path $root $SourcePath }
$outputFile = if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $root $OutputPath }
[System.IO.Directory]::CreateDirectory((Split-Path -Parent $outputFile)) | Out-Null

$source = [System.Drawing.Image]::FromFile($sourceFile)
$canvas = New-Object System.Drawing.Bitmap 1024, 1024
$graphics = [System.Drawing.Graphics]::FromImage($canvas)

try {
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::FromArgb(2, 6, 20))

    # Fill the square with a darkened crop of the same artwork—no new graphics or redesigned elements.
    $coverWidth = [int][Math]::Ceiling(1024 * $source.Width / $source.Height)
    $coverX = [int](($coverWidth - 1024) / -2)
    $graphics.DrawImage($source, $coverX, 0, $coverWidth, 1024)
    $shade = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190, 0, 4, 18))
    $graphics.FillRectangle($shade, 0, 0, 1024, 1024)
    $shade.Dispose()

    # Place the complete original image inside a safe 32 px square margin, preserving every element and word.
    $mainWidth = 960
    $mainHeight = [int][Math]::Round($mainWidth * $source.Height / $source.Width)
    $mainX = 32
    $mainY = [int][Math]::Round((1024 - $mainHeight) / 2)

    $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(185, 0, 0, 0))
    $graphics.FillRectangle($shadow, $mainX - 10, $mainY - 10, $mainWidth + 20, $mainHeight + 20)
    $shadow.Dispose()
    $graphics.DrawImage($source, $mainX, $mainY, $mainWidth, $mainHeight)

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq "image/jpeg"
    $parameters = New-Object System.Drawing.Imaging.EncoderParameters 1
    $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]88)
    $canvas.Save($outputFile, $codec, $parameters)
    $parameters.Dispose()
}
finally {
    $graphics.Dispose()
    $canvas.Dispose()
    $source.Dispose()
}

$result = Get-Item -LiteralPath $outputFile
if ($result.Length -gt 1MB) {
    throw "Output exceeds the Base dashboard 1 MB limit: $($result.Length) bytes"
}

Write-Output "$($result.FullName)`t$($result.Length) bytes"
