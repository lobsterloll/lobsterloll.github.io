using System.IO.Compression;
using System.Security.Cryptography;
using XboxLauncher.Setup;
using Xunit;

namespace Launcher.Tests;

public sealed class InstallerTests : IDisposable
{
    private readonly string folder = Path.Combine(Path.GetTempPath(), "XboxSetupTests-" + Guid.NewGuid());
    public InstallerTests() => Directory.CreateDirectory(folder);
    public void Dispose() => Directory.Delete(folder, true);

    [Theory]
    [InlineData("xemu.exe")]
    [InlineData("../escape.exe")]
    public void ExtractsVerifiedArchiveAndBlocksTraversal(string entryName)
    {
        string archive = Path.Combine(folder, "test.zip");
        using (var zip = ZipFile.Open(archive, ZipArchiveMode.Create))
        using (var writer = new StreamWriter(zip.CreateEntry(entryName).Open())) writer.Write("synthetic executable");
        string hash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(archive)));
        string output = Path.Combine(folder, "extracted");
        if (entryName.Contains(".."))
        {
            Assert.Throws<IOException>(() => Installer.VerifyAndExtract(archive, output, hash));
            Assert.False(File.Exists(Path.Combine(folder, "escape.exe")));
        }
        else
        {
            Installer.VerifyAndExtract(archive, output, hash);
            Assert.Equal("synthetic executable", File.ReadAllText(Path.Combine(output, entryName)));
        }
    }
    [Fact]
    public void RejectsChecksumMismatchBeforeExtraction()
    {
        string archive = Path.Combine(folder, "bad.zip");
        File.WriteAllText(archive, "modified download");
        string output = Path.Combine(folder, "output");
        Assert.Throws<InvalidDataException>(() => Installer.VerifyAndExtract(archive, output, new string('0', 64)));
        Assert.False(Directory.Exists(output));
    }
    [Fact]
    public async Task PreservesNonemptyDestination()
    {
        string marker = Path.Combine(folder, "keep.txt");
        File.WriteAllText(marker, "existing content");
        await Assert.ThrowsAsync<IOException>(() => Installer.InstallAsync(folder, [], new Progress<(string, double)>(), CancellationToken.None));
        Assert.Equal("existing content", File.ReadAllText(marker));
    }
    [Fact]
    public async Task CancellationDoesNotInstallPayload()
    {
        string output = Path.Combine(folder, "install");
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => Installer.InstallAsync(output, [], new Progress<(string, double)>(), new CancellationToken(true)));
        Assert.False(Directory.Exists(output));
    }
}
