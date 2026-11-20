# ASCII-only icon generator (PowerShell 5.1 safe, no BOM issues)
Add-Type -AssemblyName System.Drawing
$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# circle background, brand teal #00CCBB
$bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 187, 170))
$g.FillEllipse($bg, 24, 24, 464, 464)
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 255, 255, 255), 8)
$g.DrawEllipse($pen, 52, 52, 408, 408)

# glyph: U+6EAF (su hui)
$glyph = [string][char]0x6EAF
$font = New-Object System.Drawing.Font('Microsoft YaHei', 240, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF(0, -8, 512, 512)
$g.DrawString($glyph, $font, $fg, $rect, $fmt)

$g.Dispose()
New-Item -ItemType Directory -Force -Path 'resources' | Out-Null
$outPath = Join-Path (Get-Location) 'resources\icon.png'
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "icon.png generated: $outPath"
