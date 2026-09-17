$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$res = Join-Path $PSScriptRoot '../android/app/src/main/res'

function Fill-Polygon($Graphics, [string]$Color, [float[]]$Coordinates) {
    $points = for ($i = 0; $i -lt $Coordinates.Length; $i += 2) {
        [System.Drawing.PointF]::new($Coordinates[$i], $Coordinates[$i + 1])
    }
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($Color))
    try { $Graphics.FillPolygon($brush, [System.Drawing.PointF[]]$points) }
    finally { $brush.Dispose() }
}

function Write-Asset([string]$Path, [int]$Width, [int]$Height, [scriptblock]$Draw) {
    # Supersample the code-native Vela shapes for clean small launcher icons.
    $large = [System.Drawing.Bitmap]::new($Width * 4, $Height * 4)
    $graphics = [System.Drawing.Graphics]::FromImage($large)
    $bitmap = [System.Drawing.Bitmap]::new($Width, $Height)
    $output = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.ScaleTransform(4, 4)
        & $Draw $graphics
        $output.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $output.DrawImage($large, 0, 0, $Width, $Height)
        New-Item -ItemType Directory -Path (Split-Path $Path) -Force | Out-Null
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $output.Dispose(); $bitmap.Dispose(); $graphics.Dispose(); $large.Dispose()
    }
}

function Write-Icon([string]$Path, [int]$Size, [bool]$Foreground = $false) {
    Write-Asset $Path $Size $Size {
        param($g)
        $g.ScaleTransform($Size / 108.0, $Size / 108.0)
        if (-not $Foreground) { $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#0d2631')) }
        Fill-Polygon $g '#58f4d5' @(21,30, 36,30, 55,66, 73,30, 89,30, 60,82, 49,82)
        Fill-Polygon $g '#f0fffb' @(62,30, 80,20, 72,40)
    }
}

foreach ($density in @(
    @{Name='mdpi'; Size=48; Foreground=108},
    @{Name='hdpi'; Size=72; Foreground=162},
    @{Name='xhdpi'; Size=96; Foreground=216},
    @{Name='xxhdpi'; Size=144; Foreground=324},
    @{Name='xxxhdpi'; Size=192; Foreground=432}
)) {
    $dir = Join-Path $res ('mipmap-' + $density.Name)
    Write-Icon (Join-Path $dir 'ic_launcher.png') $density.Size
    Write-Icon (Join-Path $dir 'ic_launcher_round.png') $density.Size
    Write-Icon (Join-Path $dir 'ic_launcher_foreground.png') $density.Foreground $true
}

# Fire TV's launcher can read bitmaps without vector/adaptive-icon support.
Write-Icon (Join-Path $res 'drawable-nodpi/vela_launcher.png') 512
Write-Asset (Join-Path $res 'drawable-nodpi/vela_tv_banner.png') 1280 720 {
    param($g)
    $g.ScaleTransform(4, 4)
    $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#0d2631'))
    Fill-Polygon $g '#143743' @(230,0, 320,0, 320,180, 140,180)
    Fill-Polygon $g '#58f4d5' @(38,67, 52,67, 69,100, 85,67, 99,67, 75,113, 64,113)
    Fill-Polygon $g '#f0fffb' @(76,65, 94,55, 86,75)
    Fill-Polygon $g '#f3f8fb' @(121,75, 130,75, 140,101, 150,75, 159,75, 144,112, 135,112)
    Fill-Polygon $g '#f3f8fb' @(165,75, 191,75, 191,82, 173,82, 173,89, 189,89, 189,96, 173,96, 173,105, 192,105, 192,112, 165,112)
    Fill-Polygon $g '#f3f8fb' @(199,75, 207,75, 207,104, 226,104, 226,112, 199,112)
    Fill-Polygon $g '#f3f8fb' @(245,75, 254,75, 269,112, 260,112, 257,104, 242,104, 239,112, 230,112)
    Fill-Polygon $g '#143743' @(245,97, 254,97, 250,85)
}
Write-Output 'Generated all Vela launcher icons and the Fire TV banner.'
