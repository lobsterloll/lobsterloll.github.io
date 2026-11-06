using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;

namespace XboxLauncher.Setup;

public sealed class SetupApp : Application
{
    [STAThread]
    public static void Main() => new SetupApp().Run(new SetupWindow());
}

public sealed class SetupWindow : Window
{
    private readonly TextBox folder = new() { Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "XboxUniversalLauncher"), Margin = new Thickness(0, 8, 0, 8) };
    private readonly CheckBox xemu = new() { Content = "Install xemu — Original Xbox", IsChecked = true, Margin = new Thickness(0, 8, 0, 8) };
    private readonly CheckBox xenia = new() { Content = "Install Xenia — Xbox 360", IsChecked = true, Margin = new Thickness(0, 8, 0, 8) };
    private readonly CheckBox launch = new() { Content = "Launch the program when installation finishes", IsChecked = true, Margin = new Thickness(0, 12, 0, 12) };
    private readonly ProgressBar progress = new() { Height = 20, Minimum = 0, Maximum = 100, Margin = new Thickness(0, 12, 0, 12) };
    private readonly TextBlock status = new() { Text = "Ready to install. Internet is required for emulator downloads.", TextWrapping = TextWrapping.Wrap };
    private readonly Button install = new() { Content = "Install", Padding = new Thickness(20, 8, 20, 8) };
    private readonly Button browse = new() { Content = "Browse…", HorizontalAlignment = HorizontalAlignment.Left };
    private readonly CancellationTokenSource cancellation = new();
    private bool installing;

    public SetupWindow()
    {
        Title = "Install Xbox Universal Launcher";
        Width = 640;
        Height = 570;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var panel = new StackPanel { Margin = new Thickness(28) };
        panel.Children.Add(new TextBlock { Text = "Install Xbox Universal Launcher", FontSize = 25, FontWeight = FontWeights.SemiBold });
        panel.Children.Add(new TextBlock { Text = "Choose an empty folder for the program and emulators.", Margin = new Thickness(0, 16, 0, 0) });
        panel.Children.Add(folder);
        panel.Children.Add(browse);
        panel.Children.Add(xemu);
        panel.Children.Add(xenia);
        panel.Children.Add(new TextBlock { Text = "Emulators download directly from their official GitHub releases. Firmware and games are not included. xemu requires additional setup in xemu before playing.", TextWrapping = TextWrapping.Wrap });
        panel.Children.Add(launch);
        panel.Children.Add(progress);
        panel.Children.Add(status);
        panel.Children.Add(install);
        Content = panel;
        browse.Click += (_, _) =>
        {
            var picker = new OpenFolderDialog { Title = "Choose installation folder" };
            if (picker.ShowDialog(this) == true) folder.Text = picker.FolderName;
        };
        install.Click += Install_Click;
        Closing += (_, e) =>
        {
            if (!installing) return;
            cancellation.Cancel();
            status.Text = "Cancelling download. Please wait…";
            e.Cancel = true;
        };
    }

    private async void Install_Click(object sender, RoutedEventArgs e)
    {
        if (cancellation.IsCancellationRequested) { Close(); return; }
        string destination = folder.Text.Trim();
        if (!Path.IsPathFullyQualified(destination)) { status.Text = "Choose a full installation folder path."; return; }
        installing = true;
        folder.IsEnabled = browse.IsEnabled = xemu.IsEnabled = xenia.IsEnabled = install.IsEnabled = false;
        try
        {
            var selected = new List<EmulatorDownload>();
            if (xemu.IsChecked == true) selected.Add(Installer.Xemu);
            if (xenia.IsChecked == true) selected.Add(Installer.Xenia);
            await Installer.InstallAsync(destination, selected, new Progress<(string Message, double Percent)>(update =>
            {
                status.Text = update.Message;
                progress.Value = update.Percent;
            }), cancellation.Token);
            installing = false;
            if (launch.IsChecked == true)
                Process.Start(new ProcessStartInfo(Path.Combine(destination, "XboxUniversalLauncher.exe")) { UseShellExecute = true, WorkingDirectory = destination })?.Dispose();
            Close();
        }
        catch (OperationCanceledException) { status.Text = "Installation cancelled. Close setup to exit."; install.Content = "Close"; }
        catch (Exception error) { status.Text = "Installation failed: " + error.Message + " Choose an empty folder and retry."; }
        finally
        {
            installing = false;
            folder.IsEnabled = browse.IsEnabled = xemu.IsEnabled = xenia.IsEnabled = install.IsEnabled = true;
        }
    }
}
