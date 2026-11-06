using System.Buffers.Binary;
using System.Text;
using XboxLauncher;
using Xunit;

namespace Launcher.Tests;

public sealed class LauncherTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "XboxLauncherTests", Guid.NewGuid().ToString());
    public LauncherTests() => Directory.CreateDirectory(directory);
    public void Dispose() => Directory.Delete(directory, true);
    private string Image(bool xbox360 = false, long partition = 0)
    {
        string path = Path.Combine(directory, Guid.NewGuid() + ".iso");
        using var file = File.Create(path);
        file.SetLength(partition + 36 * 2048);
        var descriptor = new byte[2048];
        "MICROSOFT*XBOX*MEDIA"u8.CopyTo(descriptor);
        "MICROSOFT*XBOX*MEDIA"u8.CopyTo(descriptor.AsSpan(2028));
        BinaryPrimitives.WriteUInt32LittleEndian(descriptor.AsSpan(20), 33);
        BinaryPrimitives.WriteUInt32LittleEndian(descriptor.AsSpan(24), 64);
        file.Position = partition + 32 * 2048;
        file.Write(descriptor);
        var entry = new byte[64];
        BinaryPrimitives.WriteUInt32LittleEndian(entry.AsSpan(4), 34);
        BinaryPrimitives.WriteUInt32LittleEndian(entry.AsSpan(8), 4);
        string name = xbox360 ? "default.xex" : "default.xbe";
        entry[13] = (byte)name.Length;
        Encoding.ASCII.GetBytes(name).CopyTo(entry, 14);
        file.Position = partition + 33 * 2048;
        file.Write(entry);
        file.Position = partition + 34 * 2048;
        file.Write(xbox360 ? "XEX2"u8 : "XBEH"u8);
        return path;
    }
    [Theory]
    [InlineData(false, 0L, ConsoleKind.OriginalXbox)]
    [InlineData(true, 0L, ConsoleKind.Xbox360)]
    [InlineData(true, 0x2080000L, ConsoleKind.Xbox360)]
    [InlineData(true, 0xFD90000L, ConsoleKind.Xbox360)]
    public void DetectsBootSignatureAndListsFilesWithoutChangingImage(bool xbox360, long partition, ConsoleKind expected)
    {
        string path = Image(xbox360, partition);
        var before = File.GetLastWriteTimeUtc(path);
        var result = DiscReader.Inspect(path);
        Assert.Equal(expected, result.Console);
        Assert.True(result.CanLaunch);
        Assert.Single(result.Files);
        Assert.Equal(partition + 34 * 2048, result.Files[0].Offset);
        Assert.Equal(before, File.GetLastWriteTimeUtc(path));
    }
    [Fact]
    public void RejectsOutOfBoundsFile()
    {
        string path = Image();
        using (var file = File.OpenWrite(path)) { file.Position = 33 * 2048 + 4; file.Write(new byte[] { 255, 255, 255, 255 }); }
        Assert.Throws<InvalidDataException>(() => DiscReader.Inspect(path));
    }
    [Fact]
    public void RejectsDirectoryCycle()
    {
        string path = Image();
        using (var file = File.OpenWrite(path)) { file.Position = 33 * 2048 + 2; file.Write(new byte[] { 1, 0 }); }
        Assert.Throws<InvalidDataException>(() => DiscReader.Inspect(path));
    }
    [Fact]
    public void DoesNotTrustIsoExtensionOrFullDiscForXemu()
    {
        string unknown = Path.Combine(directory, "Xbox Series.iso");
        File.WriteAllText(unknown, "not a disc");
        Assert.False(DiscReader.Inspect(unknown).CanLaunch);
        Assert.False(DiscReader.Inspect(Image(false, 0x20600)).CanLaunch);
    }
    [Fact]
    public void PersistsDeduplicatesAndRemovesOnlyLibraryEntry()
    {
        string database = Path.Combine(directory, "library.db");
        string path = Image();
        var library = new Library(database);
        var game = new Game(path, "Test's title", ConsoleKind.OriginalXbox, "XISO", "Ready");
        library.Save(game);
        library.Save(game with { Path = path.ToUpperInvariant() });
        library.SetSetting("xemu", "C:\\Emulators\\xemu.exe");
        var reopened = new Library(database);
        Assert.Equal(game, Assert.Single(reopened.Load()));
        Assert.Equal("C:\\Emulators\\xemu.exe", reopened.GetSetting("xemu"));
        reopened.Remove(path);
        Assert.Empty(reopened.Load());
        Assert.True(File.Exists(path));
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void CreatesSeparatedArgumentsAndEmulatorWorkingDirectory(bool xbox360)
    {
        string path = Image(xbox360);
        string emulator = Path.Combine(directory, "emulator with spaces.exe");
        File.WriteAllText(emulator, "test placeholder");
        var info = EmulatorAdapters.CreateStartInfo(DiscReader.Inspect(path), path, emulator);
        Assert.False(info.UseShellExecute);
        Assert.Equal(path, info.ArgumentList.Last());
        Assert.Equal(xbox360 ? 1 : 2, info.ArgumentList.Count);
        Assert.Equal(directory, info.WorkingDirectory);
    }
    [Theory]
    [InlineData(ConsoleKind.XboxOne)]
    [InlineData(ConsoleKind.XboxSeries)]
    [InlineData(ConsoleKind.Unknown)]
    public void BlocksUnsupportedGenerations(ConsoleKind kind) => Assert.Throws<InvalidOperationException>(() => EmulatorAdapters.CreateStartInfo(new(kind, "Unsupported", "Unsupported generation", 0, []), "unused", "unused"));
}
