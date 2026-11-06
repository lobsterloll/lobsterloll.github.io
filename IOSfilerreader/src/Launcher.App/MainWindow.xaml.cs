using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;

namespace XboxLauncher;

public partial class MainWindow : Window
{
    private readonly Library library;
    private int selectionVersion;
    public MainWindow()
    {
        InitializeComponent();
        library = new Library(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "XboxUniversalLauncher", "library.db"));
        Games.ItemsSource = library.Load();
    }
    private async void Import_Click(object sender, RoutedEventArgs e)
    {
        var picker = new OpenFileDialog { Title = "Add Xbox games to your library", Filter = "Xbox ISO games|*.iso;*.xiso;*.img|All files|*.*", Multiselect = true };
        if (picker.ShowDialog() != true) return;
        Actions.IsEnabled = false;
        int imported = 0;
        var errors = new List<string>();
        try
        {
            foreach (string path in picker.FileNames)
            {
                Status.Text = "Inspecting " + Path.GetFileName(path) + "…";
                try
                {
                    var inspection = await Task.Run(() => DiscReader.Inspect(path));
                    library.Save(new(path, Path.GetFileNameWithoutExtension(path), inspection.Console, inspection.Format, inspection.Status));
                    imported++;
                }
                catch (Exception error) { errors.Add(Path.GetFileName(path) + ": " + error.Message); }
            }
            Games.ItemsSource = library.Load();
            Status.Text = $"Added {imported} game(s). Select a game and click Play selected. " + string.Join("\n", errors);
        }
        finally { Actions.IsEnabled = true; }
    }
    private async void Games_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        int version = ++selectionVersion;
        Files.ItemsSource = null;
        if (Games.SelectedItem is not Game game) { Details.Text = "Open an Xbox ISO to play. Xbox One / Series: unsupported."; ImagePath.Text = ""; return; }
        ImagePath.Text = game.Path;
        Details.Text = "Inspecting…";
        try
        {
            var inspection = await Task.Run(() => DiscReader.Inspect(game.Path));
            if (version != selectionVersion) return;
            Files.ItemsSource = inspection.Files;
            Details.Text = inspection.Status + $"  •  {inspection.Files.Count} entries  •  Partition offset: {inspection.PartitionOffset}";
        }
        catch (Exception error) { if (version == selectionVersion) Details.Text = error.Message; }
    }
    private void Remove_Click(object sender, RoutedEventArgs e)
    {
        if (Games.SelectedItem is not Game game) return;
        library.Remove(game.Path);
        Games.ItemsSource = library.Load();
        Status.Text = "Removed library entry. The image is still on disk.";
    }
    private void Configure_Click(object sender, RoutedEventArgs e)
    {
        var window = new Window { Title = "Emulator settings", Width = 650, Height = 410, Owner = this, WindowStartupLocation = WindowStartupLocation.CenterOwner, ResizeMode = ResizeMode.NoResize };
        var panel = new StackPanel { Margin = new Thickness(20) };
        panel.Children.Add(new TextBlock { Text = "Select your emulator executables. Configure xemu firmware in xemu itself.", TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 16) });
        foreach (string name in new[] { "xemu", "Xenia" })
        {
            var label = new TextBlock { Text = name + ": " + library.GetSetting(name), TextWrapping = TextWrapping.Wrap };
            panel.Children.Add(label);
            var button = new Button { Content = "Choose " + name + "…", HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 4, 0, 12) };
            button.Click += (_, _) =>
            {
                var picker = new OpenFileDialog { Filter = "Windows executable|*.exe", Title = "Choose " + name };
                if (picker.ShowDialog(window) != true) return;
                library.SetSetting(name, picker.FileName);
                label.Text = name + ": " + picker.FileName;
            };
            panel.Children.Add(button);
        }
        panel.Children.Add(new TextBlock { Text = "Game rendering resolution (applies on next launch)" });
        var resolution = new ComboBox { ItemsSource = new[] { "Native (1x) — best performance", "HD (2x) — sharper graphics" }, SelectedIndex = library.GetSetting("resolutionScale") == "2" ? 1 : 0, Margin = new Thickness(0, 8, 0, 8) };
        resolution.SelectionChanged += (_, _) => library.SetSetting("resolutionScale", resolution.SelectedIndex == 0 ? "1" : "2");
        panel.Children.Add(resolution);
        panel.Children.Add(new TextBlock { Text = "Close the emulator before launching again. HD increases GPU load; use Native if a game slows down or shows visual issues. Output resolution depends on the game.", TextWrapping = TextWrapping.Wrap });
        window.Content = panel;
        window.ShowDialog();
    }
    private async void Launch_Click(object sender, RoutedEventArgs e)
    {
        if (Games.SelectedItem is not Game game)
        {
            Status.Text = "Select a game from your library, or click Open ISO & Play.";
            return;
        }
        await PlayAsync(game.Path);
    }
    private async void OpenPlay_Click(object sender, RoutedEventArgs e)
    {
        var picker = new OpenFileDialog
        {
            Title = "Choose an Xbox ISO game to play",
            Filter = "Xbox ISO games|*.iso;*.xiso;*.img|All files|*.*"
        };
        if (picker.ShowDialog(this) != true) return;
        await PlayAsync(picker.FileName);
    }
    private async Task PlayAsync(string path)
    {
        Actions.IsEnabled = false;
        try
        {
            Status.Text = "Preparing " + Path.GetFileNameWithoutExtension(path) + "…";
            var inspection = await Task.Run(() => DiscReader.Inspect(path));
            if (!inspection.CanLaunch) throw new InvalidOperationException(inspection.Status);
            library.Save(new(path, Path.GetFileNameWithoutExtension(path), inspection.Console, inspection.Format, inspection.Status));
            Games.ItemsSource = library.Load();
            Games.SelectedItem = ((List<Game>)Games.ItemsSource).Find(game => game.Path.Equals(path, StringComparison.OrdinalIgnoreCase));
            string name = inspection.Console == ConsoleKind.OriginalXbox ? "xemu" : "Xenia";
            string emulator = library.GetSetting(name);
            if (!File.Exists(emulator))
            {
                MessageBox.Show(this,
                    $"This game runs through {name}. Choose your installed {name} executable in the next window. This location will be remembered." +
                    (name == "xemu" ? " Configure the firmware required by xemu in xemu before playing." : ""),
                    "Set up " + name, MessageBoxButton.OK, MessageBoxImage.Information);
                var picker = new OpenFileDialog { Title = "Choose " + name + " to run this game", Filter = "Windows executable|*.exe" };
                if (picker.ShowDialog(this) != true)
                {
                    Status.Text = $"Game added to library. Choose {name} in Emulator settings when you are ready to play.";
                    return;
                }
                emulator = picker.FileName;
                library.SetSetting(name, emulator);
            }
            int resolutionScale = library.GetSetting("resolutionScale") == "2" ? 2 : 1;
            string saveKey = name + "SaveLocation";
            string saveLocation = library.GetSetting(saveKey);
            if (string.IsNullOrEmpty(saveLocation))
                saveLocation = EmulatorAdapters.GetSaveLocation(inspection.Console, emulator);
            else if (name == "xemu" && !File.Exists(saveLocation))
                throw new IOException("Your remembered xemu configuration is missing: " + saveLocation + ". Restore it to keep using the same hard disk and game saves.");
            else if (name == "Xenia" && !Directory.Exists(saveLocation))
                throw new IOException("Your remembered Xenia save storage is missing: " + saveLocation + ". Restore this folder before playing to keep your existing saves.");
            var info = EmulatorAdapters.CreateStartInfo(inspection, path, emulator, resolutionScale, saveLocation);
            library.SetSetting(saveKey, saveLocation);
            using var process = Process.Start(info) ?? throw new InvalidOperationException("The emulator did not start.");
            Status.Text = $"Opened {Path.GetFileNameWithoutExtension(path)} in {name}. Use the game's Save / Continue menu; your save storage is remembered for next time.";
        }
        catch (Exception error) { Status.Text = "Could not launch: " + error.Message; }
        finally { Actions.IsEnabled = true; }
    }
    private void Saves_Click(object sender, RoutedEventArgs e)
    {
        string xemu = library.GetSetting("xemuSaveLocation");
        string xenia = library.GetSetting("XeniaSaveLocation");
        MessageBox.Show(this,
            "Save using the game's Save menu or autosave. Next time, choose Continue / Load using the same in-game profile. Close the emulator normally after saving.\n\n" +
            "Original Xbox: saves live inside the hard disk configured in xemu. Keep that hard disk file and this configuration:\n" + (xemu.Length == 0 ? "Location will be remembered on first play." : xemu) +
            "\n\nXbox 360: saves are organized by game and profile in Xenia's content folder (or its configured content_root). Keep this storage folder:\n" + (xenia.Length == 0 ? "Location will be remembered on first play." : xenia) +
            "\n\nRemoving a game from the library does not delete its saves. This preserves in-game saves; it does not automatically save or restore a running game's exact state.",
            "Game saves", MessageBoxButton.OK, MessageBoxImage.Information);
    }
    private void Optimize_Click(object sender, RoutedEventArgs e)
    {
        var answer = MessageBox.Show(this,
            "Performance mode uses native (1x) rendering in xemu and Xenia instead of 2x HD. This reduces graphics workload and may improve performance. The picture can look less sharp.\n\n" +
            "Game files, save data, game-speed settings and Windows settings stay unchanged. No processes are closed or caches deleted. Games limited by CPU performance or emulator compatibility may still run slowly.\n\n" +
            "Apply performance mode for future launches? Close the emulator normally and launch the game again to apply it. You can restore HD in Emulator settings.",
            "Performance optimizer", MessageBoxButton.YesNo, MessageBoxImage.Information);
        if (answer != MessageBoxResult.Yes) return;
        library.SetSetting("resolutionScale", "1");
        Status.Text = "Performance mode enabled: native (1x) rendering. Close the emulator normally, then play again. Restore HD anytime in Emulator settings.";
    }
}
