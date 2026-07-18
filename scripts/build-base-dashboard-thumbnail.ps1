param(
    [string]$OutputPath = "marketing/campaign-assets/scicon-shooter-base-dashboard-thumbnail-v2.jpg"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$shipPath = Join-Path $root "public/game-art/branding/researchhub-ship.png"
$nebulaPath = Join-Path $root "public/game-art/backgrounds/menu-hero.png"
$starsPath = Join-Path $root "public/game-art/backgrounds/bg-stars.png"
$targetPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath
} else {
    Join-Path $root $OutputPath
}

[System.IO.Directory]::CreateDirectory((Split-Path -Parent $targetPath)) | Out-Null

$canvas = New-Object System.Drawing.Bitmap 1024, 1024
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::FromArgb(3, 7, 24))

$stars = [System.Drawing.Image]::FromFile($starsPath)
$nebula = [System.Drawing.Image]::FromFile($nebulaPath)
$ship = [System.Drawing.Image]::FromFile($shipPath)

try {
    # Layer the game's real pixel-art space backdrops without stretching them into a blur.
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    for ($y = 0; $y -lt 1024; $y += 320) {
        for ($x = 0; $x -lt 1024; $x += 544) {
            $graphics.DrawImage($stars, $x, $y, 544, 320)
        }
    }
    $graphics.DrawImage($nebula, -168, 235, 1360, 800)

    # Darken the perimeter so the title and ship stay legible in a tiny rounded thumbnail.
    $edgePath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $edgePath.AddEllipse(-135, -90, 1294, 1220)
    $edgeGlow = New-Object System.Drawing.Drawing2D.PathGradientBrush $edgePath
    $edgeGlow.CenterColor = [System.Drawing.Color]::FromArgb(0, 3, 11, 34)
    $edgeGlow.SurroundColors = @([System.Drawing.Color]::FromArgb(205, 0, 2, 13))
    $graphics.FillRectangle($edgeGlow, 0, 0, 1024, 1024)
    $edgeGlow.Dispose()
    $edgePath.Dispose()

    # A restrained arcade ring and glow frame the actual ResearchHub ship.
    $ringPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(88, 98, 52, 255)), 9
    $graphics.DrawEllipse($ringPen, 159, 300, 706, 706)
    $ringPen.Dispose()

    $shipGlowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $shipGlowPath.AddEllipse(170, 345, 684, 625)
    $shipGlow = New-Object System.Drawing.Drawing2D.PathGradientBrush $shipGlowPath
    $shipGlow.CenterColor = [System.Drawing.Color]::FromArgb(118, 0, 211, 255)
    $shipGlow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 31, 16, 105))
    $graphics.FillEllipse($shipGlow, 170, 345, 684, 625)
    $shipGlow.Dispose()
    $shipGlowPath.Dispose()

    function Draw-CenteredTitleLine {
        param(
            [System.Drawing.Graphics]$G,
            [string]$Text,
            [float]$Y,
            [float]$FontSize
        )

        $family = New-Object System.Drawing.FontFamily "Arial Black"
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $format = [System.Drawing.StringFormat]::GenericTypographic
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $format.LineAlignment = [System.Drawing.StringAlignment]::Near
        $emSize = $FontSize * 96 / 72
        $path.AddString($Text, $family, [int][System.Drawing.FontStyle]::Regular, $emSize, (New-Object System.Drawing.PointF 512, $Y), $format)

        $cyanGlow = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 0, 220, 255)), 24
        $cyanGlow.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
        $G.DrawPath($cyanGlow, $path)
        $cyanGlow.Dispose()

        $navyOutline = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 2, 23, 59)), 12
        $navyOutline.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
        $G.DrawPath($navyOutline, $path)
        $navyOutline.Dispose()

        $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(250, 249, 255, 255))
        $G.FillPath($white, $path)
        $white.Dispose()
        $path.Dispose()
        $family.Dispose()
    }

    Draw-CenteredTitleLine -G $graphics -Text "SCICON" -Y 48 -FontSize 105
    Draw-CenteredTitleLine -G $graphics -Text "SHOOTER" -Y 171 -FontSize 100

    # Preserve the exact in-game ship pixels. Nearest-neighbor scaling keeps its sprite identity intact.
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.DrawImage($ship, 232, 356, 560, 560)

    # Small brand-color accents, safely inset from dashboard cropping.
    $cyanPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(215, 25, 226, 255)), 6
    $limePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(215, 117, 255, 41)), 6
    $graphics.DrawLine($cyanPen, 92, 323, 306, 323)
    $graphics.DrawLine($limePen, 718, 323, 932, 323)
    $cyanPen.Dispose()
    $limePen.Dispose()

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq "image/jpeg"
    $encoder = [System.Drawing.Imaging.Encoder]::Quality
    $parameters = New-Object System.Drawing.Imaging.EncoderParameters 1
    $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, [long]92)
    $canvas.Save($targetPath, $codec, $parameters)
    $parameters.Dispose()
}
finally {
    $ship.Dispose()
    $nebula.Dispose()
    $stars.Dispose()
    $graphics.Dispose()
    $canvas.Dispose()
}

$file = Get-Item -LiteralPath $targetPath
if ($file.Length -gt 1MB) {
    throw "Output is larger than Base's 1 MB limit: $($file.Length) bytes"
}

Write-Output "$($file.FullName)`t$($file.Length) bytes"
