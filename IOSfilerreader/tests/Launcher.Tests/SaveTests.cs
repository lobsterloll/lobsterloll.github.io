using XboxLauncher;
using Xunit;

namespace Launcher.Tests;

public sealed class SaveTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "XboxSaveTests-" + Guid.NewGuid());
    public SaveTests() => Directory.CreateDirectory(directory);
    public void Dispose() => Directory.Delete(directory, true);
    private string FileAt(string name, string content = "test")
    {
        string path = Path.GetFullPath(Path.Combine(directory, name));
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
        return path;
    }

    [Fact]
    public void XeniaReusesSavesForDifferentGamesAndEmulatorFolders()
    {
        string root = Path.Combine(directory, "persistent storage");
        string save = FileAt("persistent storage/content/profile/title/save.dat", "level 7");
        string config = FileAt("persistent storage/xenia.config.toml", "[Storage]\ncontent_root = ''\n");
        var inspection = new Inspection(ConsoleKind.Xbox360, "XDVDFS", "Ready", 0, []);
        foreach (string name in new[] { "first", "second" })
        {
            var info = EmulatorAdapters.CreateStartInfo(inspection, FileAt(name + ".iso"), FileAt(name + "/xenia.exe"), 0, root);
            Assert.Contains("--storage_root=" + root, info.ArgumentList);
            Assert.DoesNotContain(info.ArgumentList, argument => argument.StartsWith("--content_root"));
            Assert.Equal("level 7", File.ReadAllText(save));
            Assert.Equal("[Storage]\ncontent_root = ''\n", File.ReadAllText(config));
        }
    }
    [Fact]
    public void XemuReusesExistingHardDiskWithoutSnapshotMode()
    {
        string hdd = FileAt("hard disk.qcow2", "existing game saves");
        string config = FileAt("xemu.toml", $"[sys.files]\nhdd_path = '{hdd}'\n");
        var inspection = new Inspection(ConsoleKind.OriginalXbox, "XISO", "Ready", 0, []);
        for (int run = 0; run < 2; run++)
        {
            var info = EmulatorAdapters.CreateStartInfo(inspection, FileAt("game.iso"), FileAt("xemu.exe"), 2, config);
            Assert.Contains(config, info.ArgumentList);
            Assert.DoesNotContain("-snapshot", info.ArgumentList);
            Assert.Contains($"hdd_path = '{hdd}'", File.ReadAllText(config));
            Assert.Equal("existing game saves", File.ReadAllText(hdd));
        }
    }
    [Fact]
    public void DiscoversExistingPortableSaveLocations()
    {
        string xemu = FileAt("xemu/xemu.exe");
        string config = FileAt("xemu/xemu.toml");
        Assert.Equal(config, EmulatorAdapters.GetSaveLocation(ConsoleKind.OriginalXbox, xemu));
        string xenia = FileAt("xenia/xenia.exe");
        FileAt("xenia/portable.txt");
        Assert.Equal(Path.GetDirectoryName(xenia), EmulatorAdapters.GetSaveLocation(ConsoleKind.Xbox360, xenia));
    }
}
