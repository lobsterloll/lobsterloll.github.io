using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;

namespace XboxLauncher.Setup;

public record EmulatorDownload(string Name, string Url, string Sha256, string Executable);

public static class Installer
{
    public static readonly EmulatorDownload Xemu = new("xemu", "https://github.com/xemu-project/xemu/releases/download/v0.8.139/xemu-0.8.139-windows-x86_64.zip", "fbb14dd7ea08120ca9ec99c955758786645af16a5058250553b3b7d7592e8701", "xemu.exe");
    public static readonly EmulatorDownload Xenia = new("Xenia", "https://github.com/xenia-project/release-builds-windows/releases/download/v1.0.2844-master/xenia_master.zip", "6d41aa4bef26b395b0d48230dc4be6c43cf6ba0a93f43c0674ca2f7150f846e0", "xenia.exe");

    public static void VerifyAndExtract(string archive, string destination, string sha256)
    {
        using (var file = File.OpenRead(archive))
        {
            if (!Convert.ToHexString(SHA256.HashData(file)).Equals(sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Emulator download checksum failed. Installation stopped; retry the download.");
        }
        ZipFile.ExtractToDirectory(archive, destination);
    }

    public static async Task InstallAsync(string destination, IEnumerable<EmulatorDownload> emulators, IProgress<(string Message, double Percent)> progress, CancellationToken cancellation)
    {
        destination = Path.GetFullPath(destination);
        // A dedicated folder avoids overwriting unrelated files and makes removal straightforward.
        if (Directory.Exists(destination) && Directory.EnumerateFileSystemEntries(destination).Any())
            throw new IOException("Choose an empty installation folder. Your existing installation and library will be kept.");
        string staging = Path.Combine(Path.GetTempPath(), "XboxLauncherSetup-" + Guid.NewGuid());
        Directory.CreateDirectory(staging);
        var installedPaths = new Dictionary<string, string>();
        try
        {
            var selected = emulators.ToList();
            using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd("XboxUniversalLauncher-Setup/1.0");
            for (int i = 0; i < selected.Count; i++)
            {
                var emulator = selected[i];
                string archive = Path.Combine(staging, emulator.Name + ".zip");
                using (var response = await client.GetAsync(emulator.Url, HttpCompletionOption.ResponseHeadersRead, cancellation))
                {
                    response.EnsureSuccessStatusCode();
                    long total = response.Content.Headers.ContentLength ?? 0;
                    await using var input = await response.Content.ReadAsStreamAsync(cancellation);
                    await using var output = File.Create(archive);
                    var buffer = new byte[81920];
                    long downloaded = 0;
                    int count;
                    while ((count = await input.ReadAsync(buffer, cancellation)) != 0)
                    {
                        await output.WriteAsync(buffer.AsMemory(0, count), cancellation);
                        downloaded += count;
                        double fraction = total > 0 ? Math.Min(1, (double)downloaded / total) : 0;
                        progress.Report(($"Downloading {emulator.Name}: {downloaded / 1048576.0:F1} MB", (i + fraction) / (selected.Count + 1) * 90));
                    }
                }
                cancellation.ThrowIfCancellationRequested();
                progress.Report(($"Verifying and installing {emulator.Name}…", (i + 1.0) / (selected.Count + 1) * 90));
                string emulatorDirectory = Path.Combine(staging, "Emulators", emulator.Name);
                await Task.Run(() => VerifyAndExtract(archive, emulatorDirectory, emulator.Sha256), cancellation);
                string exe = Directory.GetFiles(emulatorDirectory, emulator.Executable, SearchOption.AllDirectories).Single();
                installedPaths.Add(emulator.Name, Path.GetRelativePath(staging, exe));
                File.Delete(archive);
            }
            cancellation.ThrowIfCancellationRequested();
            progress.Report(("Installing Xbox Universal Launcher…", 90));
            using (var payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("LauncherPayload") ?? throw new IOException("Launcher payload is missing."))
            await using (var output = File.Create(Path.Combine(staging, "XboxUniversalLauncher.exe")))
                await payload.CopyToAsync(output, cancellation);
            await File.WriteAllTextAsync(Path.Combine(staging, "INSTALLATION.txt"),
                "Run XboxUniversalLauncher.exe to play. Emulator licenses and supporting files are retained in Emulators.\n" +
                "xemu: https://xemu.app and https://github.com/xemu-project/xemu/releases/tag/v0.8.139\n" +
                "Xenia: https://github.com/xenia-project/release-builds-windows/releases/tag/v1.0.2844-master\n" +
                "Firmware and games are supplied separately. Remove this installation folder to uninstall; your library remains in %LOCALAPPDATA%/XboxUniversalLauncher.\n", cancellation);
            cancellation.ThrowIfCancellationRequested();
            Directory.CreateDirectory(destination);
            // Network and archive validation complete before files are copied into the chosen folder.
            foreach (string file in Directory.GetFiles(staging, "*", SearchOption.AllDirectories))
            {
                string target = Path.Combine(destination, Path.GetRelativePath(staging, file));
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                File.Copy(file, target, overwrite: false);
            }
            var library = new Library(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "XboxUniversalLauncher", "library.db"));
            foreach (var emulator in installedPaths) library.SetSetting(emulator.Key, Path.Combine(destination, emulator.Value));
            progress.Report(("Installation complete. Ready to launch.", 100));
        }
        finally { Directory.Delete(staging, recursive: true); }
    }
}
