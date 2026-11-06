using System.Diagnostics;
using System.Text.RegularExpressions;

namespace XboxLauncher;

public static class EmulatorAdapters
{
    public static ProcessStartInfo CreateStartInfo(Inspection inspection, string image, string emulator, int resolutionScale = 0, string? saveLocation = null)
    {
        if (resolutionScale is < 0 or > 2) throw new ArgumentOutOfRangeException(nameof(resolutionScale));
        if (!inspection.CanLaunch) throw new InvalidOperationException(inspection.Status);
        if (!File.Exists(image)) throw new FileNotFoundException("The game image has moved or is unavailable.", image);
        if (!File.Exists(emulator) || !Path.GetExtension(emulator).Equals(".exe", StringComparison.OrdinalIgnoreCase))
            throw new FileNotFoundException("Choose the emulator's Windows executable first.", emulator);
        var info = new ProcessStartInfo(Path.GetFullPath(emulator))
        {
            UseShellExecute = false,
            WorkingDirectory = Path.GetDirectoryName(Path.GetFullPath(emulator))!
        };
        if (inspection.Console == ConsoleKind.OriginalXbox)
        {
            if (resolutionScale != 0 || saveLocation != null)
            {
                string config = saveLocation ?? GetSaveLocation(inspection.Console, emulator);
                Directory.CreateDirectory(Path.GetDirectoryName(config)!);
                string original = File.Exists(config) ? File.ReadAllText(config) : "";
                string updated = resolutionScale == 0 ? original : SetXemuResolution(original, resolutionScale);
                if (updated != original)
                {
                    if (File.Exists(config) && !File.Exists(config + ".launcher-backup")) File.Copy(config, config + ".launcher-backup");
                    File.WriteAllText(config, updated);
                }
                info.ArgumentList.Add("-config_path");
                info.ArgumentList.Add(config);
            }
            info.ArgumentList.Add("-dvd_path");
        }
        else
        {
            if (saveLocation != null)
            {
                Directory.CreateDirectory(saveLocation);
                info.ArgumentList.Add("--storage_root=" + Path.GetFullPath(saveLocation));
            }
            if (resolutionScale != 0)
            {
                info.ArgumentList.Add($"--draw_resolution_scale_x={resolutionScale}");
                info.ArgumentList.Add($"--draw_resolution_scale_y={resolutionScale}");
            }
        }
        info.ArgumentList.Add(Path.GetFullPath(image));
        return info;
    }

    public static string GetSaveLocation(ConsoleKind console, string emulator)
    {
        string directory = Path.GetDirectoryName(Path.GetFullPath(emulator))!;
        if (console == ConsoleKind.OriginalXbox)
        {
            string portable = Path.Combine(directory, "xemu.toml");
            return File.Exists(portable) ? portable : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "xemu", "xemu", "xemu.toml");
        }
        if (console == ConsoleKind.Xbox360)
            return File.Exists(Path.Combine(directory, "portable.txt")) ? directory : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Xenia");
        throw new InvalidOperationException("This console has no supported save storage.");
    }

    public static string SetXemuResolution(string config, int scale)
    {
        if (scale is < 1 or > 2) throw new ArgumentOutOfRangeException(nameof(scale));
        var section = Regex.Match(config, @"(?m)^\[display\.quality\][ \t]*(?:#[^\r\n]*)?\r?$[\s\S]*?(?=^\[|\z)");
        if (!section.Success) return config.TrimEnd() + $"\n\n[display.quality]\nsurface_scale = {scale}\n";
        string body = section.Value;
        var value = new Regex(@"(?m)^(surface_scale[ \t]*=[ \t]*)\d+");
        body = value.IsMatch(body) ? value.Replace(body, match => match.Groups[1].Value + scale) : body.TrimEnd() + $"\nsurface_scale = {scale}\n";
        return config[..section.Index] + body + config[(section.Index + section.Length)..];
    }
}
