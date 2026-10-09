param([switch]$BookingOnly, [switch]$SocialOnly, [switch]$SettingsOnly)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$sourceCode = @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class DashboardAssets
{
    public static void Create(string directory, string screen)
    {
        bool bookingScreen = screen == "booking";
        string reference = bookingScreen ? "Dreamy Sky Booking Dashboard.png" : "Skyline Home Dashboard.png";
        string backgroundName = bookingScreen ? "booking-sky.jpg" : "sky-background.jpg";
        if (screen == "spaces") { reference = "Serene Sky Family Dashboard.png"; backgroundName = "spaces-sky.jpg"; }
        if (screen == "agent") { reference = "Skybound Agent Welcome Interface.png"; backgroundName = "agent-sky.jpg"; }
        if (screen == "community") { reference = "Sky Community Social Feed.png"; backgroundName = "community-sky.jpg"; }
        if (screen == "profile") { reference = "Skyward Profile Dashboard.png"; backgroundName = "profile-sky.jpg"; }
        if (screen == "settings") { reference = "Skybound Account Settings Dashboard.png"; backgroundName = "settings-sky.jpg"; }
        using (var source = new Bitmap(System.IO.Path.Combine(directory, reference)))
        {
            if (source.Width != 1536 || source.Height != 1024)
                throw new InvalidOperationException("Expected the supplied 1536 x 1024 reference.");

            if (bookingScreen)
            {
                Crop(source, new Rectangle(438, 450, 136, 69), directory, "booking-hotel.jpg");
                Crop(source, new Rectangle(438, 558, 136, 71), directory, "booking-flight.jpg");
                Crop(source, new Rectangle(438, 669, 136, 71), directory, "booking-train.jpg");
            }
            else if (screen == "home")
            {
                Crop(source, new Rectangle(1423, 38, 58, 58), directory, "avatar.png");
                Crop(source, new Rectangle(370, 785, 104, 109), directory, "news-travel.jpg");
                Crop(source, new Rectangle(690, 785, 108, 109), directory, "news-lifestyle.jpg");
                Crop(source, new Rectangle(1016, 785, 108, 109), directory, "news-community.jpg");
            }
            else if (screen == "agent")
            {
                SoftCrop(source, new Rectangle(610, 175, 320, 270), directory, "agent-orb.png");
            }
            else if (screen == "community")
            {
                Crop(source, new Rectangle(448, 314, 60, 60), directory, "ananya.jpg");
                Crop(source, new Rectangle(448, 497, 60, 60), directory, "rohit.jpg");
                Crop(source, new Rectangle(448, 676, 60, 60), directory, "meera.jpg");
                Crop(source, new Rectangle(448, 847, 60, 60), directory, "karan.jpg");
                Crop(source, new Rectangle(804, 320, 244, 130), directory, "community-lake.jpg");
                Crop(source, new Rectangle(804, 503, 244, 126), directory, "community-friends.jpg");
                Crop(source, new Rectangle(804, 680, 244, 126), directory, "community-drive.jpg");
                Crop(source, new Rectangle(804, 851, 244, 125), directory, "community-mountains.jpg");
            }
            else if (screen == "profile")
            {
                Crop(source, new Rectangle(380, 127, 152, 152), directory, "profile-portrait.jpg");
                Crop(source, new Rectangle(375, 630, 188, 76), directory, "space-family.jpg");
                Crop(source, new Rectangle(576, 630, 187, 76), directory, "space-friends.jpg");
                Crop(source, new Rectangle(775, 630, 187, 76), directory, "space-travel.jpg");
                Crop(source, new Rectangle(976, 630, 187, 76), directory, "space-work.jpg");
            }

            var regions = bookingScreen ? new Rectangle[] {
                new Rectangle(45, 23, 91, 89),
                new Rectangle(1409, 24, 88, 88),
                new Rectangle(46, 119, 315, 709),
                new Rectangle(386, 124, 815, 123),
                new Rectangle(386, 241, 1037, 119),
                new Rectangle(386, 358, 1038, 425),
                new Rectangle(386, 777, 1038, 185)
            } : new Rectangle[] {
                new Rectangle(682, 24, 173, 81),
                new Rectangle(1105, 19, 229, 91),
                new Rectangle(1334, 23, 79, 83),
                new Rectangle(1410, 24, 87, 88),
                new Rectangle(44, 168, 246, 323),
                new Rectangle(329, 173, 509, 251),
                new Rectangle(828, 173, 516, 251),
                new Rectangle(329, 412, 509, 294),
                new Rectangle(828, 412, 516, 294),
                new Rectangle(329, 697, 1016, 241)
            };

            if (screen == "spaces") regions = new Rectangle[] {
                new Rectangle(45, 20, 93, 91), new Rectangle(1210, 20, 176, 88),
                new Rectangle(1410, 24, 87, 88), new Rectangle(43, 151, 215, 328),
                new Rectangle(397, 373, 467, 192), new Rectangle(401, 554, 484, 58),
                new Rectangle(403, 620, 728, 100)
            };
            if (screen == "agent") regions = new Rectangle[] {
                new Rectangle(45, 20, 93, 91), new Rectangle(1210, 20, 176, 88),
                new Rectangle(1410, 24, 87, 88), new Rectangle(599, 176, 340, 260),
                new Rectangle(690, 450, 157, 36), new Rectangle(632, 488, 289, 110),
                new Rectangle(486, 566, 577, 84), new Rectangle(367, 688, 807, 100),
                new Rectangle(434, 793, 654, 78)
            };
            if (screen == "community") regions = new Rectangle[] {
                new Rectangle(45, 20, 93, 91), new Rectangle(1174, 20, 212, 87),
                new Rectangle(1410, 24, 87, 88), new Rectangle(574, 98, 339, 108),
                new Rectangle(494, 204, 549, 92), new Rectangle(1157, 131, 231, 92),
                new Rectangle(409, 284, 716, 726)
            };
            if (screen == "profile") regions = new Rectangle[] {
                new Rectangle(25, 11, 258, 81), new Rectangle(1328, 11, 169, 90),
                new Rectangle(340, 87, 861, 918)
            };
            if (screen == "settings") regions = new Rectangle[] {
                new Rectangle(25, 11, 265, 81), new Rectangle(1325, 11, 174, 90),
                new Rectangle(32, 99, 385, 738), new Rectangle(418, 91, 1088, 923)
            };

            const int scale = 6;
            int width = source.Width / scale;
            int height = (int)Math.Ceiling(source.Height / (double)scale);
            var red = new float[width * height];
            var green = new float[width * height];
            var blue = new float[width * height];
            var masked = new bool[width * height];

            using (var small = new Bitmap(width, height))
            {
                using (var graphics = Graphics.FromImage(small))
                {
                    graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    graphics.DrawImage(source, 0, 0, width, height);
                }

                for (int row = 0; row < height; row++)
                for (int column = 0; column < width; column++)
                {
                    int index = row * width + column;
                    Color color = small.GetPixel(column, row);
                    foreach (Rectangle region in regions)
                    {
                        if (region.Contains(column * scale, row * scale))
                            masked[index] = true;
                    }
                    red[index] = masked[index] ? 127 : color.R;
                    green[index] = masked[index] ? 188 : color.G;
                    blue[index] = masked[index] ? 237 : color.B;
                }

                for (int iteration = 0; iteration < 2600; iteration++)
                for (int row = 1; row < height - 1; row++)
                for (int column = 1; column < width - 1; column++)
                {
                    int index = row * width + column;
                    if (!masked[index]) continue;
                    red[index] = (red[index - 1] + red[index + 1] + red[index - width] + red[index + width]) * 0.25f;
                    green[index] = (green[index - 1] + green[index + 1] + green[index - width] + green[index + width]) * 0.25f;
                    blue[index] = (blue[index - 1] + blue[index + 1] + blue[index - width] + blue[index + width]) * 0.25f;
                }

                for (int row = 0; row < height; row++)
                for (int column = 0; column < width; column++)
                {
                    int index = row * width + column;
                    small.SetPixel(column, row, Color.FromArgb((int)red[index], (int)green[index], (int)blue[index]));
                }

                using (var fill = new Bitmap(source.Width, source.Height))
                using (var result = new Bitmap(source))
                {
                    using (var graphics = Graphics.FromImage(fill))
                    {
                        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        graphics.DrawImage(small, 0, 0, source.Width, source.Height);
                    }

                    var opacityMap = new float[source.Width * source.Height];
                    foreach (Rectangle region in regions)
                    for (int row = region.Top; row < region.Bottom; row++)
                    for (int column = region.Left; column < region.Right; column++)
                    {
                        int distance = Math.Min(Math.Min(column - region.Left, region.Right - 1 - column),
                            Math.Min(row - region.Top, region.Bottom - 1 - row));
                        float opacity = Math.Min(1f, distance / 8f);
                        int index = row * source.Width + column;
                        opacityMap[index] = Math.Max(opacityMap[index], opacity);
                    }

                    for (int row = 0; row < source.Height; row++)
                    for (int column = 0; column < source.Width; column++)
                    {
                        float opacity = opacityMap[row * source.Width + column];
                        if (opacity == 0) continue;
                        Color original = source.GetPixel(column, row);
                        Color replacement = fill.GetPixel(column, row);
                        result.SetPixel(column, row, Color.FromArgb(
                            (int)(original.R * (1 - opacity) + replacement.R * opacity),
                            (int)(original.G * (1 - opacity) + replacement.G * opacity),
                            (int)(original.B * (1 - opacity) + replacement.B * opacity)));
                    }

                    result.Save(System.IO.Path.Combine(directory, backgroundName), ImageFormat.Jpeg);
                }
            }
        }
    }

    private static void Crop(Bitmap source, Rectangle bounds, string directory, string name)
    {
        using (var image = source.Clone(bounds, PixelFormat.Format24bppRgb))
            image.Save(System.IO.Path.Combine(directory, name), name.EndsWith(".png") ? ImageFormat.Png : ImageFormat.Jpeg);
    }

    private static void SoftCrop(Bitmap source, Rectangle bounds, string directory, string name)
    {
        using (var image = source.Clone(bounds, PixelFormat.Format32bppArgb))
        {
            for (int row = 0; row < image.Height; row++)
            for (int column = 0; column < image.Width; column++)
            {
                int distance = Math.Min(Math.Min(column, image.Width - 1 - column), Math.Min(row, image.Height - 1 - row));
                int opacity = (int)(255 * Math.Min(1f, distance / 35f));
                Color color = image.GetPixel(column, row);
                image.SetPixel(column, row, Color.FromArgb(opacity, color.R, color.G, color.B));
            }
            image.Save(System.IO.Path.Combine(directory, name), ImageFormat.Png);
        }
    }
}
'@

$typeName = 'DashboardAssets' + [Guid]::NewGuid().ToString('N')
$assetType = Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $sourceCode.Replace('DashboardAssets', $typeName) -PassThru
$imageDirectory = Join-Path $PSScriptRoot 'image'
$assetNames = @()

if (-not $BookingOnly -and -not $SocialOnly -and -not $SettingsOnly) {
    $assetType::Create($imageDirectory, 'home')
    $assetNames += @('sky-background.jpg', 'avatar.png', 'news-travel.jpg', 'news-lifestyle.jpg', 'news-community.jpg')
}
if (-not $SocialOnly -and -not $SettingsOnly) {
    $assetType::Create($imageDirectory, 'booking')
    $assetNames += @('booking-sky.jpg', 'booking-hotel.jpg', 'booking-flight.jpg', 'booking-train.jpg')
}
if (-not $BookingOnly -and -not $SettingsOnly) {
    foreach ($screen in @('spaces', 'agent', 'community', 'profile')) {
        $assetType::Create($imageDirectory, $screen)
    }
    $assetNames += @('spaces-sky.jpg', 'agent-sky.jpg', 'community-sky.jpg', 'profile-sky.jpg', 'agent-orb.png', 'profile-portrait.jpg', 'ananya.jpg', 'rohit.jpg', 'meera.jpg', 'karan.jpg', 'community-lake.jpg', 'community-friends.jpg', 'community-drive.jpg', 'community-mountains.jpg', 'space-family.jpg', 'space-friends.jpg', 'space-travel.jpg', 'space-work.jpg')
}
if ($SettingsOnly -or (-not $BookingOnly -and -not $SocialOnly)) {
    $assetType::Create($imageDirectory, 'settings')
    $assetNames += 'settings-sky.jpg'
}

foreach ($name in $assetNames) {
    $path = Join-Path $imageDirectory $name
    $image = [System.Drawing.Image]::FromFile($path)
    Write-Output "$name : $($image.Width) x $($image.Height)"
    $image.Dispose()
}