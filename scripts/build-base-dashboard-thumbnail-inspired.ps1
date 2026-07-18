param(
    [string]$OutputPath = "marketing/campaign-assets/scicon-shooter-base-dashboard-thumbnail-inspired-v2.jpg"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$asset = { param($relative) Join-Path $root $relative }
$outputFile = if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $root $OutputPath }
[System.IO.Directory]::CreateDirectory((Split-Path -Parent $outputFile)) | Out-Null

$canvas = New-Object System.Drawing.Bitmap 1024, 1024
$g = [System.Drawing.Graphics]::FromImage($canvas)
$stars = [System.Drawing.Image]::FromFile((& $asset "public/game-art/backgrounds/bg-stars.png"))
$nebula = [System.Drawing.Image]::FromFile((& $asset "public/game-art/backgrounds/menu-hero.png"))
$ship = [System.Drawing.Image]::FromFile((& $asset "public/game-art/branding/researchhub-ship.png"))
$boss = [System.Drawing.Image]::FromFile((& $asset "public/game-art/bosses/final-boss-sentinel.png"))
$drone1 = [System.Drawing.Image]::FromFile((& $asset "public/game-art/enemies/enemy-drone-1.png"))
$drone4 = [System.Drawing.Image]::FromFile((& $asset "public/game-art/enemies/enemy-drone-4.png"))
$asteroid2 = [System.Drawing.Image]::FromFile((& $asset "public/game-art/enemies/asteroid-2.png"))
$asteroid4 = [System.Drawing.Image]::FromFile((& $asset "public/game-art/enemies/asteroid-4.png"))
$rsc = [System.Drawing.Image]::FromFile((& $asset "public/game-art/tokens/rsc-bottle.png"))

try {
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::FromArgb(2, 6, 24))

    # Build a fresh square scene from the game's native art—not from the reference poster.
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    for ($y = 0; $y -lt 1024; $y += 320) {
        for ($x = 0; $x -lt 1024; $x += 544) {
            $g.DrawImage($stars, $x, $y, 544, 320)
        }
    }
    function Draw-ImageWithOpacity {
        param(
            [System.Drawing.Graphics]$Graphics,
            [System.Drawing.Image]$Image,
            [System.Drawing.Rectangle]$Destination,
            [float]$Opacity,
            [float]$Brightness = 1.0
        )
        $matrix = New-Object System.Drawing.Imaging.ColorMatrix
        $matrix.Matrix00 = $Brightness
        $matrix.Matrix11 = $Brightness
        $matrix.Matrix22 = $Brightness
        $matrix.Matrix33 = $Opacity
        $attributes = New-Object System.Drawing.Imaging.ImageAttributes
        $attributes.SetColorMatrix($matrix)
        $Graphics.DrawImage($Image, $Destination, 0, 0, $Image.Width, $Image.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
        $attributes.Dispose()
    }

    # A huge, dim sentinel sits behind the translucent nebula like a looming threat.
    Draw-ImageWithOpacity -Graphics $g -Image $boss -Destination (New-Object System.Drawing.Rectangle 182, 285, 660, 660) -Opacity 0.32 -Brightness 0.36
    Draw-ImageWithOpacity -Graphics $g -Image $nebula -Destination (New-Object System.Drawing.Rectangle -330, 250, 1680, 988) -Opacity 0.82 -Brightness 0.82
    Draw-ImageWithOpacity -Graphics $g -Image $boss -Destination (New-Object System.Drawing.Rectangle 202, 315, 620, 620) -Opacity 0.28 -Brightness 0.58

    # Deep vignette keeps all action readable after Base rounds the thumbnail corners.
    $vignettePath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $vignettePath.AddEllipse(-140, -100, 1304, 1250)
    $vignette = New-Object System.Drawing.Drawing2D.PathGradientBrush $vignettePath
    $vignette.CenterColor = [System.Drawing.Color]::FromArgb(0, 2, 12, 35)
    $vignette.SurroundColors = @([System.Drawing.Color]::FromArgb(180, 0, 2, 16))
    $g.FillRectangle($vignette, 0, 0, 1024, 1024)
    $vignette.Dispose()
    $vignettePath.Dispose()

    function Add-CenteredTextPath {
        param([string]$Text, [float]$Y, [float]$Size)
        $family = New-Object System.Drawing.FontFamily "Arial Black"
        $format = [System.Drawing.StringFormat]::GenericTypographic
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddString($Text, $family, [int][System.Drawing.FontStyle]::Regular, ($Size * 96 / 72), (New-Object System.Drawing.PointF 512, $Y), $format)
        $glow = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(82, 0, 210, 255)), 17
        $glow.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
        $g.DrawPath($glow, $path)
        $glow.Dispose()
        $outline = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 0, 20, 52)), 9
        $outline.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
        $g.DrawPath($outline, $path)
        $outline.Dispose()
        $fill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 247, 253, 255))
        $g.FillPath($fill, $path)
        $fill.Dispose()
        $path.Dispose()
        $family.Dispose()
    }

    Add-CenteredTextPath -Text "SCICON" -Y 48 -Size 96
    Add-CenteredTextPath -Text "SHOOTER" -Y 158 -Size 86

    $tagFont = New-Object System.Drawing.Font "Bahnschrift SemiBold Condensed", 31, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $tagFormat = New-Object System.Drawing.StringFormat
    $tagFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $tagFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    $tagShadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 0, 10, 28))
    $g.DrawString("PLAY GAMES.  FUND SCIENCE.", $tagFont, $tagShadow, (New-Object System.Drawing.RectangleF 2, 291, 1024, 55), $tagFormat)
    $tagBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Rectangle 240, 290, 544, 55), [System.Drawing.Color]::FromArgb(255, 48, 225, 255), [System.Drawing.Color]::FromArgb(255, 126, 255, 50), 0)
    $g.DrawString("PLAY GAMES.  FUND SCIENCE.", $tagFont, $tagBrush, (New-Object System.Drawing.RectangleF 0, 287, 1024, 55), $tagFormat)
    $tagBrush.Dispose(); $tagShadow.Dispose(); $tagFormat.Dispose(); $tagFont.Dispose()

    # Action elements are kept to the sides so the title and real player ship remain the focal points.
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.DrawImage($drone1, 82, 405, 122, 122)
    $g.DrawImage($drone4, 824, 390, 120, 120)
    $g.DrawImage($drone1, 110, 650, 88, 88)
    $g.DrawImage($drone4, 833, 670, 86, 86)
    $g.DrawImage($asteroid2, 46, 785, 105, 105)
    $g.DrawImage($asteroid4, 870, 800, 102, 102)
    $g.DrawImage($rsc, 202, 522, 54, 54)
    $g.DrawImage($rsc, 773, 557, 54, 54)

    # Neon projectile lanes echo the reference's energetic gameplay without copying its layout.
    foreach ($lane in @(
        @{x1=402;y1=610;x2=350;y2=440;c=[System.Drawing.Color]::FromArgb(255,31,226,255)},
        @{x1=480;y1=585;x2=462;y2=390;c=[System.Drawing.Color]::FromArgb(255,31,226,255)},
        @{x1=552;y1=585;x2=576;y2=395;c=[System.Drawing.Color]::FromArgb(255,120,255,39)},
        @{x1=622;y1=610;x2=682;y2=445;c=[System.Drawing.Color]::FromArgb(255,120,255,39)}
    )) {
        $outer = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(75, $lane.c.R, $lane.c.G, $lane.c.B)), 17
        $outer.StartCap = $outer.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $g.DrawLine($outer, $lane.x1, $lane.y1, $lane.x2, $lane.y2)
        $outer.Dispose()
        $inner = New-Object System.Drawing.Pen $lane.c, 6
        $inner.StartCap = $inner.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $g.DrawLine($inner, $lane.x1, $lane.y1, $lane.x2, $lane.y2)
        $inner.Dispose()
    }

    # Preserve the real ResearchHub ship exactly; only scale its native sprite.
    $shipGlowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $shipGlowPath.AddEllipse(255, 440, 514, 514)
    $shipGlow = New-Object System.Drawing.Drawing2D.PathGradientBrush $shipGlowPath
    $shipGlow.CenterColor = [System.Drawing.Color]::FromArgb(92, 0, 211, 255)
    $shipGlow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 16, 75))
    $g.FillEllipse($shipGlow, 255, 440, 514, 514)
    $shipGlow.Dispose(); $shipGlowPath.Dispose()
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.DrawImage($ship, 282, 470, 460, 460)

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq "image/jpeg"
    $parameters = New-Object System.Drawing.Imaging.EncoderParameters 1
    $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]90)
    $canvas.Save($outputFile, $codec, $parameters)
    $parameters.Dispose()
}
finally {
    foreach ($image in @($rsc, $asteroid4, $asteroid2, $drone4, $drone1, $boss, $ship, $nebula, $stars)) { $image.Dispose() }
    $g.Dispose()
    $canvas.Dispose()
}

$result = Get-Item -LiteralPath $outputFile
if ($result.Length -gt 1MB) { throw "Output exceeds 1 MB: $($result.Length) bytes" }
Write-Output "$($result.FullName)`t$($result.Length) bytes"
