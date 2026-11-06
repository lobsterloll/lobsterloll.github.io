using XboxLauncher;
using Xunit;

namespace Launcher.Tests;

public class ResolutionTests
{
    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void PreservesFirmwareAndOtherSections(int scale)
    {
        string original = "[sys.files]\nflashrom_path = 'my firmware.bin'\n[display.quality]\nsurface_scale = 4 # existing\n[display.window]\nstartup_size = '1280x960'\n";
        string updated = EmulatorAdapters.SetXemuResolution(original, scale);
        Assert.Contains("flashrom_path = 'my firmware.bin'", updated);
        Assert.Contains($"surface_scale = {scale} # existing", updated);
        Assert.Contains("[display.window]\nstartup_size = '1280x960'", updated);
        Assert.Equal(updated, EmulatorAdapters.SetXemuResolution(updated, scale));
    }
    [Theory]
    [InlineData("")]
    [InlineData("[sys.files]\nhdd_path = 'disk.qcow2'\n")]
    [InlineData("[display.quality]\n# no scale yet\n[sys]\nmem_limit = '64'\n")]
    public void AddsMissingScaleWithoutDuplicateSections(string original)
    {
        string updated = EmulatorAdapters.SetXemuResolution(original, 2);
        Assert.Contains("surface_scale = 2", updated);
        Assert.Equal(2, updated.Split("[display.quality]").Length);
        Assert.Equal(updated, EmulatorAdapters.SetXemuResolution(updated, 2));
    }
    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void XeniaGetsBothResolutionArguments(int scale)
    {
        string directory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(directory);
        try
        {
            string exe = Path.Combine(directory, "xenia.exe");
            string iso = Path.Combine(directory, "game.iso");
            File.WriteAllText(exe, "test");
            File.WriteAllText(iso, "test");
            var info = EmulatorAdapters.CreateStartInfo(new(ConsoleKind.Xbox360, "XDVDFS", "Ready", 0, []), iso, exe, scale);
            Assert.Equal(new[] { $"--draw_resolution_scale_x={scale}", $"--draw_resolution_scale_y={scale}", iso }, info.ArgumentList);
        }
        finally { Directory.Delete(directory, true); }
    }
}
