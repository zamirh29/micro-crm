# Pad a phone screenshot so Google Play's 2:1 aspect-ratio limit is met.
#
# Play requires: 24-bit PNG or JPEG, min side >= 320 px, max side <= 3840 px,
# and the long side no more than twice the short side. Modern phones are ~20:9
# (2.22:1), so a raw capture is rejected. This repeats the first/last pixel of
# every row into a side band - no cropping, no stretching, no visible seam.
#
#   powershell -File prepare-screenshot.ps1 -In raw.jpg -Out shot.png
#   powershell -File prepare-screenshot.ps1 -In raw.jpg -Out shot.png -TrimTop 0

param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$TrimTop = 0
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ShotPad
{
    public static void Run(string inPath, string outPath, int trimTop, int pad)
    {
        using (var src = new Bitmap(inPath))
        {
            int w = src.Width;
            int h = src.Height - trimTop;
            using (var dst = new Bitmap(w + pad * 2, h, PixelFormat.Format24bppRgb))
            {
                var srcRect = new Rectangle(0, trimTop, w, h);
                var sData = src.LockBits(srcRect, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
                var dData = dst.LockBits(new Rectangle(0, 0, dst.Width, h), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
                try
                {
                    int sStride = sData.Stride, dStride = dData.Stride;
                    int rowBytes = w * 3;
                    byte[] row = new byte[rowBytes];
                    byte[] bandL = new byte[pad * 3];
                    byte[] bandR = new byte[pad * 3];

                    for (int y = 0; y < h; y++)
                    {
                        IntPtr sRow = IntPtr.Add(sData.Scan0, y * sStride);
                        IntPtr dRow = IntPtr.Add(dData.Scan0, y * dStride);
                        Marshal.Copy(sRow, row, 0, rowBytes);

                        for (int i = 0; i < pad; i++)
                        {
                            bandL[i * 3] = row[0];
                            bandL[i * 3 + 1] = row[1];
                            bandL[i * 3 + 2] = row[2];
                            bandR[i * 3] = row[rowBytes - 3];
                            bandR[i * 3 + 1] = row[rowBytes - 2];
                            bandR[i * 3 + 2] = row[rowBytes - 1];
                        }

                        Marshal.Copy(bandL, 0, dRow, pad * 3);
                        Marshal.Copy(row, 0, IntPtr.Add(dRow, pad * 3), rowBytes);
                        Marshal.Copy(bandR, 0, IntPtr.Add(dRow, pad * 3 + rowBytes), pad * 3);
                    }
                }
                finally
                {
                    src.UnlockBits(sData);
                    dst.UnlockBits(dData);
                }
                dst.Save(outPath, ImageFormat.Png);
            }
        }
    }
}
"@

$img = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $In))
$w = $img.Width
$h = $img.Height - $TrimTop
$img.Dispose()

# +4 px of slack so rounding never lands on 2.000 and trips a validator.
$pad = [int][math]::Ceiling(($h / 2 - $w) / 2) + 4
if ($pad -lt 0) { $pad = 0 }

[ShotPad]::Run((Resolve-Path -LiteralPath $In), $Out, $TrimTop, $pad)

$check = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Out))
[pscustomobject]@{
  File = (Split-Path -Leaf $Out)
  Width = $check.Width
  Height = $check.Height
  LongOverShort = [math]::Round([math]::Max($check.Width, $check.Height) / [math]::Min($check.Width, $check.Height), 3)
  Format = $check.PixelFormat
  KB = [math]::Round((Get-Item -LiteralPath $Out).Length / 1KB)
} | Format-Table -AutoSize
$check.Dispose()
